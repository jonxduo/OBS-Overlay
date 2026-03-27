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

## Creazione Overlay Theme

Un `overlay_theme` e` composto da:
- `title`
- `config_params` (schema del form nel panel)
- `html` (struttura overlay)
- `css` (stile overlay)
- `js` (logica runtime overlay)

La logica JavaScript deve esporre la funzione globale:

```javascript
function createOverlayThemeController(root, config, helpers) {
	return {
		start() {},
		stop() {},
		restart() {},
		updateConfig(next) {},
		destroy() {}
	}
}
```

### Perche` `createOverlayThemeController` e` importante

Il runtime della pagina source carica il tema e cerca questa funzione.
Se la funzione non esiste, l'overlay non ha un controller attivo e gli eventi runtime non verranno gestiti.

Parametri:
- `root`: elemento DOM root dell'overlay (dove renderizzare o cercare nodi)
- `config`: configurazione iniziale dell'overlay
- `helpers`: utility disponibili (esempio: `setText(selector, value)`)

Valore di ritorno:
- oggetto controller con metodi opzionali

### Eventi runtime: `start`, `stop`, `restart`

Dal panel, i pulsanti Start, Stop e Restart inviano un'azione runtime all'overlay.
Quando arriva un'azione, il runtime invoca il metodo omonimo del controller, se presente:
- `start()`
- `stop()`
- `restart()`

Inoltre:
- quando cambia la configurazione, viene chiamato `updateConfig(next)`
- in cleanup/unmount viene chiamato `destroy()`

Esempio minimo valido:

```javascript
function createOverlayThemeController(root, config, helpers){
	function start(){
		console.log('Start event')
	}

	function stop(){
		console.log('Stop event')
	}

	function restart(){
		console.log('Restart event')
	}

	function updateConfig(next){
		console.log('Config updated:', next)
	}

	return {
		start,
		stop,
		restart,
		updateConfig,
		destroy: function(){
			stop()
		}
	}
}
```

### Come usare `panel.json` (`config_params`) per generare i form nel panel

Il panel genera i campi dinamicamente da `config_params.fields`.
Ogni item in `fields` descrive un input.

Esempio:

```json
{
	"fields": [
		{
			"name": "title",
			"label": "Titolo",
			"type": "text",
			"default": "Hello"
		},
		{
			"name": "visible",
			"label": "Visibile",
			"type": "checkbox",
			"default": true
		},
		{
			"name": "speed",
			"label": "Velocita",
			"type": "number",
			"default": 1
		},
		{
			"name": "mode",
			"label": "Modalita",
			"type": "select",
			"options": ["A", "B", "C"]
		},
		{
			"name": "description",
			"label": "Descrizione",
			"type": "textarea",
			"rows": 4
		},
		{
			"name": "points_json",
			"label": "Punti",
			"type": "nested",
			"item": {
				"fields": [
					{ "name": "name", "label": "Nome", "type": "text" },
					{ "name": "value", "label": "Valore", "type": "number", "default": 0 }
				]
			}
		}
	]
}
```

Tipi principali supportati nel panel:
- `text`
- `number`
- `checkbox`
- `select`
- `textarea`
- `nested` (mini-form con lista di item, pulsante aggiunta e rimozione)

Best practice:
- mantenere nomi campo stabili (`name`) per compatibilita` con config salvata
- impostare `default` quando serve un valore iniziale prevedibile
- usare `nested` per strutture array di oggetti
