from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..events import broadcast_event
from ..models import Collection, Overlay
from ..schemas import CollectionCreate, CollectionRead, CollectionUpdate


router = APIRouter(prefix="/api/collections")


def _sync_collection_overlays(collection: Collection, overlay_ids: list[int], db: Session) -> None:
    overlays = db.query(Overlay).filter(Overlay.id.in_(overlay_ids)).all() if overlay_ids else []
    found_ids = {int(o.id) for o in overlays}
    missing = sorted(set(overlay_ids) - found_ids)
    if missing:
        raise HTTPException(status_code=400, detail=f"Overlay IDs not found: {missing}")
    collection.overlays = overlays


def _to_collection_read(collection: Collection) -> CollectionRead:
    return CollectionRead(
        id=int(collection.id),
        title=str(collection.title),
        overlay_ids=[int(o.id) for o in collection.overlays],
    )


@router.post("", response_model=CollectionRead)
def create_collection(payload: CollectionCreate, db: Session = Depends(get_db)):
    collection = Collection(title=payload.title)
    _sync_collection_overlays(collection, payload.overlay_ids, db)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    broadcast_event("collection_updated", {"id": int(collection.id)})
    return _to_collection_read(collection)


@router.get("", response_model=list[CollectionRead])
def list_collections(db: Session = Depends(get_db)):
    collections = db.query(Collection).order_by(Collection.id.desc()).all()
    return [_to_collection_read(c) for c in collections]


@router.get("/{collection_id}", response_model=CollectionRead)
def get_collection(collection_id: int, db: Session = Depends(get_db)):
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")
    return _to_collection_read(collection)


@router.put("/{collection_id}", response_model=CollectionRead)
def update_collection(collection_id: int, payload: CollectionUpdate, db: Session = Depends(get_db)):
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    collection.title = str(payload.title)
    _sync_collection_overlays(collection, payload.overlay_ids, db)
    db.commit()
    db.refresh(collection)
    broadcast_event("collection_updated", {"id": int(collection.id)})
    return _to_collection_read(collection)


@router.delete("/{collection_id}")
def delete_collection(collection_id: int, db: Session = Depends(get_db)):
    collection = db.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    deleted_id = int(collection.id)
    db.delete(collection)
    db.commit()
    broadcast_event("collection_deleted", {"id": deleted_id})
    return {"deleted": True}
