from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .bootstrap import initialize_database
from .events import register_event_lifecycle
from .routers import (
    collections_router,
    health_router,
    overlay_themes_router,
    overlays_router,
    rtmp_router,
    websocket_router,
)

app = FastAPI(title="OBS Overlay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

initialize_database()
register_event_lifecycle(app)

app.include_router(health_router)
app.include_router(rtmp_router)
app.include_router(websocket_router)
app.include_router(overlay_themes_router)
app.include_router(overlays_router)
app.include_router(collections_router)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR.parent / "obs-panel" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"
FRONTEND_ASSETS = FRONTEND_DIST / "assets"


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
