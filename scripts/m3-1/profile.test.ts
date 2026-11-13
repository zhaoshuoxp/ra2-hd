import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateCampaignResources } from '../../desktop/campaign-profile.mjs';
import { createHandler } from '../../desktop/protocol.mjs';
import { registerCampaignTerrainResources } from '../../desktop/terrain-profile.mjs';

test('campaign registration pins every file and streams video ranges without exposing nearby files', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'ra2-m3-profile-')));
    try {
        const base = path.join(root, 'ra2/sov01t'); await fs.mkdir(base, { recursive: true });
        const contents = { 'sov01t.map': 'synthetic map', 'provenance.json': '{}', 'clip.webm': '0123456789' };
        const files = [];
        for (const [name, content] of Object.entries(contents)) {
            await fs.writeFile(path.join(base, name), content);
            files.push({ name, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex'), route: `/local-campaign/ra2/sov01t/${name}` });
        }
        const manifest = { schemaVersion: 1, edition: 'ra2', mission: 'sov01t.map', files, provenanceDigest: files[1].sha256 };
        await fs.writeFile(path.join(base, 'manifest.json'), JSON.stringify(manifest));
        const registration = await validateCampaignResources(root);
        const handler = createHandler({ appRoot: root, appFiles: new Set(), getProfile: () => ({ campaignRoot: root,
            routes: registration.routes, selections: registration.selections }), getError: () => '' });
        const partial = await handler(new Request('ra2://game/local-campaign/ra2/sov01t/clip.webm', { headers: { range: 'bytes=2-5' } }));
        expect(partial.status).toBe(206); expect(await partial.text()).toBe('2345'); expect(partial.headers.get('content-range')).toBe('bytes 2-5/10');
        const extra = await handler(new Request('ra2://game/local-campaign/ra2/sov01t/unregistered.ini'));
        expect(extra.status).toBe(404);
        await fs.writeFile(path.join(base, 'sov01t.map'), 'corrupt');
        await expect(validateCampaignResources(root)).rejects.toThrow('integrity');
        await fs.unlink(path.join(base, 'sov01t.map')); await fs.symlink(path.join(base, 'clip.webm'), path.join(base, 'sov01t.map'));
        await expect(validateCampaignResources(root)).rejects.toThrow('Unsafe');
    } finally { await fs.rm(root, { recursive: true }); }
});

test('isolated campaign terrain validates the frozen manifest without rewriting the concurrent main selector', async () => {
    const root = await fs.realpath('../ra2-hd/.local');
    const pointer = path.join(root, 'terrain-urban-selection.json');
    const before = await fs.readFile(pointer);
    const events: any[] = [];
    const registration = await registerCampaignTerrainResources(root, (event: any) => events.push(event));
    const contracts = JSON.parse(await fs.readFile('desktop/terrain-theater-hd-contracts.json', 'utf8'));
    expect(registration.selections.get('/local-terrain/urban/selection.json').revision).toBe(contracts.URBAN.revision);
    expect(registration.routes.size).toBeGreaterThan(0);
    expect(events.some(event => event.selectionSource === 'isolated-campaign-baseline' && event.sha256 === contracts.URBAN.sha256)).toBe(true);
    expect(await fs.readFile(pointer)).toEqual(before);
});
