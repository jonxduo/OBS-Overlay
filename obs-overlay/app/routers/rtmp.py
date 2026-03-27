from fastapi import APIRouter

from ..events import broadcast_event
from ..rtmp_service import get_rtmp_status, start_rtmp_server, stop_rtmp_server


router = APIRouter(prefix="/api/rtmp")


@router.get("/status")
def get_status() -> dict[str, str | bool]:
    return get_rtmp_status()


@router.post("/start")
def start_server() -> dict[str, str | bool]:
    status = start_rtmp_server()
    broadcast_event("rtmp_status", status)
    return status


@router.post("/stop")
def stop_server() -> dict[str, str | bool]:
    status = stop_rtmp_server()
    broadcast_event("rtmp_status", status)
    return status
