# Sobe API (porta 8010) e web (porta 3000) em duas janelas separadas, independentes deste terminal.
# Uso: .\iniciar.ps1          (feche as janelas para parar)
$raiz = $PSScriptRoot
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$raiz\api'; .venv\Scripts\uvicorn gastos.api.main:app --port 8010"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$raiz\web'; `$env:NEXT_PUBLIC_API_URL='http://localhost:8010'; npm run dev"
Write-Host "API em http://localhost:8010  |  App em http://localhost:3000"
