param(
    [string]$jsonPath,
    [string]$webPort
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

$json.game_server.saves = $savePath

$json | ConvertTo-Json -Depth 5 | Out-File -FilePath $jsonPath -Encoding utf8 -NoNewline

Write-Host "$jsonPath"
