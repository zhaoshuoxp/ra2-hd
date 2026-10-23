// Isolated M1.2 preview. Optional HD data never prevents original-art startup.
import fs from 'node:fs/promises';
import path from 'node:path';
import { preview } from 'vite';
import { validateHdPack, safeFile } from '../../desktop/profile.mjs';

const routes = new Map(), selections = new Map();
function binding(pack) {
    const files = {};
    for (const variant of pack.manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data'])
        files[page[role]] = `/local-hd/${pack.sha256}/${variant.density}/${page.id}/${role}.png`;
    for (const [route, file] of pack.routes) routes.set(route, file);
    return { member: pack.manifest.source.member, sha256: pack.sha256, files };
}
try {
    selections.set('/local-hd/selection.json', binding(await validateHdPack('.local', 'conscript-authored', '1')));
} catch (error) { console.info('Conscript optional pack unavailable:', error.message); }
try {
    const revision = process.env.M12_PACK_REVISION ?? '1';
    if (!/^\d+$/.test(revision)) throw new Error('Invalid family revision');
    const file = await safeFile(path.resolve('.local'), `hd-packs/power-plant-authored/${revision}/family.json`);
    if ((await fs.stat(file)).size > 16384) throw new Error('Family descriptor too large');
    const family = JSON.parse(await fs.readFile(file, 'utf8'));
    if (family.schemaVersion !== 1 || family.family !== 'GAPOWR' || family.theater !== 'TEMPERATE'
        || family.members?.length !== 3 || !/^[a-f0-9]{64}$/.test(family.candidateSha256)) throw new Error('Invalid building family');
    const packs = [];
    for (const [index, role] of ['body', 'active', 'buildup'].entries()) {
        const entry = family.members[index];
        if (entry.packId !== `power-plant-authored-${role}` || entry.revision !== revision) throw new Error('Unexpected building member');
        const pack = await validateHdPack('.local', entry.packId, entry.revision, { allowUnavailableVariants: true });
        if (pack.sha256 !== entry.sha256 || pack.manifest.source.member !== entry.member
            || pack.manifest.candidateSha256 !== family.candidateSha256) throw new Error('Building identity mismatch');
        packs.push(pack);
    }
    selections.set('/local-hd/power-plant-selection.json', { theater: family.theater, members: packs.map(binding) });
} catch (error) { console.info('GAPOWR optional family unavailable:', error.message); }

const server = await preview({
    build: { outDir: process.env.M12_BUILD_DIR ?? '.artifacts/m1-2/build' },
    preview: { host: '127.0.0.1', port: Number(process.env.M12_PORT ?? 4012), strictPort: true },
    plugins: [{ name: 'explicit-gapowr-conscript-selection', configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (process.env.M13E_DIAGNOSTIC === '1' && req.url?.startsWith('/rhino-eight/')) {
                const names = ['manifest.json', ...['body', 'turret'].flatMap(p => [0,45,90,135,180,225,270,315].map(h => `${p}-${h}.png`))];
                const name = req.url.slice('/rhino-eight/'.length);
                const file = name === 'adapter.js' ? '.artifacts/m1-3e/adapter.js'
                    : names.includes(name) ? `.artifacts/m1-3e/candidate-v1/${name}` : undefined;
                if (!file || !['GET', 'HEAD'].includes(req.method)) { res.statusCode = 404; res.end(); return; }
                try {
                    res.setHeader('Cache-Control', 'no-store');
                    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript'
                        : name.endsWith('.json') ? 'application/json' : 'image/png');
                    res.end(req.method === 'HEAD' ? '' : await fs.readFile(file));
                } catch { res.statusCode = 404; res.end(); }
                return;
            }
            if (process.env.M13D_DIAGNOSTIC === '1' && req.url?.startsWith('/rhino-parts/')) {
                const names = ['manifest.json', 'body-0.png', 'body-90.png', 'turret-0.png', 'turret-90.png'];
                const name = req.url.slice('/rhino-parts/'.length);
                const file = name === 'adapter.js' ? '.artifacts/m1-3d/adapter.js'
                    : names.includes(name) ? `.artifacts/m1-3d/candidate-v2/${name}` : undefined;
                if (!file || !['GET', 'HEAD'].includes(req.method)) { res.statusCode = 404; res.end(); return; }
                try {
                    res.setHeader('Cache-Control', 'no-store');
                    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript'
                        : name.endsWith('.json') ? 'application/json' : 'image/png');
                    res.end(req.method === 'HEAD' ? '' : await fs.readFile(file));
                } catch { res.statusCode = 404; res.end(); }
                return;
            }
            if (process.env.M13C_DIAGNOSTIC === '1' && req.url?.startsWith('/rhino-proof/')) {
                const files = { '/rhino-proof/adapter.js': '.artifacts/m1-3c/adapter.js',
                    '/rhino-proof/art.png': '.artifacts/m1-3c/candidate/primary-4x.png' };
                const file = files[req.url];
                if (!file || !['GET', 'HEAD'].includes(req.method)) { res.statusCode = 404; res.end(); return; }
                try {
                    res.setHeader('Cache-Control', 'no-store');
                    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'image/png');
                    res.end(req.method === 'HEAD' ? '' : await fs.readFile(file));
                } catch { res.statusCode = 404; res.end(); }
                return;
            }
            if (!req.url?.startsWith('/local-hd/')) return next();
            if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
            res.setHeader('Cache-Control', 'no-store');
            if (selections.has(req.url)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(req.method === 'HEAD' ? '' : JSON.stringify(selections.get(req.url))); return;
            }
            const file = routes.get(req.url);
            if (!file) { res.statusCode = 404; res.end(); return; }
            try {
                res.setHeader('Content-Type', req.url.endsWith('.png') ? 'image/png' : 'application/json');
                res.end(req.method === 'HEAD' ? '' : await fs.readFile(file));
            } catch { res.statusCode = 404; res.end(); }
        });
    } }],
});
console.log(`M1.2 local prototype: ${server.resolvedUrls.local[0]}?power-plant-hd=4&conscript-hd=4`);
console.log('Independent switches: power-plant-hd=2|4 and conscript-hd=2|4; omit to retain original art.');
