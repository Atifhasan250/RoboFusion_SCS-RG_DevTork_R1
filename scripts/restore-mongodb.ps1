param(
    [Parameter(Mandatory=$true)][string]$InputPath,
    [switch]$Drop
)

$dropFlag = if ($Drop) { "--drop" } else { "" }

Write-Host "Restoring database from archive: $InputPath"
mongorestore --uri $env:MONGODB_URI $dropFlag --archive="$InputPath" --gzip

Write-Host "Restore complete. Run npm run db:integrity:check before serving traffic."
