param(
    [string]$OutputPath = "./backups"
)

# Ensure the output directory exists
New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

# Create a timestamped archive name
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$archiveName = "$OutputPath\robofusion_backup_$timestamp.gz"

# Run mongodump with gzip and archive
mongodump --uri $env:MONGODB_URI --db $env:MONGODB_DB --archive=$archiveName --gzip

Write-Host "Backup created at $archiveName"

# Delete backups older than 7 days
$limit = (Get-Date).AddDays(-7)
Get-ChildItem -Path $OutputPath -Filter "robofusion_backup_*.gz" | Where-Object { $_.CreationTime -lt $limit } | Remove-Item -Force

Write-Host "Cleaned up backups older than 7 days."
