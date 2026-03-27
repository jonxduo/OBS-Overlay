from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class OverlayThemeBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    config_params: dict[str, Any] = Field(default_factory=dict)
    html: str = ""
    css: str = ""
    js: str = ""


class OverlayThemeCreate(OverlayThemeBase):
    pass


class OverlayThemeUpdate(OverlayThemeBase):
    pass


class OverlayThemeRead(OverlayThemeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class OverlayBase(BaseModel):
    title: str = Field(default="Overlay", min_length=1, max_length=255)
    overlay_theme_id: int
    config: dict[str, Any] = Field(default_factory=dict)


class OverlayCreate(OverlayBase):
    pass


class OverlayUpdate(OverlayBase):
    pass


class OverlayRead(OverlayBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class CollectionBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)


class CollectionCreate(CollectionBase):
    overlay_ids: list[int] = Field(default_factory=list)


class CollectionUpdate(CollectionBase):
    overlay_ids: list[int] = Field(default_factory=list)


class CollectionRead(CollectionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    overlay_ids: list[int]
