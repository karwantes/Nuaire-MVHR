# Builds vscconv.exe: one file, Python and i2clog.so inside, asks for admin when started.
# Needs Python 3 and PyInstaller (pip install pyinstaller). Put a built i2clog.so
# (logger/build.sh) next to vscconv.py first.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path i2clog.so)) { throw 'i2clog.so missing, build it with logger/build.sh' }
$ErrorActionPreference = 'Continue'  # PyInstaller logs to stderr
python -m PyInstaller --onefile --console --uac-admin --name vscconv `
    --add-data "..\i2clog.so;." --distpath dist --workpath build --specpath build vscconv.py 2>&1 | Out-Host
if ($LASTEXITCODE) { throw "PyInstaller failed ($LASTEXITCODE)" }
Get-FileHash dist\vscconv.exe -Algorithm SHA256
