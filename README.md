# OBS Overlay App

Stack richiesto:
- Backend: FastAPI + SQLite
- Frontend: React (Vite)
- Desktop: Python WebView

## Struttura

- `obs-overlay/` backend FastAPI + launcher desktop
- `obs-panel/` frontend React

## Avvio locale

### 1) Backend API

```bash
cd obs-overlay
../.venv/bin/python -m pip install -r requirements.txt
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

### 2) Frontend Dev

```bash
cd obs-panel
npm install
npm run dev
```

Pagine:
- `/` principale
- `/panel` pannello OBS
- `/source/:id` sorgente con id in URL

### 3) Build frontend e serving da FastAPI

```bash
cd obs-panel
npm run build
```

Dopo la build, FastAPI serve anche l'SPA direttamente.

### 4) App desktop con WebView

```bash
cd obs-overlay
../.venv/bin/python run_desktop.py
```

## API principali

- `POST/GET/PUT/DELETE /api/overlay-themes`
- `POST/GET/PUT/DELETE /api/overlays`
- `POST/GET/PUT/DELETE /api/collections`

Entita:
- `overlay_theme`: id, title, config_params, html, css, js
- `overlay`: id, overlay_theme_id, config
- `collection`: id, title
- relazione `collection` M2M `overlay`
