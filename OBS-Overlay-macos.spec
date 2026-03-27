# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules
from PyInstaller.utils.hooks import collect_all

datas = [('/Users/francescomonti/Documenti/DEV/OBS_overlay/obs-overlay/mediamtx', 'mediamtx'), ('/Users/francescomonti/Documenti/DEV/OBS_overlay/obs-panel/dist', 'obs-panel/dist')]
binaries = []
hiddenimports = ['app.main', 'uvicorn.logging', 'uvicorn.loops.auto']
hiddenimports += collect_submodules('app')
tmp_ret = collect_all('fastapi')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('starlette')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('pydantic')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('sqlalchemy')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('uvicorn')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('webview')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['/Users/francescomonti/Documenti/DEV/OBS_overlay/obs-overlay/run_desktop.py'],
    pathex=['/Users/francescomonti/Documenti/DEV/OBS_overlay/obs-overlay'],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='OBS-Overlay-macos',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['/Users/francescomonti/Documenti/DEV/OBS_overlay/assets/icons/app.icns'],
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='OBS-Overlay-macos',
)
app = BUNDLE(
    coll,
    name='OBS-Overlay-macos.app',
    icon='/Users/francescomonti/Documenti/DEV/OBS_overlay/assets/icons/app.icns',
    bundle_identifier=None,
)
