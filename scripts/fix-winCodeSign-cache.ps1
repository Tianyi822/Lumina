$ErrorActionPreference = "Stop"

$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
$version = "winCodeSign-2.6.0"
$zipFile = "$cacheDir\$version.7z"
$url = "https://cdn.npmmirror.com/binaries/electron-builder-binaries/$version/$version.7z"

# 清理旧缓存
Write-Host "Cleaning old cache..."
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $cacheDir
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

# 下载 winCodeSign
Write-Host "Downloading $version..."
Invoke-WebRequest -Uri $url -OutFile $zipFile -UseBasicParsing

# 找到 7za.exe
$sevenZip = "$PSScriptRoot\..\node_modules\7zip-bin\win\x64\7za.exe"
if (-not (Test-Path $sevenZip)) {
    $sevenZip = "$PSScriptRoot\..\node_modules\7zip-bin\win\ia32\7za.exe"
}
if (-not (Test-Path $sevenZip)) {
    Write-Error "7za.exe not found in node_modules"
    exit 1
}

# 用 -snl- 参数解压：把符号链接当作普通文件提取（不创建 symlink）
Write-Host "Extracting (symlinks disabled)..."
& $sevenZip x "-snl-" -bd $zipFile "-o$cacheDir"
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2) {
    # exit code 2 means there were warnings (e.g. symlink errors), which is acceptable with -snl-
    Write-Error "Extraction failed with exit code $LASTEXITCODE"
    exit 1
}

Write-Host "✅ winCodeSign cache prepared successfully!"
Write-Host "Cache location: $cacheDir\$version"
