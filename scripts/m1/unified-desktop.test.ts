import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerHdResources, expectedHdAvailabilityKeys } from '../../desktop/hd-profile.mjs';
import { createHandler } from '../../desktop/protocol.mjs';
import { isLocalHdOrigin, requestedHdDensity } from '../../src/engine/renderable/builder/hdOrigin';
import { GraphicsOptions } from '../../src/gui/screen/options/GraphicsOptions';

test('saved artwork choices survive output changes and older graphics preferences', () => {
    const options = new GraphicsOptions().unserialize('1,2,,4k,1');
    expect(options.rhinoHd.value).toBe(true);
    expect(options.conscriptHd.value).toBe(true);
    expect(options.powerPlantHd.value).toBe(true);
    expect(options.napowrHd.value).toBe(true);
    options.napowrHd.value = true;
    options.conscriptHd.value = true;
    options.powerPlantHd.value = true;
    options.renderResolution.value = '1080p';
    const saved = new GraphicsOptions().unserialize(options.serialize());
    expect([saved.rhinoHd.value, saved.conscriptHd.value, saved.powerPlantHd.value]).toEqual([true, true, true]);
    expect(saved.napowrHd.value).toBe(true);
    expect(saved.renderResolution.value).toBe('1080p');
    expect(requestedHdDensity(false, 'conscript-hd', 'ra2://game/?conscript-hd=4')).toBeUndefined();
    expect(requestedHdDensity(true, 'conscript-hd', 'ra2://game/')).toBe(4);
    expect(requestedHdDensity(false, 'conscript-hd', 'http://127.0.0.1:4040/?conscript-hd=2')).toBe(2);
});
test('HD origin boundary rejects remote URLs, opaque lookalikes and credentials', () => {
    for (const url of ['https://game/', 'file:///game', 'ra2://other/', 'ra2://game:8/', 'ra2://user@game/',
        'https://example.com/', 'evil://localhost/', 'http://user@localhost/']) expect(isLocalHdOrigin(url)).toBe(false);
    expect(isLocalHdOrigin('ra2://game/')).toBe(true);
    expect(isLocalHdOrigin('http://localhost:4000/')).toBe(true);
});
test('absent optional data exposes availability without exposing arbitrary files', async () => {
    const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'm15-empty-'));
    try {
        const hd = await registerHdResources(root);
        expect(hd.routes.size).toBe(0);
        expect(Object.keys(hd.availability)).toEqual(expect.arrayContaining(['rhino', 'sovietUnits', 'unit-lunr']));
        expect(Object.keys(hd.availability).sort()).toEqual(expectedHdAvailabilityKeys());
        for (const [key, value] of Object.entries(hd.availability)) {
            if (key !== 'sovietUnits') expect(value).toBe('Original fallback');
        }
        expect(hd.availability.sovietUnits).toMatch(/^0 of 24 vanilla additions available; 0 of 5 YR additions available/);
        expect(hd.availability.sovietUnits).toContain('campaign-only LUNR');
        expect(hd.availability.sovietUnits).toEndWith('others use Original.');
        const handler = createHandler({ appRoot: root, appFiles: new Set(), getProfile: () => ({ root, ...hd }), getError: () => '' });
        const availability = await handler(new Request('ra2://game/local-hd/availability.json'));
        expect(availability.headers.get('Content-Type')).toBe('application/json');
        expect(await availability.json()).toEqual(hd.availability);
        for (const suffix of ['.local/secret', 'local-rhino/undeclared.mask', 'local-hd/%2f..%2fsecret'])
            expect((await handler(new Request(`ra2://game/${suffix}`))).status).toBeGreaterThanOrEqual(400);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});
