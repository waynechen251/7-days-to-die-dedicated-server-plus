param(
    [string]$jsonPath,
    [string]$webPort,
    [string]$game_serverIp,
    [string]$game_serverPort,
    [string]$game_serverTelnetPort,
    [string]$game_serverTelnetPassword
)

$OutputEncoding = [System.Text.Encoding]::UTF8

$userName = $env:USERNAME
$savePath = "C:\Users\$userName\AppData\Roaming\7DaysToDie\Saves"

$json = @{}

if (Test-Path $jsonPath) {
    try {
        $json = Get-Content $jsonPath -Raw | ConvertFrom-Json -ErrorAction Stop
        if (-not $json) {
            $json = @{}
        }
    } catch {
        $json = @{}
    }
}

if (-not $json.web) { $json.web = @{} }
if (-not $json.game_server) { $json.game_server = @{} }

if ($webPort) { $json.web.port = $webPort }
if ($game_serverIp) { $json.game_server.ip = $game_serverIp }
if ($game_serverPort) { $json.game_server.port = $game_serverPort }
if ($game_serverTelnetPort) { $json.game_server.telnetPort = $game_serverTelnetPort }
if ($game_serverTelnetPassword) { $json.game_server.telnetPassword = $game_serverTelnetPassword }

$json.game_server.saves = $savePath

$json | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonPath -Encoding utf8 -NoNewline

Write-Host "$jsonPath"
