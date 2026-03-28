'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const isWin = process.platform === 'win32';

/** macOS: üç platform tek komutta. Windows’ta .AppImage için Linux araçları yok; Linux’ta Windows için Wine gerekir. */
const targets =
  process.platform === 'darwin'
    ? ['--win', '--mac', '--linux']
    : process.platform === 'win32'
      ? ['--win']
      : ['--linux'];

const r = spawnSync(isWin ? 'npx.cmd' : 'npx', ['electron-builder', ...targets], {
  stdio: 'inherit',
  shell: true,
  cwd: root,
  env: process.env,
});

process.exit(r.status === 0 ? 0 : r.status === null ? 1 : r.status);
