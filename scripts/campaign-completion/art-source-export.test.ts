import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { retailIni, retailMember, sha256 } from '../test-support/resources';

test.each([
    ['all09t.map', 'MAYAN', 'ctmex01.shp', false],
    ['all10s.map', 'CALAB', 'calab.shp', true],
] as const)('%s distinguishes an archived rubble frame from original LeaveRubble behavior', (mission, identity, member, used) => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-art-source-'));
    try {
        const output = path.join(folder, 'source');
        const result = spawnSync('bun', ['scripts/campaign-completion/export-mission-art.ts', output,
            mission, identity + ':' + member], { encoding: 'utf8', timeout: 30000 });
        expect(result.status, result.stderr).toBe(0);
        const source = JSON.parse(fs.readFileSync(path.join(output, 'source.json'), 'utf8')).sources[0];
        expect(source.sha256).toBe(retailMember('ra2', member).sha256);
        expect(source.bodyFrames).toBe(4); expect(source.totalFrames).toBe(8);
        expect(source.remapable).toBe(true); expect(source.hasShadow).toBe(true);
        expect(source.framePalettes['3'].runtimeUsed).toBe(used);
        expect(source.framePalettes['3'].remapable).toBe(false);
        expect(retailIni('ra2').getSection(identity)!.getBool('LeaveRubble', false)).toBe(used);
        for (const frame of source.frames) {
            const bytes = fs.readFileSync(path.join(output, 'native', `${member}-${frame.slot}.index`));
            expect(sha256(bytes)).toBe(frame.indexSha256);
        }
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('the original animated Desert gate keeps its unit palette through all 21 body states', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-gate-source-'));
    try {
        const output = path.join(folder, 'source');
        const result = spawnSync('bun', ['scripts/campaign-completion/export-mission-art.ts', output,
            'all04dmd.map', 'GAGATE_A:gdgate_a.shp', '--edition=yr'], { encoding: 'utf8', timeout: 30000 });
        expect(result.status, result.stderr).toBe(0);
        const source = JSON.parse(fs.readFileSync(path.join(output, 'source.json'), 'utf8')).sources[0];
        expect(source.sha256).toBe(retailMember('yr', 'gdgate_a.shp').sha256);
        expect(source.bodyFrames).toBe(21); expect(source.totalFrames).toBe(42);
        expect(source.palette.member).toBe('unitdes.pal'); expect(source.framePalettes).toEqual({});
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('authoring separates identical native pixels when their palette metadata differs', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-art-palette-'));
    try {
        const output = path.join(folder, 'source');
        const exported = spawnSync('bun', ['scripts/campaign-completion/export-mission-art.ts', output,
            'all04dmd.map', 'CAEGYP06:cgegyp06.shp', '--edition=yr'], { encoding: 'utf8', timeout: 30000 });
        expect(exported.status, exported.stderr).toBe(0);
        const sourceFile = path.join(output, 'source.json'), original = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
        const source = original.sources[0];
        expect(source.frames[0].indexSha256).toBe(source.frames[1].indexSha256);
        expect(source.palette.sha256).not.toBe(source.framePalettes['3'].sha256);
        // Exercise a palette variant only in the temporary authoring fixture.
        // The original source export and all native SHP bytes stay unchanged.
        source.framePalettes['1'] = source.framePalettes['3'];
        const fixtureSource = path.join(output, 'palette-fixture.json');
        fs.writeFileSync(fixtureSource, JSON.stringify(original));
        const image = new PNG({ width: 3, height: 3 }); image.data.fill(0); image.data.set([128, 128, 128, 255], 16);
        const master = path.join(folder, 'metadata-test-only.png'); fs.writeFileSync(master, PNG.sync.write(image));
        const authorization = 'docs/campaign-art/yr-v1/authorization.json';
        const sample = { file: master, sha256: sha256(fs.readFileSync(master)) };
        const recipe: any = { edition: 'yr', authorization: { file: authorization, sha256: sha256(fs.readFileSync(authorization)) },
            source: fixtureSource, sourceJsonSha256: sha256(fs.readFileSync(fixtureSource)), mission: original.mission,
            missionSha256: original.missionSha256, identity: 'CAEGYP06', kind: 'building', sourceSha256: source.sha256,
            family: 'yr-test-caegyp06-material-v1', masters: { '0': sample, '3': sample } };
        const file = path.join(folder, 'recipe.json'); fs.writeFileSync(file, JSON.stringify(recipe));
        const missing = spawnSync('python3', ['scripts/campaign-completion/prepare-approved-shp.py', file,
            path.join(folder, 'missing')], { encoding: 'utf8', timeout: 30000 });
        expect(missing.status).not.toBe(0); expect(missing.stderr).toContain("KeyError: '1'");
        recipe.masters['1'] = sample; fs.writeFileSync(file, JSON.stringify(recipe));
        const prepared = path.join(folder, 'complete');
        const complete = spawnSync('python3', ['scripts/campaign-completion/prepare-approved-shp.py', file, prepared],
            { encoding: 'utf8', timeout: 30000 });
        expect(complete.status, complete.stderr).toBe(0);
        const work = JSON.parse(fs.readFileSync(path.join(prepared, 'authoring/worklist.json'), 'utf8'));
        expect(Object.values(work.slots).map((slot: any) => slot.nativeSlot)).toEqual([0, 1, 3]);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 60000);
