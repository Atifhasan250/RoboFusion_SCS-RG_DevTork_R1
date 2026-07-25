param([Parameter(Mandatory=$true)][string]$InputPath)
mongorestore --uri $env:MONGODB_URI --db $env:MONGODB_DB "$InputPath/$env:MONGODB_DB"
Write-Host "Restore complete. Run npm run db:integrity:check before serving traffic."
