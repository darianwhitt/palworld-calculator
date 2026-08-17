@echo off
cd /d "%~dp0"
echo Starting Palworld Crafting Calculator server...
start "Palworld Crafting Calculator - server (close this window to stop)" cmd /k python -m http.server 8420
timeout /t 1 /nobreak >nul
start "" http://localhost:8420/web/index.html
