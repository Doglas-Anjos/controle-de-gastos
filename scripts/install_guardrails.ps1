# Instala gitleaks e pre-commit e ativa os hooks do repositorio. Rode uma vez por maquina.
$ErrorActionPreference = "Stop"
if (-not (Get-Command gitleaks -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando gitleaks via winget..."
    winget install --id Gitleaks.Gitleaks -e --accept-source-agreements --accept-package-agreements
}
if (-not (Get-Command pre-commit -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando pre-commit..."
    python -m pip install --user pre-commit
}
pre-commit install
Write-Host "Guardrails ativos. Teste com: pre-commit run --all-files"
