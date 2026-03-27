import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..events import ws_manager
from ..rtmp_service import get_rtmp_status


router = APIRouter()
_source_listener_counts: dict[int, int] = {}
_socket_source_overlay: dict[WebSocket, int] = {}


def _source_snapshot() -> dict[str, int]:
    return {str(overlay_id): count for overlay_id, count in _source_listener_counts.items() if count > 0}


async def _broadcast_source_changed(overlay_id: int) -> None:
    count = int(_source_listener_counts.get(overlay_id, 0))
    await ws_manager.broadcast(
        {
            "type": "source_listener_changed",
            "payload": {
                "overlay_id": overlay_id,
                "count": count,
                "listening": count > 0,
            },
        }
    )


async def _register_source_listener(websocket: WebSocket, overlay_id: int) -> None:
    previous = _socket_source_overlay.get(websocket)
    if previous == overlay_id:
        return

    if previous is not None:
        _source_listener_counts[previous] = max(0, _source_listener_counts.get(previous, 1) - 1)
        if _source_listener_counts[previous] == 0:
            _source_listener_counts.pop(previous, None)
        await _broadcast_source_changed(previous)

    _socket_source_overlay[websocket] = overlay_id
    _source_listener_counts[overlay_id] = _source_listener_counts.get(overlay_id, 0) + 1
    await _broadcast_source_changed(overlay_id)


async def _unregister_source_listener(websocket: WebSocket) -> None:
    overlay_id = _socket_source_overlay.pop(websocket, None)
    if overlay_id is None:
        return

    _source_listener_counts[overlay_id] = max(0, _source_listener_counts.get(overlay_id, 1) - 1)
    if _source_listener_counts[overlay_id] == 0:
        _source_listener_counts.pop(overlay_id, None)
    await _broadcast_source_changed(overlay_id)


@router.websocket("/ws")
async def websocket_events(websocket: WebSocket) -> None:
    await ws_manager.connect(websocket)
    try:
        await websocket.send_json({"type": "rtmp_status", "payload": get_rtmp_status()})
        await websocket.send_json({"type": "source_listener_snapshot", "payload": {"listeners": _source_snapshot()}})
        while True:
            raw_message = await websocket.receive_text()
            try:
                message = json.loads(raw_message)
            except Exception:
                continue

            if not isinstance(message, dict):
                continue

            msg_type = message.get("type")
            if msg_type != "source_listen":
                continue

            overlay_id = message.get("overlay_id")
            try:
                parsed_overlay_id = int(overlay_id)
            except (TypeError, ValueError):
                continue

            if parsed_overlay_id <= 0:
                continue

            await _register_source_listener(websocket, parsed_overlay_id)
    except WebSocketDisconnect:
        await _unregister_source_listener(websocket)
        ws_manager.disconnect(websocket)
    except Exception:
        await _unregister_source_listener(websocket)
        ws_manager.disconnect(websocket)
