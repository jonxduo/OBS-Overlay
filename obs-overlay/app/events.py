import asyncio

from fastapi import FastAPI, WebSocket


_app_loop: asyncio.AbstractEventLoop | None = None


class WebSocketManager:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, message: dict) -> None:
        disconnected: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)


ws_manager = WebSocketManager()


async def _broadcast_event(event_type: str, payload: dict | None = None) -> None:
    await ws_manager.broadcast({"type": event_type, "payload": payload or {}})


def broadcast_event(event_type: str, payload: dict | None = None) -> None:
    if _app_loop is None or not _app_loop.is_running():
        return
    asyncio.run_coroutine_threadsafe(_broadcast_event(event_type, payload), _app_loop)


def register_event_lifecycle(app: FastAPI) -> None:
    @app.on_event("startup")
    async def on_startup() -> None:
        global _app_loop
        _app_loop = asyncio.get_running_loop()

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        global _app_loop
        _app_loop = None
