import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registerMovieResources } from '../../desktop/movie-profile.mjs';
import { displaySafeAreaTop } from '../../desktop/display.mjs';

test('movie registration verifies both edition identities and publishes no partial routes after corruption', async () => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-movie-profile-')), root = await fs.realpath(temporary);
    const directory = path.join(root, 'media/movie-library-v51'); await fs.mkdir(directory, { recursive: true });
    const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    try {
        const entries = [];
        for (const edition of ['ra2', 'yr']) {
            const bytes = Buffer.from(edition + '-small-file-identity-fixture'), name = edition + '-intro.webm';
            await fs.writeFile(path.join(directory, name), bytes);
            entries.push({ edition, id: 'a00_f00e', role: 'introduction', width: 640, height: 400, durationSeconds: 120,
                original: { sha256: (edition === 'ra2' ? 'a' : 'b').repeat(64) }, fallback: 'converted-original',
                file: { name, route: '/local-movies/' + name, bytes: bytes.length, sha256: digest(bytes) } });
        }
        const catalog = { schema: 'original-movie-library-v1', revision: 'fixture', entries };
        await fs.writeFile(path.join(directory, 'catalog.json'), JSON.stringify(catalog));
        const valid: any = { root, routes: new Map([['/existing', '/existing/file']]) };
        expect(await registerMovieResources(valid)).toBe(true); expect(valid.routes.size).toBe(4);
        expect(valid.movieLibrary.entries).toBe(2);
        await fs.writeFile(path.join(directory, entries[1].file.name), 'corrupt');
        const invalid: any = { root, routes: new Map([['/existing', '/existing/file']]) };
        expect(await registerMovieResources(invalid)).toBe(false);
        expect([...invalid.routes]).toEqual([['/existing', '/existing/file']]);
        entries[1].file.route = '/local-movies/../escape.webm';
        await fs.writeFile(path.join(directory, 'catalog.json'), JSON.stringify(catalog));
        expect(await registerMovieResources(invalid)).toBe(false); expect(invalid.routes.size).toBe(1);
    } finally { await fs.rm(root, { recursive: true }); }
});

test('display inset uses Mac internal-display DIP and leaves Windows, external screens and windows unchanged', () => {
    const screen = { internal: true, bounds: { y: 900 }, workArea: { y: 938 } };
    expect(displaySafeAreaTop(screen, true, 'darwin')).toBe(38);
    expect(displaySafeAreaTop({ ...screen, workArea: { y: 900 } }, true, 'darwin')).toBe(32);
    expect(displaySafeAreaTop(screen, false, 'darwin')).toBe(0);
    expect(displaySafeAreaTop(screen, true, 'win32')).toBe(0);
    expect(displaySafeAreaTop({ ...screen, internal: false }, true, 'darwin')).toBe(0);
});
