from sqlalchemy import text

from .db import Base, engine


def _ensure_overlay_title_column() -> None:
    with engine.begin() as conn:
        columns = conn.execute(text("PRAGMA table_info(overlays)")).fetchall()
        column_names = {str(col[1]) for col in columns}
        if "title" not in column_names:
            conn.execute(text("ALTER TABLE overlays ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT 'Overlay'"))


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)
    _ensure_overlay_title_column()
