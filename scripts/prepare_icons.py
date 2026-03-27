#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_ICON = PROJECT_ROOT / "icon.png"
ICONS_DIR = PROJECT_ROOT / "assets" / "icons"


def _square_icon(image: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    src = image.copy()
    src.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - src.width) // 2
    y = (size - src.height) // 2
    canvas.paste(src, (x, y), src)
    return canvas


def _build_icns(base_image: Image.Image, output_file: Path) -> None:
    iconutil = shutil.which("iconutil")
    if not iconutil:
        raise RuntimeError("iconutil non trovato: genera app.icns su macOS o installa strumenti equivalenti")

    iconset_map = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }

    with tempfile.TemporaryDirectory() as tmp_dir:
        iconset_dir = Path(tmp_dir) / "AppIcon.iconset"
        iconset_dir.mkdir(parents=True, exist_ok=True)
        for filename, size in iconset_map.items():
            _square_icon(base_image, size).save(iconset_dir / filename, format="PNG")

        subprocess.run(
            [iconutil, "-c", "icns", str(iconset_dir), "-o", str(output_file)],
            check=True,
        )


def prepare_icons() -> None:
    if not SOURCE_ICON.exists():
        raise RuntimeError(f"File icona sorgente non trovato: {SOURCE_ICON}")

    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    base = Image.open(SOURCE_ICON).convert("RGBA")

    linux_png = ICONS_DIR / "app.png"
    _square_icon(base, 1024).save(linux_png, format="PNG")

    ico_file = ICONS_DIR / "app.ico"
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    _square_icon(base, 256).save(ico_file, format="ICO", sizes=ico_sizes)

    icns_file = ICONS_DIR / "app.icns"
    _build_icns(base, icns_file)

    print(f"Icone generate in: {ICONS_DIR}")
    print(f"- {linux_png.name}")
    print(f"- {ico_file.name}")
    print(f"- {icns_file.name}")


if __name__ == "__main__":
    prepare_icons()
