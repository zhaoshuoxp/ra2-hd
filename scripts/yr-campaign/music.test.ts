import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerMusicResources } from '../../desktop/music-profile.mjs';
import { loadPreparedLocalMusic } from '../../src/offline/music';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { IniFile } from '../../src/data/IniFile';
import { MusicSpecs } from '../../src/engine/sound/MusicSpecs';
import { retailMember, resourceRoot } from '../test-support/resources';
import yrContract from '../../desktop/music-yr-contract.json';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('both music editions register exact independent manifests and preserve prior routes', async () => {
    const profile = { root: resourceRoot, routes: new Map(), selections: new Map() };
    expect(await registerMusicResources(profile)).toBe(true);
    const retained = new Map(profile.routes);
    expect(await registerMusicResources(profile, () => {}, 'yr')).toBe(true);
    expect(profile.routes.size).toBe(26);
    for (const [route, file] of retained) expect(profile.routes.get(route)).toBe(file);
    expect(profile.selections.get('/local-music/yr/manifest.json').edition).toBe('yr');
    expect(profile.selections.get('/local-music/ra2/manifest.json').edition).toBe('ra2');
    expect(yrContract.files.every(file => file.route.startsWith('/local-music/yr/'))).toBe(true);
});

test('missing YR tracks publish no partial closure and preserve accepted RA2 music', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yr-music-closure-'));
    try {
        const profile = { root: resourceRoot, routes: new Map(), selections: new Map() };
        expect(await registerMusicResources(profile)).toBe(true);
        const retained = [...profile.routes], selections = [...profile.selections];
        await fs.mkdir(path.join(root, 'music/yr'), { recursive: true });
        await fs.copyFile(path.join(resourceRoot, 'music/yr/manifest.json'), path.join(root, 'music/yr/manifest.json'));
        profile.root = root;
        expect(await registerMusicResources(profile, () => {}, 'yr')).toBe(false);
        expect([...profile.routes]).toEqual(retained); expect([...profile.selections]).toEqual(selections);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('the lazy music loader enforces edition, track identity and exact converted bytes', async () => {
    const requested: string[] = [];
    globalThis.fetch = (async (url: any) => {
        const route = String(url); requested.push(route);
        return new Response(readFileSync(path.join(resourceRoot, route.replace('/local-music/', 'music/'))));
    }) as any;
    const yr = (await loadPreparedLocalMusic('yr'))!, ra2 = (await loadPreparedLocalMusic('ra2'))!;
    expect(requested).toHaveLength(2);
    const track = await yr.get('Defend.mp3');
    expect(Buffer.from(await track.getBlob().arrayBuffer())).toEqual(readFileSync(path.join(resourceRoot, 'music/yr/defend.mp3')));
    await expect(yr.get('indeep.mp3')).rejects.toThrow('not prepared');
    await expect(ra2.get('defend.mp3')).rejects.toThrow('not prepared');
    globalThis.fetch = (async () => new Response(readFileSync(path.join(resourceRoot, 'music/ra2/manifest.json')))) as any;
    await expect(loadPreparedLocalMusic('yr')).rejects.toThrow('identity mismatch');
});

test('every original YR scenario and source music action resolves through its own archived theme library', () => {
    const theme = retailMember('yr', 'thememd.ini'); expect(theme.sha256).toBe(yrContract.themeIni.sha256);
    const specs = new MusicSpecs(new IniFile(theme.file.readAsString()));
    const ai = new IniFile(retailMember('yr', 'aimd.ini').file);
    const tracker = JSON.parse(readFileSync('docs/yr-campaign-current.json', 'utf8'));
    const requested = new Set<string>();
    for (const mission of tracker.missions) {
        const text = readFileSync(path.join(resourceRoot, 'campaign/yr', mission.mission.slice(0, -4), mission.mission), 'utf8');
        const definition = new CampaignDefinition('yr', mission.mission, text, ai,
            { semanticsVersion: 32, sourceSha256: mission.sourceSha256 });
        const initial = definition.ini.getSection('Basic')?.getString('Theme');
        if (initial && !['no theme', '<none>'].includes(initial.toLowerCase())) requested.add(initial);
        for (const trigger of definition.triggers.values()) for (const action of trigger.actions)
            if (action.opcode === 20) requested.add(action.params[1]);
    }
    expect(requested.has('DefendTheBase')).toBe(true);
    for (const name of requested) {
        const spec = specs.getSpec(name); expect(spec).toBeDefined();
        expect(yrContract.files.some(file => file.name === spec!.sound.toLowerCase() + '.mp3')).toBe(true);
    }
});
