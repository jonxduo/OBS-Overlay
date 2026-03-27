from pathlib import Path
import atexit
import platform
import shutil
import socket
import subprocess
import tarfile
import tempfile
import time
import urllib.request

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from .db import Base, engine, get_db
from .models import Collection, Overlay, OverlayTheme
from .schemas import (
    CollectionCreate,
    CollectionRead,
    CollectionUpdate,
    OverlayCreate,
    OverlayRead,
    OverlayThemeCreate,
    OverlayThemeRead,
    OverlayThemeUpdate,
    OverlayUpdate,
)

app = FastAPI(title="OBS Overlay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR.parent / "obs-panel" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"

MEDIAMTX_DIR = BASE_DIR / "mediamtx"
MEDIAMTX_BIN_DIR = MEDIAMTX_DIR / "bin"
MEDIAMTX_CONFIG = MEDIAMTX_DIR / "mediamtx.yml"
MEDIAMTX_VERSION = "1.9.3"
RTMP_STREAM_PATH = "live/obs"
_mediamtx_process: subprocess.Popen | None = None


def _ensure_overlay_title_column() -> None:
    with engine.begin() as conn:
        columns = conn.execute(text("PRAGMA table_info(overlays)")).fetchall()
        column_names = {str(col[1]) for col in columns}
        if "title" not in column_names:
            conn.execute(text("ALTER TABLE overlays ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT 'Overlay'"))


_ensure_overlay_title_column()


def _get_lan_ip() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def _download_mediamtx_binary() -> Path:
    MEDIAMTX_BIN_DIR.mkdir(parents=True, exist_ok=True)

    machine = platform.machine().lower()
    if machine in {"arm64", "aarch64"}:
        arch = "arm64"
    elif machine in {"x86_64", "amd64"}:
        arch = "amd64"
    else:
        raise RuntimeError(f"Unsupported architecture for MediaMTX: {machine}")

    if platform.system() != "Darwin":
        raise RuntimeError("Automatic MediaMTX download currently supports only macOS in this project")

    archive_name = f"mediamtx_v{MEDIAMTX_VERSION}_darwin_{arch}.tar.gz"
    download_url = f"https://github.com/bluenviron/mediamtx/releases/download/v{MEDIAMTX_VERSION}/{archive_name}"

    with tempfile.TemporaryDirectory() as tmp:
        archive_path = Path(tmp) / archive_name
        urllib.request.urlretrieve(download_url, archive_path)
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(path=MEDIAMTX_BIN_DIR)

    for candidate in [MEDIAMTX_BIN_DIR / "mediamtx", MEDIAMTX_BIN_DIR / "mtx"]:
        if candidate.exists():
            candidate.chmod(0o755)
            return candidate

    raise RuntimeError("MediaMTX binary not found after extraction")


def _resolve_mediamtx_binary() -> str:
    bundled = MEDIAMTX_BIN_DIR / "mediamtx"
    if bundled.exists():
        return str(bundled)

    from_path = shutil.which("mediamtx")
    if from_path:
        return from_path

    downloaded = _download_mediamtx_binary()
    return str(downloaded)


def _stop_mediamtx() -> None:
    global _mediamtx_process
    if _mediamtx_process is None:
        return

    if _mediamtx_process.poll() is None:
        _mediamtx_process.terminate()
        try:
            _mediamtx_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _mediamtx_process.kill()
            _mediamtx_process.wait(timeout=5)

    _mediamtx_process = None


def _is_ingest_active() -> bool:
    ffprobe_path = shutil.which("ffprobe")
    if not ffprobe_path:
        return False

    probe_url = f"rtmp://127.0.0.1:1935/{RTMP_STREAM_PATH}"
    try:
        result = subprocess.run(
            [
                ffprobe_path,
                "-v",
                "error",
                "-rw_timeout",
                "700000",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                probe_url,
            ],
            capture_output=True,
            text=True,
            timeout=1.2,
            check=False,
        )
        return result.returncode == 0 and bool(result.stdout.strip())
    except (subprocess.SubprocessError, OSError):
        return False


atexit.register(_stop_mediamtx)


def _rtmp_status() -> dict[str, str | bool]:
    running = _mediamtx_process is not None and _mediamtx_process.poll() is None
    ingest_active = _is_ingest_active() if running else False
    lan_ip = _get_lan_ip()
    ingest_server = f"rtmp://{lan_ip}:1935/live"
    stream_key = "obs"
    publish_url = f"rtmp://{lan_ip}:1935/{RTMP_STREAM_PATH}"
    return {
        "running": running,
        "rtmp_url": ingest_server,
        "rtmp_ingest_server": ingest_server,
        "rtmp_stream_key": stream_key,
        "rtmp_publish_url": publish_url,
        "rtmp_playback_url": publish_url,
        "phone_camera_publish_url": publish_url,
        "obs_source_url": publish_url,
        "ingest_active": ingest_active,
    }


@app.get("/api/rtmp/status")
def get_rtmp_status() -> dict[str, str | bool]:
    return _rtmp_status()


@app.post("/api/rtmp/start")
def start_rtmp_server() -> dict[str, str | bool]:
    global _mediamtx_process

    if _mediamtx_process is not None and _mediamtx_process.poll() is None:
        return _rtmp_status()

    binary = _resolve_mediamtx_binary()
    MEDIAMTX_DIR.mkdir(parents=True, exist_ok=True)

    _mediamtx_process = subprocess.Popen(
        [binary, str(MEDIAMTX_CONFIG)],
        cwd=str(MEDIAMTX_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(0.4)

    if _mediamtx_process.poll() is not None:
        _mediamtx_process = None
        raise HTTPException(status_code=500, detail="Unable to start MediaMTX")

    return _rtmp_status()


@app.post("/api/rtmp/stop")
def stop_rtmp_server() -> dict[str, str | bool]:
    _stop_mediamtx()
    return _rtmp_status()


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/overlay-themes", response_model=OverlayThemeRead)
def create_overlay_theme(payload: OverlayThemeCreate, db: Session = Depends(get_db)):
    theme = OverlayTheme(**payload.model_dump())
    db.add(theme)
    db.commit()
    db.refresh(theme)
    return theme


@app.get("/api/overlay-themes", response_model=list[OverlayThemeRead])
def list_overlay_themes(db: Session = Depends(get_db)):
    return db.query(OverlayTheme).order_by(OverlayTheme.id.desc()).all()


@app.get("/api/overlay-themes/{theme_id}", response_model=OverlayThemeRead)
def get_overlay_theme(theme_id: int, db: Session = Depends(get_db)):
    theme = db.get(OverlayTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Overlay theme not found")
    return theme


@app.put("/api/overlay-themes/{theme_id}", response_model=OverlayThemeRead)
def update_overlay_theme(theme_id: int, payload: OverlayThemeUpdate, db: Session = Depends(get_db)):
    theme = db.get(OverlayTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Overlay theme not found")

    for key, value in payload.model_dump().items():
        setattr(theme, key, value)

    db.commit()
    db.refresh(theme)
    return theme


@app.delete("/api/overlay-themes/{theme_id}")
def delete_overlay_theme(theme_id: int, db: Session = Depends(get_db)):
    theme = db.get(OverlayTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Overlay theme not found")

    db.delete(theme)
    db.commit()
    return {"deleted": True}


@app.post("/api/overlays", response_model=OverlayRead)
def create_overlay(payload: OverlayCreate, db: Session = Depends(get_db)):
    if db.get(OverlayTheme, payload.overlay_theme_id) is None:
        raise HTTPException(status_code=400, detail="overlay_theme_id does not exist")

    overlay = Overlay(**payload.model_dump())
    db.add(overlay)
    db.commit()
    db.refresh(overlay)
    return overlay


@app.get("/api/overlays", response_model=list[OverlayRead])
def list_overlays(db: Session = Depends(get_db)):
    return db.query(Overlay).order_by(Overlay.id.desc()).all()


@app.get("/api/overlays/{overlay_id}", response_model=OverlayRead)
def get_overlay(overlay_id: int, db: Session = Depends(get_db)):
    overlay = db.get(Overlay, overlay_id)
    if overlay is None:
        raise HTTPException(status_code=404, detail="Overlay not found")
    return overlay


@app.put("/api/overlays/{overlay_id}", response_model=OverlayRead)
def update_overlay(overlay_id: int, payload: OverlayUpdate, db: Session = Depends(get_db)):
    overlay = db.get(Overlay, overlay_id)
    if overlay is None:
        raise HTTPException(status_code=404, detail="Overlay not found")

    if db.get(OverlayTheme, payload.overlay_theme_id) is None:
        raise HTTPException(status_code=400, detail="overlay_theme_id does not exist")

    for key, value in payload.model_dump().items():
        setattr(overlay, key, value)

    db.commit()
    db.refresh(overlay)
    return overlay


@app.delete("/api/overlays/{overlay_id}")
def delete_overlay(overlay_id: int, db: Session = Depends(get_db)):
    overlay = db.get(Overlay, overlay_id)
    if overlay is None:
        raise HTTPException(status_code=404, detail="Overlay not found")

    db.delete(overlay)
    db.commit()
    return {"deleted": True}


def _sync_collection_overlays(collection: Collection, overlay_ids: list[int], db: Session) -> None:
    overlays = db.query(Overlay).filter(Overlay.id.in_(overlay_ids)).all() if overlay_ids else []
    found_ids = {int(o.id) for o in overlays}
    missing = sorted(set(overlay_ids) - found_ids)
    if missing:
        raise HTTPException(status_code=400, detail=f"Overlay IDs not found: {missing}")
    collection.overlays = overlays


@app.post("/api/collections", response_model=CollectionRead)
def create_collection(payload: CollectionCreate, db: Session = Depends(get_db)):
    collection = Collection(title=payload.title)
    _sync_collection_overlays(collection, payload.overlay_ids, db)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return CollectionRead(
        id=int(collection.id),
        title=str(collection.title),
        overlay_ids=[int(o.id) for o in collection.overlays],
    )


@app.get("/api/collections", response_model=list[CollectionRead])
def list_collections(db: Session = Depends(get_db)):
    collections = db.query(Collection).order_by(Collection.id.desc()).all()
    return [
        CollectionRead(
            id=int(c.id),
            title=str(c.title),
            overlay_ids=[int(o.id) for o in c.overlays],
        )
        for c in collections
    ]


@app.get("/api/collections/{collection_id}", response_model=CollectionRead)
def get_collection(collection_id: int, db: Session = Depends(get_db)):
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return CollectionRead(
        id=int(collection.id),
        title=str(collection.title),
        overlay_ids=[int(o.id) for o in collection.overlays],
    )


@app.put("/api/collections/{collection_id}", response_model=CollectionRead)
def update_collection(collection_id: int, payload: CollectionUpdate, db: Session = Depends(get_db)):
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    collection.title = str(payload.title)
    _sync_collection_overlays(collection, payload.overlay_ids, db)
    db.commit()
    db.refresh(collection)
    return CollectionRead(
        id=int(collection.id),
        title=str(collection.title),
        overlay_ids=[int(o.id) for o in collection.overlays],
    )


@app.delete("/api/collections/{collection_id}")
def delete_collection(collection_id: int, db: Session = Depends(get_db)):
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    db.delete(collection)
    db.commit()
    return {"deleted": True}


if FRONTEND_ASSETS.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_ASSETS), name="assets")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if full_path.startswith("api"):
        raise HTTPException(status_code=404, detail="Not found")

    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return {
        "message": "Frontend not built. Run npm install && npm run build inside obs-panel.",
    }
