@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -Command "Start-Process -FilePath 'C:/Users/122305/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' -ArgumentList 'scripts/analytics-preview.mjs' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden"
start "" "http://127.0.0.1:8788/admin"
