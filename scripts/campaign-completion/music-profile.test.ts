import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { registerMusicResources } from '../../desktop/music-profile.mjs';
import { createHandler } from '../../desktop/protocol.mjs';
import contract from '../../desktop/music-contract.json';
import { requiredBytes, resourceRoot } from '../test-support/resources';

test('all source-pinned original tracks publish atomically and preserve the exact manifest bytes over the desktop protocol', async () => {
    const profile = { root: resourceRoot, routes: new Map(), selections: new Map() }, records: any[] = [];
    expect(await registerMusicResources(profile, record => records.push(record))).toBe(true);
    expect(profile.routes.size).toBe(16); expect(records[0].type).toBe('original-music-ready');
    const handler = createHandler({ appRoot: resourceRoot, appFiles: new Set(), getProfile: () => profile, getError: () => '' });
    const response = await handler(new Request('ra2://game/local-music/ra2/manifest.json'));
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(contract.manifestSha256);
    expect(Buffer.from(bytes).equals(requiredBytes('music/ra2/manifest.json'))).toBe(true);
    const audio = await handler(new Request('ra2://game/local-music/ra2/indeep.mp3', { method: 'HEAD' }));
    expect(audio.status).toBe(200); expect(audio.headers.get('Content-Type')).toBe('audio/mpeg');
});

test('an invalid optional music manifest cannot publish partial tracks or disturb other registered resources', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-music-profile-'));
    try {
        await fs.mkdir(path.join(root, 'music/ra2'), { recursive: true });
        await fs.writeFile(path.join(root, 'music/ra2/manifest.json'), '{"schemaVersion":1,"files":[]}');
        const profile = { root, routes: new Map([['/accepted-resource', 'preserved']]), selections: new Map() }, records: any[] = [];
        expect(await registerMusicResources(profile, record => records.push(record))).toBe(false);
        expect([...profile.routes]).toEqual([['/accepted-resource', 'preserved']]); expect(profile.selections.size).toBe(0);
        expect(records[0].type).toBe('original-music-unavailable');
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});
