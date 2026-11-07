# NovaesWeb CRM AI - Redefinicao Segura de Senha do OmniRoute
param (
    [string]$NewPassword = ""
)

$container = "novaes-omniroute"
$port = 20128

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " NovaesWeb - Redefinicao Administrativa OmniRoute" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

if (-not (docker ps -q --filter "name=^/${container}$")) {
    Write-Host "[ERRO] Container $container nao esta em execucao." -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($NewPassword)) {
    $secPass = Read-Host -Prompt "Digite a nova senha para o OmniRoute" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secPass)
    $NewPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

if ([string]::IsNullOrWhiteSpace($NewPassword) -or $NewPassword.Length -lt 8) {
    Write-Host "[ERRO] A senha precisa ter pelo menos 8 caracteres." -ForegroundColor Red
    exit 1
}

$escapedPassword = $NewPassword.Replace('\', '\\').Replace("'", "\'")

$nodeScript = @"
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const newPass = '$escapedPassword';
const hash = bcrypt.hashSync(newPass, 10);
const db = new Database('/app/data/storage.sqlite');

db.prepare("UPDATE key_value SET value = ? WHERE key = 'password'").run(JSON.stringify(hash));
db.prepare("UPDATE key_value SET value = 'true' WHERE key = 'requireLogin'").run();
db.prepare("UPDATE key_value SET value = 'true' WHERE key = 'setupComplete'").run();

console.log('OK');
"@

$result = $nodeScript | docker exec -i $container node -

if ($result -match "OK") {
    Write-Host "[1/2] Hash de senha atualizado no banco de dados com sucesso." -ForegroundColor Green
    Write-Host "[2/2] Reiniciando container para aplicar nova sessao..." -ForegroundColor Cyan
    docker restart $container | Out-Null
    Write-Host "[OK] OmniRoute reiniciado com sucesso!" -ForegroundColor Green
    Write-Host "URL de Acesso: http://localhost:$port" -ForegroundColor Yellow
} else {
    Write-Host "[ERRO] Falha ao atualizar senha: $result" -ForegroundColor Red
    exit 1
}

