// Makes sure the Electron runtime is downloaded before launching the desktop app.
// Some npm/Node setups skip or silently break Electron's own install step; this fixes that
// by downloading the official release zip from GitHub and unpacking it where Electron expects it.
//
// Windows: the download and unzip run through PowerShell (Invoke-WebRequest + Expand-Archive),
// because on some Node versions an in-process download can end without finishing or erroring.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const electronDir = path.dirname(require.resolve('electron/package.json'));
const { version } = require(path.join(electronDir, 'package.json'));

const EXE = {
  win32: 'electron.exe',
  darwin: 'Electron.app/Contents/MacOS/Electron',
  linux: 'electron',
}[process.platform];

const distDir = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');
const file = `electron-v${version}-${process.platform}-${process.arch}.zip`;
const url = `https://github.com/electron/electron/releases/download/v${version}/${file}`;
const zipPath = path.join(os.tmpdir(), file);

let finished = false;

function installed() {
  return fs.existsSync(pathTxt) && EXE && fs.existsSync(path.join(distDir, EXE));
}

function fail(message) {
  console.error(`[cyberdeck] ${message}`);
  console.error(`[cyberdeck] Manual fix: download ${url}`);
  console.error(`[cyberdeck]   unzip it into ${distDir}`);
  console.error(`[cyberdeck]   and create ${pathTxt} containing: ${EXE}`);
  console.error('[cyberdeck] You can still play in the browser with: npm run dev');
  process.exit(1);
}

// If the event loop empties before we are done, a download was dropped silently: report it.
process.on('beforeExit', () => {
  if (!finished) fail('The download stopped without finishing.');
});

function downloadWithPowerShell() {
  const ps = (s) => s.replace(/'/g, "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    '[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12',
    `Invoke-WebRequest -UseBasicParsing -Uri '${ps(url)}' -OutFile '${ps(zipPath)}'`,
    `if (Test-Path '${ps(distDir)}') { Remove-Item -Recurse -Force '${ps(distDir)}' }`,
    `Expand-Archive -Path '${ps(zipPath)}' -DestinationPath '${ps(distDir)}' -Force`,
  ].join('; ');
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { stdio: 'inherit' });
}

async function downloadWithNode() {
  const keepAlive = setInterval(() => {}, 1000); // keep the process alive while the download runs
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    const extract = require(require.resolve('extract-zip', { paths: [electronDir] }));
    fs.rmSync(distDir, { recursive: true, force: true });
    await extract(zipPath, { dir: distDir });
  } finally {
    clearInterval(keepAlive);
  }
}

async function main() {
  if (installed()) { finished = true; return; }
  if (!EXE) throw new Error(`Unsupported platform: ${process.platform}`);

  console.log(`[cyberdeck] Electron runtime missing. Downloading ${file} (about 100 MB) ...`);
  if (process.platform === 'win32') downloadWithPowerShell();
  else await downloadWithNode();

  fs.writeFileSync(pathTxt, EXE);
  fs.rmSync(zipPath, { force: true });
  if (!installed()) throw new Error('Download finished but the Electron executable was not found.');
  finished = true;
  console.log('[cyberdeck] Electron runtime installed.');
}

main().catch((err) => fail(`Could not install Electron: ${err.message}`));
