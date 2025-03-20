Write-Host "Starting deployment..."

# Run database migrations
Write-Host "Running database migrations..."
npm run migrate
if ($LASTEXITCODE -ne 0) {
    Write-Host "Database migration failed. Aborting deployment."
    exit 1
}

# Optionally, run additional environment setup tasks here

# Start the server
Write-Host "Starting the server..."
npm start

# Run Deployment on File in Powershell: .\deploy.ps1

