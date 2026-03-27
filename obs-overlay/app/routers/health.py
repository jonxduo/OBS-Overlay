from fastapi import APIRouter


router = APIRouter()


@router.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
