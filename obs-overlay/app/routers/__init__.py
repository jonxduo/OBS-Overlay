from .collections import router as collections_router
from .health import router as health_router
from .overlay_themes import router as overlay_themes_router
from .overlays import router as overlays_router
from .rtmp import router as rtmp_router
from .websocket import router as websocket_router

__all__ = [
    "collections_router",
    "health_router",
    "overlay_themes_router",
    "overlays_router",
    "rtmp_router",
    "websocket_router",
]
