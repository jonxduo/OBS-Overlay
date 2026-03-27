from typing import Any

from sqlalchemy import JSON, Column, ForeignKey, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

collection_overlay = Table(
    "collection_overlay",
    Base.metadata,
    Column("collection_id", ForeignKey("collections.id"), primary_key=True),
    Column("overlay_id", ForeignKey("overlays.id"), primary_key=True),
)


class OverlayTheme(Base):
    __tablename__ = "overlay_themes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    config_params: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    html: Mapped[str] = mapped_column(Text, nullable=False, default="")
    css: Mapped[str] = mapped_column(Text, nullable=False, default="")
    js: Mapped[str] = mapped_column(Text, nullable=False, default="")

    overlays: Mapped[list["Overlay"]] = relationship(
        "Overlay", back_populates="overlay_theme", cascade="all, delete-orphan"
    )


class Overlay(Base):
    __tablename__ = "overlays"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Overlay")
    overlay_theme_id: Mapped[int] = mapped_column(ForeignKey("overlay_themes.id"), nullable=False)
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    overlay_theme: Mapped["OverlayTheme"] = relationship("OverlayTheme", back_populates="overlays")
    collections: Mapped[list["Collection"]] = relationship(
        "Collection", secondary=collection_overlay, back_populates="overlays"
    )


class Collection(Base):
    __tablename__ = "collections"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    overlays: Mapped[list["Overlay"]] = relationship(
        "Overlay", secondary=collection_overlay, back_populates="collections"
    )
