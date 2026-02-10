param(
    [Parameter(Mandatory=$true)]
    [string]$Path
)

# Determine the target directory
if (Test-Path -Path $Path -PathType Container) {
    # If path is a directory, create .priority there
    $targetDir = $Path
} else {
    # If path is a file, create .priority in its parent directory
    $targetDir = Split-Path -Parent $Path
}

$priorityFile = Join-Path -Path $targetDir -ChildPath ".priority"

# Create the .priority file
try {
    New-Item -Path $priorityFile -ItemType File -Force | Out-Null
    Write-Host "Created .priority file at: $priorityFile" -ForegroundColor Green
} catch {
    Write-Host "Error creating .priority file: $_" -ForegroundColor Red
    exit 1
}
