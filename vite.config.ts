import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import musicContract from './desktop/music-contract.json';
import { Readable } from 'node:stream';
import { registerMovieResources } from './desktop/movie-profile.mjs';
import { registerHdMovieResources } from './desktop/hd-movie-profile.mjs';
import { createHandler } from './desktop/protocol.mjs';

const csp = "default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";
function localAssets(): Plugin {
    const routes = new Map([
        ['/local-assets/manifest.json', '.local/ra2-core-manifest.json'],
        ['/local-assets/yr/manifest.json', '.local/yr-core-manifest.json'],
        ...['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'].map(name => [`/local-assets/yr/${name}`, `.local/assets/yr/${name}`]),
        ...['ra2.mix', 'language.mix', 'multi.mix'].map(name => [`/local-assets/yr/${name}`, `.local/assets/ra2/${name}`]),
        ...['ra2.mix', 'language.mix', 'multi.mix'].map(name => [`/local-assets/${name}`, `.local/assets/ra2/${name}`]),
        ...['general.csf', 'ra2cd.mix'].map(name => [`/local-support/${name}`, `.local/upstream-support/${name}`]),
    ]);
    routes.set('/local-music/ra2/manifest.json', '.local/music/ra2/manifest.json');
    for (const file of musicContract.files) routes.set('/local-music/ra2/' + file.name, '.local/music/ra2/' + file.name);
    const rhinoNames = ['manifest.json', ...['body', 'turret'].flatMap(p =>
        [0,45,90,135,180,225,270,315].flatMap(h => [`${p}-${h}.png`, `${p}-${h}.mask`]))];
    for (const name of rhinoNames) routes.set(`/local-rhino/${name}`, `.local/hd-packs/rhino-authored/1/${name}`);
    const install = (server: any) => { server.middlewares.use((req: any, res: any, next: any) => {
        res.setHeader('Content-Security-Policy', csp);
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        const host = req.headers.host?.split(':')[0];
        if (!['127.0.0.1', 'localhost'].includes(host)) { res.statusCode = 403; res.end('Loopback only'); return; }
        const url = new URL(req.url, 'http://127.0.0.1');
        let pathname: string;
        try { pathname = decodeURIComponent(url.pathname); }
        catch { res.statusCode = 400; res.end('Invalid path'); return; }
        if (/(^|\/)(@fs|\.local|\.artifacts|\.git)(\/|$)/.test(pathname)) {
            res.statusCode = 403; res.end('Private path'); return;
        }
        const relative = routes.get(pathname);
        if (!relative) {
            if (/^\/(local-rhino|local-assets|local-support|local-music|\.local|\.artifacts)(\/|$)/.test(pathname)) {
                res.statusCode = 404; res.end('Not allowlisted'); return;
            }
            return next();
        }
        if (!['GET', 'HEAD'].includes(req.method)) { res.statusCode = 405; res.end(); return; }
        try {
            const target = path.resolve(relative);
            if (fs.realpathSync(target) !== target) throw new Error('Symlink refused');
            const stat = fs.statSync(target);
            if (!stat.isFile()) throw new Error('Not a file');
            res.setHeader('Cache-Control', 'no-store');
            if (relative.endsWith('.json') && !pathname.startsWith('/local-rhino/') && !pathname.startsWith('/local-music/')) {
                // Browser never receives installation paths or local output paths.
                const raw = JSON.parse(fs.readFileSync(target, 'utf8'));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ schemaVersion: raw.schemaVersion, files: raw.files.map(({ virtualName, bytes, sha256, validation }: any) => ({ virtualName, bytes, sha256, validation })) }));
            } else {
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Length', stat.size);
                if (req.method === 'HEAD') res.end(); else fs.createReadStream(target).pipe(res);
            }
        } catch {
            res.statusCode = 404;
            res.end('Local import missing or unsafe. See README.');
        }
    });
    };
    return { name: 'isolated-local-assets', configureServer: install, configurePreviewServer: install };
}
function localMovies(): Plugin {
    const install = async (server: any) => {
        const root = path.resolve('.local');
        const profile = { root, campaignRoot: path.join(root, 'campaign'), routes: new Map(), selections: new Map() };
        await registerMovieResources(profile);
        await registerHdMovieResources(profile);
        const handle = createHandler({ appRoot: process.cwd(), appFiles: new Set(), getProfile: () => profile, getError: () => '' });
        server.middlewares.use(async (req: any, res: any, next: any) => {
            const pathname = req.url?.split('?')[0];
            if (!/^\/local-(movies|hd-movies)\//.test(pathname) && !profile.routes.has(pathname)) return next();
            try {
                const response = await handle(new Request('ra2://game' + req.url, { method: req.method, headers: req.headers }));
                res.statusCode = response.status;
                response.headers.forEach((value, key) => res.setHeader(key, value));
                if (response.body) {
                    const stream = Readable.fromWeb(response.body as any);
                    res.on('close', () => stream.destroy()); stream.on('error', () => res.destroy()); stream.pipe(res);
                } else res.end();
            } catch { res.statusCode = 500; res.end('Local movie request failed'); }
        });
    };
    return { name: 'isolated-local-movies', configureServer: install, configurePreviewServer: install };
}
export default defineConfig({
    plugins: [react(), localAssets(), localMovies()],
    server: {
        host: '127.0.0.1', port: 4000, strictPort: true,
        hmr: false,
        fs: { strict: true, allow: [process.cwd()], deny: ['**/.local/**', '**/.artifacts/**', '**/.git/**'] },
    },
    preview: { host: '127.0.0.1', port: 4000, strictPort: true },
    resolve: { alias: { '@': '/src' } },
    optimizeDeps: { exclude: ['7z-wasm', '@ffmpeg/ffmpeg'] },
    worker: { format: 'es' },
    build: { target: 'esnext' },
    assetsInclude: ['**/*.wasm'],
});
