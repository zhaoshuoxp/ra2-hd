import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { prepareMovieSource, setHdMoviesEnabled, hdMoviesEnabled } from '../../src/offline/hdMovies';

test('resolution streams only a verified same-edition cut and falls back for missing, unsupported or stale-caption HD', async () => {
    const keys = ['fetch', 'document', 'localStorage'], saved = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
    const requests: { url: string; method: string }[] = [], storage = new Map();
    const digest = (value: string) => createHash('sha256').update(value).digest('hex');
    const original = { sha256: 'a'.repeat(64) };
    const file = { name: 'original.webm', route: '/local-movies/original.webm', bytes: 10, sha256: 'b'.repeat(64) };
    const make = (id: string, edition = 'ra2') => ({ edition, id, original: { ...original, language: 'en', durationSeconds: 10 },
        file: { name: id + '.mp4', route: '/local-hd-movies/fixture/' + id + '.mp4', bytes: 20,
            sha256: 'c'.repeat(64), mime: 'video/mp4; codecs="avc1.640028,mp4a.40.2"' },
        timeline: [{ original: 0, media: 0 }, { original: 10, media: 10 }],
        subtitles: { strategy: 'none', timelineSha256: digest('[]') } });
    const entries = [make('valid'), make('wrong-edition', 'yr'), make('wrong-cut'), make('missing'), make('unsupported'), make('stale-captions'),
        make('native-60'), make('unsupported-profile')];
    entries[2].original.sha256 = 'd'.repeat(64);
    entries[4].file.mime = 'video/unsupported';
    entries[5].subtitles.timelineSha256 = 'e'.repeat(64);
    entries[6].file.mime = 'video/mp4; codecs="avc1.64002a,mp4a.40.2"';
    entries[7].file.mime = 'video/mp4; codecs="avc1.640033,mp4a.40.2"';
    Object.assign(globalThis, {
        document: { createElement: () => ({ canPlayType: (mime: string) => mime.startsWith('video/mp4') ? 'probably' : '' }) },
        localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
        fetch: async (url: string, options?: RequestInit) => {
            requests.push({ url, method: options?.method ?? 'GET' });
            if (url === '/local-hd-movies/catalog.json') return Response.json({ schema: 'registered-hd-movies-v1', entries });
            if (url === '/local-hd-movies/fixture/missing.mp4') return new Response(null, { status: 404 });
            return new Response(null, { headers: { 'Content-Length': url === file.route ? '10' : '20',
                'X-RA2-Movie-Sha256': url === file.route ? file.sha256 : 'c'.repeat(64) } });
        },
    });
    try {
        const source = await prepareMovieSource({ edition: 'ra2', id: 'valid', original, file });
        expect(source.kind).toBe('hd'); expect(source.url).toBe(entries[0].file.route);
        expect((await source.fallback!()).url).toBe(file.route);
        const native60 = await prepareMovieSource({ edition: 'ra2', id: 'native-60', original, file });
        expect(native60.kind).toBe('hd'); expect(native60.url).toBe(entries[6].file.route);
        for (const id of ['wrong-edition', 'wrong-cut', 'missing', 'unsupported', 'stale-captions', 'unsupported-profile']) {
            expect((await prepareMovieSource({ edition: 'ra2', id, original, file })).kind).toBe('original');
        }
        setHdMoviesEnabled(false, 'ra2'); expect(hdMoviesEnabled('ra2')).toBe(false); expect(hdMoviesEnabled('yr')).toBe(true);
        expect((await prepareMovieSource({ edition: 'ra2', id: 'valid', original, file })).kind).toBe('original');
        expect(requests.filter(request => request.method === 'GET').map(request => request.url)).toEqual(['/local-hd-movies/catalog.json']);
        expect(requests.some(request => request.url.includes('unsupported.mp4'))).toBe(false);
        expect(requests.some(request => request.url.includes('unsupported-profile.mp4'))).toBe(false);
        expect(requests.every(request => request.url.startsWith('/local-'))).toBe(true);
    } finally {
        keys.forEach((key, index) => saved[index] ? Object.defineProperty(globalThis, key, saved[index]!) : delete (globalThis as any)[key]);
    }
});
