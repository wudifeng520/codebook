[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
  [string]$Version,

  [string]$Repository = 'wudifeng520/codebook',

  [switch]$Prerelease,
  [switch]$Resume,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$DistDirectory = Join-Path $ProjectRoot 'dist'
$Tag = "v$Version"
$InstallerSource = Join-Path $DistDirectory "本地密码本-安装版-$Version-x64.exe"
$PortableSource = Join-Path $DistDirectory "本地密码本-便携版-$Version-x64.exe"
$InstallerAsset = Join-Path $DistDirectory "LocalVault-Setup-$Version-x64.exe"
$PortableAsset = Join-Path $DistDirectory "LocalVault-Portable-$Version-x64.exe"

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Get-CommandPath([string]$Name, [string]$Fallback = '') {
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($Command) { return $Command.Source }
  if ($Fallback -and (Test-Path -LiteralPath $Fallback)) { return $Fallback }
  throw "未找到命令：$Name"
}

function Invoke-External([string]$FilePath, [string[]]$Arguments) {
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "命令执行失败（退出码 $LASTEXITCODE）：$FilePath $($Arguments -join ' ')"
  }
}

function Test-ReleaseExists([string]$ReleaseTag) {
  $PreviousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $script:GhPath release view $ReleaseTag --repo $Repository *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}

Set-Location $ProjectRoot
$NpmPath = Get-CommandPath 'npm.cmd'
$GitPath = Get-CommandPath 'git.exe'
$GhPath = Get-CommandPath 'gh.exe' 'C:\Program Files\GitHub CLI\gh.exe'

Write-Step "发布前检查 $Tag"
Invoke-External $GhPath @('auth', 'status')

$Branch = (& $GitPath branch --show-current).Trim()
if ($Branch -ne 'main') { throw "当前分支是 $Branch，请切换到 main 后再发布" }

$Package = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$CurrentVersion = [string]$Package.version

if ($DryRun) {
  Write-Host "预演模式：不会修改文件、提交代码或创建 Release。" -ForegroundColor Yellow
  Write-Host "仓库：$Repository"
  Write-Host "当前版本：$CurrentVersion"
  Write-Host "目标版本：$Version"
  Write-Host "发布标签：$Tag"
  Write-Host "将执行：更新版本 → 测试打包 → 提交推送 → 创建 Release → 上传两个 EXE → 校验附件"
  exit 0
}

if (-not $Resume) {
  $Status = & $GitPath status --porcelain
  if ($Status) { throw "工作区存在未提交修改，请先提交或清理后再发布：`n$($Status -join "`n")" }
  if ($CurrentVersion -eq $Version) { throw "package.json 已是 $Version；若在继续失败的发布，请添加 -Resume" }
  if (Test-ReleaseExists $Tag) { throw "$Tag Release 已存在，请更换版本号或使用 -Resume" }

  Write-Step "更新版本号和 README"
  Invoke-External $NpmPath @('version', $Version, '--no-git-tag-version')
  $ReadmePath = Join-Path $ProjectRoot 'README.md'
  $Readme = [IO.File]::ReadAllText($ReadmePath)
  $Readme = $Readme.Replace($CurrentVersion, $Version)
  [IO.File]::WriteAllText($ReadmePath, $Readme, [Text.UTF8Encoding]::new($false))

  Write-Step '运行测试并生成安装版、便携版'
  Invoke-External $NpmPath @('run', 'dist')

  Write-Step '提交版本变更并推送 main'
  Invoke-External $GitPath @('add', 'package.json', 'package-lock.json', 'README.md')
  Invoke-External $GitPath @('commit', '-m', "release: $Tag")
  Invoke-External $GitPath @('push', 'origin', 'main')
} else {
  if ($CurrentVersion -ne $Version) {
    throw "-Resume 要求 package.json 版本为 $Version，当前是 $CurrentVersion"
  }
  Write-Host "续传模式：跳过版本修改、构建和 Git 提交。" -ForegroundColor Yellow
}

if (-not (Test-Path -LiteralPath $InstallerSource) -or -not (Test-Path -LiteralPath $PortableSource)) {
  if ($Resume) {
    Write-Step '本地构建产物缺失，重新打包'
    Invoke-External $NpmPath @('run', 'dist')
  } else {
    throw '打包完成但未找到预期的中文名 EXE 文件'
  }
}

Write-Step '准备 GitHub 兼容的英文附件名'
Copy-Item -LiteralPath $InstallerSource -Destination $InstallerAsset -Force
Copy-Item -LiteralPath $PortableSource -Destination $PortableAsset -Force

$ReleaseExists = Test-ReleaseExists $Tag
if (-not $ReleaseExists) {
  Write-Step "创建 Release $Tag"
  $CreateArguments = @(
    'release', 'create', $Tag,
    '--repo', $Repository,
    '--target', 'main',
    '--title', "本地密码本 $Tag",
    '--generate-notes'
  )
  if ($Prerelease) { $CreateArguments += '--prerelease' } else { $CreateArguments += '--latest' }
  Invoke-External $GhPath $CreateArguments
  Write-Host '等待 GitHub 上传服务同步……'
  Start-Sleep -Seconds 15
} else {
  Write-Host "$Tag Release 已存在，将覆盖同名附件。" -ForegroundColor Yellow
}

Write-Step '上传安装版'
Invoke-External $GhPath @(
  'release', 'upload', $Tag,
  "$InstallerAsset#本地密码本 $Tag 安装版",
  '--repo', $Repository,
  '--clobber'
)

Write-Step '上传便携版'
Invoke-External $GhPath @(
  'release', 'upload', $Tag,
  "$PortableAsset#本地密码本 $Tag 便携版",
  '--repo', $Repository,
  '--clobber'
)

Write-Step '校验 Release 附件'
$ReleaseJson = & $GhPath release view $Tag --repo $Repository --json 'url,assets'
if ($LASTEXITCODE -ne 0) { throw '无法读取发布结果' }
$Release = $ReleaseJson | ConvertFrom-Json
$AssetNames = @($Release.assets | ForEach-Object { $_.name })
$ExpectedNames = @(
  [IO.Path]::GetFileName($InstallerAsset),
  [IO.Path]::GetFileName($PortableAsset)
)
foreach ($ExpectedName in $ExpectedNames) {
  if ($ExpectedName -notin $AssetNames) { throw "发布校验失败：缺少附件 $ExpectedName" }
}

$InstallerHash = (Get-FileHash -LiteralPath $InstallerAsset -Algorithm SHA256).Hash
$PortableHash = (Get-FileHash -LiteralPath $PortableAsset -Algorithm SHA256).Hash

Write-Host "`n发布成功：$($Release.url)" -ForegroundColor Green
Write-Host "安装版 SHA-256：$InstallerHash"
Write-Host "便携版 SHA-256：$PortableHash"
