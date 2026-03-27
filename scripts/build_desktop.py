#!/usr/bin/env python3
from __future__ import annotations

import argparse
import platform
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "obs-panel"
BACKEND_DIR = PROJECT_ROOT / "obs-overlay"
ENTRYPOINT = BACKEND_DIR / "run_desktop.py"


def detect_target() -> str:
    system = platform.system().lower()
    if system == "darwin":
        return "macos"
    if system == "linux":
        return "linux"
    if system == "windows":
        return "windows"
    raise RuntimeError(f"Unsupported host OS: {system}")


def run(cmd: list[str], cwd: Path) -> None:
    subprocess.run(cmd, cwd=str(cwd), check=True)


def build(target: str) -> None:
    host_target = detect_target()
    if target != host_target:
        raise RuntimeError(
            f"Cross-build non supportata localmente: host={host_target}, target={target}. "
            "Esegui la build sul sistema target (o in CI su runner del target)."
        )

    # Build frontend assets served by FastAPI.
    run(["npm", "run", "build"], cwd=FRONTEND_DIR)

    # Ensure build tooling is available in current python env.
    run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "pyinstaller"], cwd=BACKEND_DIR)

    data_sep = ";" if target == "windows" else ":"
    add_data = [
        f"{BACKEND_DIR / 'mediamtx'}{data_sep}mediamtx",
        f"{FRONTEND_DIR / 'dist'}{data_sep}obs-panel/dist",
    ]

    output_dir = PROJECT_ROOT / "dist" / target
    work_dir = PROJECT_ROOT / "build" / "pyinstaller" / target
    name = f"OBS-Overlay-{target}"

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onedir",
        "--windowed",
        "--name",
        name,
        "--distpath",
        str(output_dir),
        "--workpath",
        str(work_dir),
        "--paths",
        str(BACKEND_DIR),
        "--hidden-import",
        "app.main",
        "--collect-submodules",
        "app",
        "--hidden-import",
        "uvicorn.logging",
        "--hidden-import",
        "uvicorn.loops.auto",
        "--collect-all",
        "fastapi",
        "--collect-all",
        "starlette",
        "--collect-all",
        "pydantic",
        "--collect-all",
        "sqlalchemy",
        "--collect-all",
        "uvicorn",
        "--collect-all",
        "webview",
    ]

    for item in add_data:
        cmd.extend(["--add-data", item])

    cmd.append(str(ENTRYPOINT))
    run(cmd, cwd=PROJECT_ROOT)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build desktop executable for selected OS")
    parser.add_argument("--target", choices=["macos", "windows", "linux"], required=True)
    args = parser.parse_args()

    try:
        build(args.target)
        print(f"Build completata: dist/{args.target}/")
    except subprocess.CalledProcessError as err:
        print(f"Errore comando (exit {err.returncode}): {err.cmd}", file=sys.stderr)
        raise SystemExit(err.returncode)
    except Exception as err:
        print(f"Errore build: {err}", file=sys.stderr)
        raise SystemExit(1)
