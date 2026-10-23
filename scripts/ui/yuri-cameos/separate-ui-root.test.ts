import { test, expect } from 'bun:test';
import { mkdtemp, realpath, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';
import { createHandler } from '../../../desktop/protocol.mjs';

test('isolated UI root selects its own pack; a broken override cannot leak the native-root UI', async () => {
    const base = await realpath(await mkdtemp(join(tmpdir(), 'ra2-yuri-ui-root-')));
    const previous = process.env.RA2_UI_RESOURCE_ROOT;
    const makePack = async (root: string, revision: string) => {
        await mkdir(join(root, 'ui-packs', revision), { recursive: true });
        const manifest = JSON.stringify({ schemaVersion: 1, revision, assets: [] });
        await writeFile(join(root, 'ui-packs', revision, 'manifest.json'), manifest);
        await writeFile(join(root, 'ui-selection.json'), JSON.stringify({ schemaVersion: 1, revision,
            sha256: createHash('sha256').update(manifest).digest('hex') }));
    };
    try {
        const native = join(base, 'native'), ui = join(base, 'ui');
        await makePack(native, 'accepted-native-ui');
        await makePack(ui, 'isolated-yuri-ui');
        delete process.env.RA2_UI_RESOURCE_ROOT;
        const original = await registerHdResources(native);
        expect(original.selections.get('/local-ui/selection.json').revision).toBe('accepted-native-ui');
        process.env.RA2_UI_RESOURCE_ROOT = ui;
        const isolated = await registerHdResources(native);
        expect(isolated.selections.get('/local-ui/selection.json').revision).toBe('isolated-yuri-ui');
        expect(isolated.availability).toEqual(original.availability);
        const pixels = join(ui, 'pixels.png');
        await writeFile(pixels, 'test pixels');
        const handler = createHandler({ appRoot: native, appFiles: new Set(), getError: () => '',
            getProfile: () => ({ root: native, uiRoot: isolated.uiRoot,
                routes: new Map([['/local-ui/isolated-yuri-ui/pixels.png', pixels], ['/local-assets/foreign.png', pixels]]) }) });
        const response = await handler(new Request('ra2://game/local-ui/isolated-yuri-ui/pixels.png'));
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('test pixels');
        expect((await handler(new Request('ra2://game/local-assets/foreign.png'))).status).toBe(404);
        process.env.RA2_UI_RESOURCE_ROOT = join(base, 'missing');
        const broken = await registerHdResources(native);
        expect(broken.selections.has('/local-ui/selection.json')).toBe(false);
        expect(broken.availability).toEqual(original.availability);
    } finally {
        if (previous === undefined) delete process.env.RA2_UI_RESOURCE_ROOT;
        else process.env.RA2_UI_RESOURCE_ROOT = previous;
        await rm(base, { recursive: true, force: true });
    }
});
