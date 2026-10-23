// Task-owned loopback preview and disposable browser. Normal startup has no Rhino override.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const root = '.artifacts/m1-3c', hash = data => createHash('sha256').update(data).digest('hex');
const identity = JSON.parse(await fs.readFile(`${root}/build-identity.json`));
for (const [name, expected] of Object.entries(identity.files))
    if (hash(await fs.readFile(`${root}/build/${name}`)) !== expected) throw Error(`Changed diagnostic build: ${name}`);
for (const [name, expected] of [['adapter.js', identity.adapter], ['candidate/primary-4x.png', identity.candidate]])
    if (hash(await fs.readFile(`${root}/${name}`)) !== expected) throw Error(`Changed proof resource: ${name}`);
const port = process.env.M13C_PORT ?? '4041';
const env = { ...process.env, M13C_DIAGNOSTIC: '1', M12_BUILD_DIR: `${root}/build`, M12_PORT: port };
const server = spawn(process.execPath, ['scripts/m1/serve-power-plant-game.mjs'], { env, stdio: 'inherit' });
let game;
const stop = () => game?.kill('SIGINT');
process.on('SIGINT', stop); process.on('SIGTERM', stop);
try {
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (server.exitCode !== null) throw Error('Preview failed to bind. Choose an unused M13C_PORT.');
    const output = `${root}/${process.argv.includes('--check') ? 'check' : 'manual'}-${Date.now()}`;
    game = spawn(process.execPath, ['scripts/m1/run-power-plant-game.mjs'], { stdio: 'inherit', env: {
        ...env, M12_ORIGIN: `http://127.0.0.1:${port}`, M12_OUTPUT: `${output}/game`, M13C_OUTPUT: `${output}/capture`,
        M12_SHORT: '1', M12_DENSITY: '4', M12_CONSCRIPT: '4', M12_EXPECT_DENSITY: '4', M12_COLOR: '1',
        M14_PLAY: process.argv.includes('--check') ? '' : '1',
        M14_OUTPUT: '', M14_MENU: '', M12_REJECT: '', M12A_OUTPUT: '', M12_ZOOM_OUTPUT: '', M12_OCCLUSION: '',
        M14_EDGE_PLAY: '', M14_EDGE_OUTPUT: '', M14_FIDELITY_OUTPUT: '', M14_C_CHECKS_OUTPUT: '', M14_PRODUCTION_OUTPUT: '',
    } });
    const code = await new Promise(resolve => game.once('exit', resolve)); if (code) process.exitCode = code;
} finally {
    server.kill('SIGTERM'); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
}
