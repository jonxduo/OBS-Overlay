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

from fastapi import HTTPException


BASE_DIR = Path(__file__).resolve().parent.parent
MEDIAMTX_DIR = BASE_DIR / "mediamtx"
MEDIAMTX_BIN_DIR = MEDIAMTX_DIR / "bin"
MEDIAMTX_CONFIG = MEDIAMTX_DIR / "mediamtx.yml"
MEDIAMTX_VERSION = "1.9.3"
RTMP_STREAM_PATH = "live/obs"
_mediamtx_process: subprocess.Popen | None = None


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
            for member in tar.getmembers():
                member_path = MEDIAMTX_BIN_DIR / member.name
                if not member_path.resolve().is_relative_to(MEDIAMTX_BIN_DIR.resolve()):
                    raise RuntimeError("Unsafe path found in MediaMTX archive")
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


def get_rtmp_status() -> dict[str, str | bool]:
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


def start_rtmp_server() -> dict[str, str | bool]:
    global _mediamtx_process

    if _mediamtx_process is not None and _mediamtx_process.poll() is None:
        return get_rtmp_status()

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

    return get_rtmp_status()


def stop_rtmp_server() -> dict[str, str | bool]:
    _stop_mediamtx()
    return get_rtmp_status()


atexit.register(_stop_mediamtx)
