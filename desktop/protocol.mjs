import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { isGameURL } from './url-policy.mjs';
import { safeFile } from './profile.mjs';

export const csp = "default-src 'self'; connect-src 'self' blob:; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'";
const headers = { 'Content-Security-Policy': csp, 'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ini': 'text/plain', '.webm': 'video/webm' };
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function profilePage(message) {
    return `<!doctype html><meta charset="utf-8"><title>Local resources required</title><style>body{background:#171b20;color:white;font:20px/1.6 system-ui;margin:48px;max-width:850px}button{font:inherit;padding:12px}pre{white-space:pre-wrap}</style><h1>Choose existing local resources</h1><p>Select the imported profile folder containing ra2-core-manifest.json, assets/ra2 and upstream-support. For this checkout, choose ra2-hd/.local. The original game installation is not a staged profile.</p><pre>${escape(message)}</pre><button id="choose-profile">Choose imported profile folder</button><p id="profile-result"></p><script src="/__desktop/select.js"></script>`;
}
export function createHandler({ appRoot, appFiles, getProfile, getError, record = () => {} }) {
    return async request => {
        const reply = (body, status = 200, type = 'text/plain') => new Response(request.method === 'HEAD' ? null : body,
            { status, headers: { ...headers, 'Content-Type': type } });
        record({ type: 'protocol', url: request.url, method: request.method });
        if (!isGameURL(request.url)) return reply('Unknown application host', 403);
        if (request.initiatorOrigin && !isGameURL(request.initiatorOrigin)) return reply('Unknown initiator', 403);
        if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405);
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return reply('Invalid path', 400); }
        if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p === '.' || p === '..')) return reply('Invalid path', 400);
        if (pathname === '/__desktop/select.js') return reply("document.querySelector('#choose-profile').onclick=async()=>{document.querySelector('#profile-result').textContent=await window.desktopProfile.choose();};", 200, 'text/javascript');
        const profile = getProfile();
        if (pathname === '/__desktop/profile' || (pathname === '/' && !profile)) return reply(profilePage(getError()), 200, 'text/html');
        if (pathname === '/local-assets/manifest.json') return profile ? reply(JSON.stringify(profile.manifest), 200, 'application/json') : reply('Local profile not registered', 404);
        if (profile?.selections?.has(pathname)) return reply(JSON.stringify(profile.selections.get(pathname)), 200, 'application/json');
        const local = profile?.routes.get(pathname);
        const relative = pathname === '/' ? 'dist/index.html' : `dist${pathname}`;
        if (!local && !appFiles.has(relative)) return reply('Not allowlisted', 404);
        try {
            const resourceRoot = pathname.startsWith('/local-ui/') ? profile?.uiRoot ?? profile?.root : profile?.root;
            const file = local ? await safeFile(resourceRoot, path.relative(resourceRoot, local)) : await safeFile(appRoot, relative);
            if (path.extname(file) === '.webm') {
                const size = fs.statSync(file).size;
                const range = request.headers.get('range');
                let start = 0, end = size - 1;
                if (range) {
                    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
                    if (!match || (!match[1] && !match[2])) return reply('Invalid range', 416);
                    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
                    end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
                    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
                        return reply('Unsatisfiable range', 416);
                }
                const stream = request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file, { start, end }));
                return new Response(stream, { status: range ? 206 : 200, headers: { ...headers,
                    'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
                    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) } });
            }
            const stream = request.method === 'HEAD' ? null : Readable.toWeb(fs.createReadStream(file));
            return new Response(stream, { headers: { ...headers, 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
                'Content-Length': String(fs.statSync(file).size) } });
        } catch { return reply('Required local file is missing or unsafe. Reopen the app to validate the profile.', 404); }
    };
}
