import atexit
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import webview


HOST = "127.0.0.1"
PORT = 8000
APP_DIR = Path(__file__).resolve().parent
api_process: subprocess.Popen | None = None


def _api_url(path: str) -> str:
    return f"http://{HOST}:{PORT}{path}"


def _stop_mediamtx_via_api() -> None:
    request = urllib.request.Request(_api_url("/api/rtmp/stop"), method="POST")
    try:
        with urllib.request.urlopen(request, timeout=1.5):
            pass
    except Exception:
        # Backend may already be shutting down; ignore best-effort stop failures.
        pass


def _start_api() -> None:
    global api_process
    api_process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            HOST,
            "--port",
            str(PORT),
        ],
        cwd=str(APP_DIR),
    )


def _stop_api() -> None:
    global api_process
    if api_process is None:
        return

    _stop_mediamtx_via_api()

    if api_process.poll() is None:
        api_process.terminate()
        try:
            api_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            api_process.kill()
            api_process.wait(timeout=5)

    api_process = None


def _handle_exit_signal(_signum, _frame) -> None:
    _stop_api()
    raise SystemExit(0)


def main() -> None:
    atexit.register(_stop_api)
    signal.signal(signal.SIGINT, _handle_exit_signal)
    signal.signal(signal.SIGTERM, _handle_exit_signal)

    _start_api()

    # Give the backend a moment to start before opening the desktop window.
    time.sleep(1.0)
    window = webview.create_window("OBS Overlay", f"http://{HOST}:{PORT}", width=1280, height=800)
    window.events.closed += _stop_api
    webview.start()
    _stop_api()


if __name__ == "__main__":
    main()
