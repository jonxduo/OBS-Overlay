from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..events import broadcast_event
from ..models import Overlay, OverlayTheme
from ..schemas import OverlayCreate, OverlayRead, OverlayUpdate


router = APIRouter(prefix="/api/overlays")


@router.post("", response_model=OverlayRead)
def create_overlay(payload: OverlayCreate, db: Session = Depends(get_db)):
    if db.get(OverlayTheme, payload.overlay_theme_id) is None:
        raise HTTPException(status_code=400, detail="overlay_theme_id does not exist")

    overlay = Overlay(**payload.model_dump())
    db.add(overlay)
    db.commit()
    db.refresh(overlay)
    broadcast_event("overlay_created", {"id": int(overlay.id), "overlay_theme_id": int(overlay.overlay_theme_id)})
    return overlay


@router.get("", response_model=list[OverlayRead])
def list_overlays(db: Session = Depends(get_db)):
    return db.query(Overlay).order_by(Overlay.id.desc()).all()


@router.get("/{overlay_id}", response_model=OverlayRead)
def get_overlay(overlay_id: int, db: Session = Depends(get_db)):
    overlay = db.get(Overlay, overlay_id)
    if overlay is None:
        raise HTTPException(status_code=404, detail="Overlay not found")
    return overlay


@router.put("/{overlay_id}", response_model=OverlayRead)
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
    broadcast_event("overlay_updated", {"id": int(overlay.id), "overlay_theme_id": int(overlay.overlay_theme_id)})
    return overlay


@router.delete("/{overlay_id}")
def delete_overlay(overlay_id: int, db: Session = Depends(get_db)):
    overlay = db.get(Overlay, overlay_id)
    if overlay is None:
        raise HTTPException(status_code=404, detail="Overlay not found")

    deleted_id = int(overlay.id)
    db.delete(overlay)
    db.commit()
    broadcast_event("overlay_deleted", {"id": deleted_id})
    return {"deleted": True}
