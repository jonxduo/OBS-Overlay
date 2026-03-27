import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[1] / "obs_overlay.db"

HTML = """<div class=\"timer-wrap\"><span id=\"timer-h\">00</span><span>:</span><span id=\"timer-m\">00</span><span>:</span><span id=\"timer-s\">00</span></div>"""
CSS = """.timer-wrap{display:flex;gap:8px;align-items:center;justify-content:center;width:100vw;height:100vh;font-family:\"Space Grotesk\",\"Segoe UI\",sans-serif;font-size:72px;font-weight:700;color:#ffffff;background:transparent;text-shadow:0 0 12px rgba(0,0,0,.6);}#timer-h,#timer-m,#timer-s{min-width:80px;text-align:center;}"""
JS = """function createOverlayThemeController(root, config, helpers){
  let intervalId = null;
  let currentConfig = {...(config || {})};
  let remaining = 0;

  function clamp(n){
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  function readDuration(cfg){
    const h = clamp(Number(cfg.hours ?? 0));
    const m = clamp(Number(cfg.minutes ?? 0));
    const s = clamp(Number(cfg.seconds ?? 0));
    return h * 3600 + m * 60 + s;
  }

  function pad(v){
    return String(v).padStart(2, '0');
  }

  function render(){
    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = Math.floor(remaining % 60);
    helpers.setText('#timer-h', pad(h));
    helpers.setText('#timer-m', pad(m));
    helpers.setText('#timer-s', pad(s));
  }

  function start(){
    if(intervalId) return;
    intervalId = setInterval(() => {
      if(remaining <= 0){
        stop();
        return;
      }
      remaining -= 1;
      render();
    }, 1000);
  }

  function stop(){
    if(intervalId){
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function restart(){
    stop();
    remaining = readDuration(currentConfig);
    render();
    start();
  }

  function updateConfig(next){
    currentConfig = {...(next || {})};
    if(!intervalId){
      remaining = readDuration(currentConfig);
      render();
    }
  }

  remaining = readDuration(currentConfig);
  render();

  return { start, stop, restart, updateConfig, destroy: stop };
}"""
CONFIG_PARAMS = (
    '{"fields":[{"name":"hours","label":"Ore","type":"number","required":true,"default":0},'
    '{"name":"minutes","label":"Minuti","type":"number","required":true,"default":1},'
    '{"name":"seconds","label":"Secondi","type":"number","required":true,"default":30}]}'
)

conn = sqlite3.connect(DB_PATH)
conn.execute(
    """
    INSERT INTO overlay_themes (id, title, config_params, html, css, js)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      config_params=excluded.config_params,
      html=excluded.html,
      css=excluded.css,
      js=excluded.js
    """,
    (2, "timer", CONFIG_PARAMS, HTML, CSS, JS),
)
conn.commit()
row = conn.execute(
    "SELECT id, title, LENGTH(html), LENGTH(css), LENGTH(js) FROM overlay_themes WHERE id = 2"
).fetchone()
print({"theme_2": row})
conn.close()
