param(
  [string]$jsonPath,
  [string]$webPort
)

$OutputEncoding = [System.Text.Encoding]::UTF8
$userName = $env:USERNAME

# 讀檔或建立空物件
$json = @{}
if (Test-Path -LiteralPath $jsonPath) {
  try {
    $raw = Get-Content -LiteralPath $jsonPath -Raw -Encoding UTF8
    if ($raw) { $json = $raw | ConvertFrom-Json -ErrorAction Stop } else { $json = @{} }
  } catch { $json = @{} }
}

# 小工具：只有在「屬性不存在」時才新增（存在就不動）
function Add-PropIfMissing {
  param(
    [Parameter(Mandatory=$true)] [psobject] $Object,
    [Parameter(Mandatory=$true)] [string]   $Name,
    [Parameter(Mandatory=$true)]            $Value
  )
  if (
    -not ($Object.PSObject.Properties.Name -contains $Name) -or
    ($null -eq $Object.$Name) -or
    ($Object.$Name -eq '')) {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
  }
}

# 確保節點存在（僅在缺少時建立）
if (-not $json) { $json = [pscustomobject]@{} }
Add-PropIfMissing -Object $json -Name 'web'         -Value ([pscustomobject]@{})
Add-PropIfMissing -Object $json -Name 'game_server' -Value ([pscustomobject]@{})

if ($webPort) {
  $json.web.port = [int]$webPort
}
$json.web.installUser = $userName

# 輸出
$json | ConvertTo-Json -Depth 100 | Out-File -FilePath $jsonPath -Encoding utf8 -NoNewline

Write-Host $jsonPath
