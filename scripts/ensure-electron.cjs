// Makes sure the Electron runtime is downloaded before launching the desktop app.
// Some npm/Node setups skip or silently break Electron's own install step; this fixes that
// by downloading the official release zip from GitHub and unpacking it where Electron expects it.
const fs = require('fs');
const os = require('os');
const path = require('path');

const electronDir = path.dirname(require.resolve('electron/package.json'));
const { version } = require(path.join(electronDir, 'package.json'));

const EXE = {
  win32: 'electron.exe',
  darwin: 'Electron.app/Contents/MacOS/Electron',
  linux: 'electron',
}[process.platform];

const distDir = path.join(electronDir, 'dist');
const pathTxt = path.join(electronDir, 'path.txt');

function installed() {
  return fs.existsSync(pathTxt) && EXE && fs.existsSync(path.join(distDir, EXE));
}

async function main() {
  if (installed()) return;
  if (!EXE) throw new Error(`Unsupported platform: ${process.platform}`);

  const file = `electron-v${version}-${process.platform}-${process.arch}.zip`;
  const url = `https://github.com/electron/electron/releases/download/v${version}/${file}`;
  console.log(`[cyberdeck] Electron runtime missing. Downloading ${file} ...`);

  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  const zipPath = path.join(os.tmpdir(), file);
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

  const extract = require(require.resolve('extract-zip', { paths: [electronDir] }));
  fs.rmSync(distDir, { recursive: true, force: true });
  await extract(zipPath, { dir: distDir });
  fs.writeFileSync(pathTxt, EXE);
  fs.rmSync(zipPath, { force: true });

  if (!installed()) throw new Error('Electron download finished but the executable was not found.');
  console.log('[cyberdeck] Electron runtime installed.');
}

main().catch((err) => {
  console.error(`[cyberdeck] ${err.message}`);
  console.error('[cyberdeck] You can still play in the browser with: npm run dev');
  process.exit(1);
});
