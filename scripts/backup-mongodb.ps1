param([string]$OutputPath = "./backups")
New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null
mongodump --uri $env:MONGODB_URI --db $env:MONGODB_DB --out $OutputPath
Write-Host "Backup created at $OutputPath"
