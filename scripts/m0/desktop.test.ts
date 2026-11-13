import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isGameURL, isLocalRequest } from '../../desktop/url-policy.mjs';
import { createHandler } from '../../desktop/protocol.mjs';
import { safeFile, validateProfile } from '../../desktop/profile.mjs';
import { staticAppFiles } from '../../desktop/static-files.mjs';

test('desktop origin policy rejects opaque lookalikes and foreign blobs', () => {
    expect(new URL('ra2://game/').origin).toBe('null'); // Node URL is not Chromium scheme registration.
    for (const url of ['https://game/', 'file:///etc/hosts', 'ra2://other/', 'evil://game/', 'ra2://user@game/', 'ra2://game:8/', 'blob:null/123', 'blob:https://example.com/123']) {
        expect(isLocalRequest(url, 'ra2://game/')).toBe(false);
    }
    expect(isGameURL('ra2://game/assets/a.js')).toBe(true);
    expect(isLocalRequest('blob:ra2://game/123', 'ra2://game/')).toBe(true);
    expect(isLocalRequest('/local-assets/manifest.json', 'http://127.0.0.1:4000/')).toBe(true);
    expect(isLocalRequest('http://127.0.0.1:4001/', 'http://127.0.0.1:4000/')).toBe(false);
});

test('protocol refuses unknown routes, methods, initiators and escaped paths', async () => {
    const handler = createHandler({ appRoot: '/unused', appFiles: new Set(), getProfile: () => undefined, getError: () => '<missing>' });
    for (const [url, status] of [['ra2://other/', 403], ['ra2://game/local-support/ini.mix', 404], ['ra2://game/.git/config', 404], ['ra2://game/%2f..%2fsecret', 400]]) {
        expect((await handler(new Request(url))).status).toBe(status);
    }
    expect((await handler(new Request('ra2://game/', { method: 'POST' }))).status).toBe(405);
    expect((await handler({ url: 'ra2://game/', method: 'GET', initiatorOrigin: 'evil://game' })).status).toBe(403);
    const missing = await handler(new Request('ra2://game/'));
    expect(await missing.text()).toContain('&lt;missing&gt;');
    expect(missing.headers.get('Content-Security-Policy')).toContain("object-src 'none'");
    expect(await (await handler(new Request('ra2://game/', { method: 'HEAD' }))).text()).toBe('');
});

test('profile validation fails closed for missing data, and files cannot escape by symlink', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-desktop-test-'));
    try {
        await expect(validateProfile(root)).rejects.toThrow();
        await fs.symlink('/etc/hosts', path.join(root, 'link'));
        await expect(safeFile(root, 'link')).rejects.toThrow();
        await expect(safeFile(root, '../outside')).rejects.toThrow();
    } finally { await fs.rm(root, { recursive: true }); }
});

test('desktop serves all three existing HD score backgrounds through its explicit application allowlist', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-score-routes-')));
    try {
        const handler = createHandler({ appRoot: root, appFiles: new Set(staticAppFiles.map(file => 'dist/' + file)),
            getProfile: () => undefined, getError: () => '' });
        await fs.mkdir(path.join(root, 'dist/res/presentation'), { recursive: true });
        for (const faction of ['allied', 'soviet', 'yuri']) {
            const route = `res/presentation/score-${faction}-hd.png`;
            const expected = await fs.readFile(path.resolve(import.meta.dir, '../../public', route));
            await fs.writeFile(path.join(root, 'dist', route), expected);
            const response = await handler(new Request('ra2://game/' + route));
            expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/png');
            expect(Buffer.from(await response.arrayBuffer()).equals(expected)).toBe(true);
        }
        expect((await handler(new Request('ra2://game/res/presentation/unlisted-score.png'))).status).toBe(404);
    } finally { await fs.rm(root, { recursive: true }); }
});
