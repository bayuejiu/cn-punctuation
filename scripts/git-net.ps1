<#
.SYNOPSIS
    Run git commands through a local proxy when it is available, otherwise connect directly.

.DESCRIPTION
    If the proxy port is listening, git runs with http.proxy set; if the proxy is
    not running, git runs with the proxy disabled. No manual config changes needed.

.EXAMPLE
    .\scripts\git-net.ps1 push

.EXAMPLE
    .\scripts\git-net.ps1 pull --rebase

.EXAMPLE
    .\scripts\git-net.ps1 status
#>
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$GitArgs
)

# Override the proxy port with $env:GIT_PROXY_PORT when needed.
$ProxyPort = if ($env:GIT_PROXY_PORT) { [int]$env:GIT_PROXY_PORT } else { 7897 }

if (-not $GitArgs) {
    Write-Host "Usage: .\scripts\git-net.ps1 <git-subcommand> [args...]" -ForegroundColor Yellow
    exit 1
}

$proxyAvailable = $false
$client = New-Object System.Net.Sockets.TcpClient
try {
    $result = $client.BeginConnect('127.0.0.1', $ProxyPort, $null, $null)
    $proxyAvailable = $result.AsyncWaitHandle.WaitOne(300)
} catch {
    $proxyAvailable = $false
} finally {
    $client.Close()
}

if ($proxyAvailable) {
    Write-Host "[git-net] proxy 127.0.0.1:$ProxyPort is up, using proxy" -ForegroundColor DarkGray
    & git -c "http.proxy=http://127.0.0.1:$ProxyPort" @GitArgs
} else {
    Write-Host "[git-net] proxy is down, using direct connection" -ForegroundColor DarkGray
    & git -c "http.proxy=" @GitArgs
}

exit $LASTEXITCODE
