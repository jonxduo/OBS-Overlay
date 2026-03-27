from pathlib import Path
import subprocess
import sys


def main() -> None:
    project_root = Path(__file__).resolve().parent
    app_dir = project_root / "obs-overlay"
    launcher = app_dir / "run_desktop.py"
    subprocess.run([sys.executable, str(launcher)], cwd=str(app_dir), check=False)


if __name__ == "__main__":
    main()
