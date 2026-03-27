from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..events import broadcast_event
from ..models import OverlayTheme
from ..schemas import OverlayThemeCreate, OverlayThemeRead, OverlayThemeUpdate


router = APIRouter(prefix="/api/overlay-themes")


@router.post("", response_model=OverlayThemeRead)
def create_overlay_theme(payload: OverlayThemeCreate, db: Session = Depends(get_db)):
    theme = OverlayTheme(**payload.model_dump())
    db.add(theme)
    db.commit()
    db.refresh(theme)
    broadcast_event("overlay_theme_created", {"id": int(theme.id)})
    return theme


@router.get("", response_model=list[OverlayThemeRead])
def list_overlay_themes(db: Session = Depends(get_db)):
    return db.query(OverlayTheme).order_by(OverlayTheme.id.desc()).all()


@router.get("/{theme_id}", response_model=OverlayThemeRead)
def get_overlay_theme(theme_id: int, db: Session = Depends(get_db)):
    theme = db.get(OverlayTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Overlay theme not found")
    return theme


@router.put("/{theme_id}", response_model=OverlayThemeRead)
def update_overlay_theme(theme_id: int, payload: OverlayThemeUpdate, db: Session = Depends(get_db)):
    theme = db.get(OverlayTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Overlay theme not found")

    for key, value in payload.model_dump().items():
        setattr(theme, key, value)

    db.commit()
    db.refresh(theme)
    broadcast_event("overlay_theme_updated", {"id": int(theme.id)})
    return theme


@router.delete("/{theme_id}")
def delete_overlay_theme(theme_id: int, db: Session = Depends(get_db)):
    theme = db.get(OverlayTheme, theme_id)
    if theme is None:
        raise HTTPException(status_code=404, detail="Overlay theme not found")

    deleted_id = int(theme.id)
    db.delete(theme)
    db.commit()
    broadcast_event("overlay_theme_deleted", {"id": deleted_id})
    return {"deleted": True}
