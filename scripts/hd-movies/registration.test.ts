import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { registerHdMovieResources, verifyMovieRoute, validMovieTimeline } from '../../desktop/hd-movie-profile.mjs';
import { createHandler } from '../../desktop/protocol.mjs';
import { movieTime } from '../../src/gui/campaign/MovieTimeline';

const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
async function fixture(run: (value: any) => Promise<void>) {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-hd-movies-')));
    const directory = path.join(root, 'media/hd-movies/fixture'); await fs.mkdir(directory, { recursive: true });
    const payload = Buffer.from('small-stream-integrity-fixture');
    const entries = ['ra2', 'yr'].map((edition, index) => ({
        edition, id: 'a00_f00e', original: { sha256: String(index + 1).repeat(64), language: 'en', durationSeconds: 20 },
        file: { path: edition + '.mp4', bytes: payload.length, sha256: sha(payload) },
        video: { codec: 'h264', width: 1280, height: 960, durationSeconds: 20, fpsNumerator: 15, fpsDenominator: 1 },
        audio: { strategy: 'original-transcode', language: 'en', sourcePcmSha256: 'a'.repeat(64), decodedPcmSha256: 'b'.repeat(64) },
        subtitles: { strategy: 'game', burnedIn: false, timelineSha256: 'c'.repeat(64) },
        timeline: [{ original: 0, media: 0 }, { original: 20, media: 20 }],
        acceptance: { technical: 'verified', visual: 'accepted', cut: 'verified' },
        provenance: { sources: ['fixture://synthetic-test-metadata'] },
    }));
    for (const entry of entries) await fs.writeFile(path.join(directory, entry.file.path), payload);
    const profile = () => ({ root, selections: new Map(), routes: new Map(), movieIdentities: new Map(entries.map(entry => [
        entry.edition + ':' + entry.id, { original: { ...entry.original }, durationSeconds: 20, width: 640, height: 480 },
    ])) });
    const save = async () => {
        const manifest = JSON.stringify({ schema: 'hd-movie-pack-v1', revision: 'fixture', entries });
        await fs.writeFile(path.join(directory, 'manifest.json'), manifest);
        await fs.writeFile(path.join(root, 'hd-movie-selection.json'), JSON.stringify({ schema: 'hd-movie-selection-v1',
            manifest: 'media/hd-movies/fixture/manifest.json', sha256: sha(manifest) }));
    };
    try { await save(); await run({ root, directory, entries, profile, save, payload }); }
    finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('registration keeps same-name editions separate and excludes unaccepted or mismatched replacements', async () => {
    await fixture(async ({ entries, profile, save }) => {
        const valid = profile(); expect(await registerHdMovieResources(valid)).toBe(true);
        expect(valid.hdMovies.accepted).toBe(2);
        expect(valid.selections.get('/local-hd-movies/catalog.json').entries.map((entry: any) => entry.original.sha256))
            .toEqual(['1'.repeat(64), '2'.repeat(64)]);
        entries[1].acceptance.visual = 'pending'; await save();
        const pending = profile(); await registerHdMovieResources(pending);
        expect(pending.hdMovies.accepted).toBe(1); expect(pending.hdMovies.rejected).toHaveLength(1);
        entries[1].acceptance.visual = 'accepted';
        const mismatch = profile(); entries[1].original.sha256 = entries[0].original.sha256; await save();
        await registerHdMovieResources(mismatch); expect(mismatch.hdMovies.accepted).toBe(1);
    });
});

test('streamed integrity rejects corruption, rechecks mutations and serves bounded byte ranges', async () => {
    await fixture(async ({ directory, profile, payload }) => {
        const current = profile(); await registerHdMovieResources(current);
        const route = '/local-hd-movies/fixture/ra2.mp4';
        const handler = createHandler({ appRoot: current.root, appFiles: new Set(), getProfile: () => current, getError: () => '' });
        const head = await handler(new Request('ra2://game' + route, { method: 'HEAD' }));
        expect(head.status).toBe(200); expect(head.headers.get('X-RA2-Movie-Sha256')).toBe(sha(payload));
        expect(head.headers.get('Content-Length')).toBe(String(payload.length)); expect(await head.text()).toBe('');
        const ranged = await handler(new Request('ra2://game' + route, { headers: { range: 'bytes=3-8' } }));
        expect(ranged.status).toBe(206); expect(await ranged.text()).toBe(payload.subarray(3, 9).toString());
        const suffix = await handler(new Request('ra2://game' + route, { headers: { range: 'bytes=-4' } }));
        expect(await suffix.text()).toBe(payload.subarray(-4).toString());
        expect((await handler(new Request('ra2://game' + route, { headers: { range: 'bytes=999-' } }))).status).toBe(416);
        await fs.writeFile(path.join(directory, 'ra2.mp4'), Buffer.alloc(payload.length, 33));
        expect((await handler(new Request('ra2://game' + route, { method: 'HEAD' }))).status).toBe(404);
        await fs.writeFile(path.join(directory, 'ra2.mp4'), payload);
        expect(await verifyMovieRoute(current, route)).toBe(sha(payload));
    });
});

test('an unsafe or corrupt optional manifest leaves the original route table usable', async () => {
    await fixture(async ({ root, entries, profile, save }) => {
        entries[0].file.path = '../escape.mp4'; await save();
        const current = profile(); await registerHdMovieResources(current);
        expect(current.hdMovies.accepted).toBe(1);
        await fs.writeFile(path.join(root, 'media/hd-movies/fixture/manifest.json'), '{}');
        const broken = profile(); broken.routes.set('/original', '/unchanged');
        expect(await registerHdMovieResources(broken)).toBe(false);
        expect([...broken.routes]).toEqual([['/original', '/unchanged']]);
        expect(broken.selections.get('/local-hd-movies/catalog.json').entries).toEqual([]);
    });
});

test('piecewise time maps preserve source save times in both directions and reject nonmonotonic cuts', () => {
    const points = [{ original: 0, media: 0 }, { original: 3, media: 3.1 }, { original: 20, media: 20.1 }];
    expect(validMovieTimeline(points, 20, 20.1)).toBe(true);
    for (const time of [0, 1.5, 3, 8, 19.5, 20]) expect(movieTime(movieTime(time, points), points, true)).toBeCloseTo(time, 9);
    expect(validMovieTimeline([{ original: 0, media: 0 }, { original: 3, media: 2 }, { original: 2, media: 3 }], 2, 3)).toBe(false);
});
