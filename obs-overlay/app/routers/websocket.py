from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..events import ws_manager
from ..rtmp_service import get_rtmp_status


router = APIRouter()


@router.websocket("/ws")
async def websocket_events(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        await websocket.send_json({"type": "rtmp_status", "payload": get_rtmp_status()})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
