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

Import Overlay Themes (Home):
- La sezione `Overlay Themes` in Home accetta import da file `.json` o `.zip`.
- Se il file e` un `.json`, deve contenere almeno i campi `config_params`, `html`, `css`, `js` (con `title` opzionale).
- Se il file e` uno `.zip`, deve contenere questi file:
	- `panel.json`
	- `index.html`
	- `style.css`
	- `functions.js`
- In import da ZIP, il frontend:
	- crea un nuovo `overlay_theme`
	- imposta il titolo con il nome del file ZIP senza estensione
	- valida e carica `panel.json` in `config_params`
	- valida e carica `index.html` in `html`
	- valida e carica `style.css` in `css`
	- valida e carica `functions.js` in `js`

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
