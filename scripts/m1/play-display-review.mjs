import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const identity = JSON.parse(await fs.readFile('.artifacts/m1-4/build-identity.json', 'utf8'));
for (const [name, expected] of Object.entries(identity.files)) {
    const hash = createHash('sha256').update(await fs.readFile(`.artifacts/m1-4/build/${name}`)).digest('hex');
    if (hash !== expected) throw Error(`M1.4 build identity mismatch: ${name}`);
}
const port = process.env.M14_PORT ?? '4034';
const server = spawn(process.execPath, ['scripts/m1/serve-display-review.mjs'], { stdio: 'inherit', detached: true, env: process.env });
let game;
const stop = () => { game?.kill('SIGINT'); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
try {
    // Wait for this owned server, refusing a failed bind rather than using an older preview.
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (server.exitCode !== null) throw Error('M1.4 preview failed to start; choose an unused M14_PORT');
    const response = await fetch(`http://127.0.0.1:${port}/`);
    if (!response.ok) throw Error('M1.4 preview is unavailable');
    const output = `.artifacts/m1-4/${process.env.M14_EDGE_PLAY === '1' ? 'edge-review/' : ''}manual-${Date.now()}`;
    game = spawn(process.execPath, ['scripts/m1/run-power-plant-game.mjs'], { stdio: 'inherit', detached: true, env: {
        ...process.env, M12_ORIGIN: `http://127.0.0.1:${port}`, M12_OUTPUT: output,
        M12_SHORT: '1', M12_DENSITY: '4', M12_CONSCRIPT: '4', M12_EXPECT_DENSITY: '4', M14_PLAY: '1',
        M14_OUTPUT: '', M14_MENU: '', M12_REJECT: '', M12A_OUTPUT: '', M12_ZOOM_OUTPUT: '', M12_OCCLUSION: '',
    } });
    const code = await new Promise(resolve => game.once('exit', resolve));
    if (code) process.exitCode = code;
} finally {
    server.kill('SIGTERM');
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
}
