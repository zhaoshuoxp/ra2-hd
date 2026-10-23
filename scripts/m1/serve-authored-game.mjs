// Explicit local-only pack routes alongside the isolated offline preview build.
import fs from 'node:fs/promises';
import { preview } from 'vite';
import { validateHdPack } from '../../desktop/profile.mjs';

const pack = await validateHdPack('.local', 'conscript-authored', process.env.M11_PACK_REVISION ?? '1');
const files = {};
for (const variant of pack.manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
    files[page[role]] = `/local-hd/${pack.sha256}/${variant.density}/${page.id}/${role}.png`;
}
const binding = JSON.stringify({ sha256: pack.sha256, files });
const server = await preview({
    build: { outDir: process.env.M11_BUILD_DIR ?? '.artifacts/m1-1/4k-gameplay-v1/build' },
    preview: { host: '127.0.0.1', port: Number(process.env.M11_PORT ?? 4000), strictPort: true },
    plugins: [{ name: 'explicit-conscript-hd-selection', configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/local-hd/')) return next();
            if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
            res.setHeader('Cache-Control', 'no-store');
            if (req.url === '/local-hd/selection.json') {
                res.setHeader('Content-Type', 'application/json'); res.end(req.method === 'HEAD' ? '' : binding); return;
            }
            const file = pack.routes.get(req.url);
            if (!file) { res.statusCode = 404; res.end(); return; }
            try {
                res.setHeader('Content-Type', req.url.endsWith('.png') ? 'image/png' : 'application/json');
                res.end(req.method === 'HEAD' ? '' : await fs.readFile(file));
            } catch { res.statusCode = 404; res.end(); }
        });
    } }],
});
console.log(`Local authored Conscript game: ${server.resolvedUrls.local[0]}?conscript-hd=4`);
console.log(`Manifest: ${pack.sha256}; all 301 visible frames; original shadows retained.`);
