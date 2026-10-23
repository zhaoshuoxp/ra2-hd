import { expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { environmentMemberSource, environmentSourceDescriptor }
    from '../../src/engine/renderable/builder/environmentHdContract';
import { registerEnvironmentPack } from '../../desktop/environment-profile.mjs';

const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const repository = process.cwd();
const guide = JSON.parse(await fs.readFile('.artifacts/m2-4/urban-civilians-native-batch49-v1/source.json', 'utf8'));
for (const member of ['cgpars11.shp', 'cgwash01.shp', 'cgwash14.shp', 'cgwash15.shp']) {
    test(`${member} keeps both original edition hashes and rejects wrong geometry`, () => {
        const originals = guide.sources.filter((source: any) => source.member === member);
        expect(originals.length).toBe(2);
        expect(originals[0].sha256).not.toBe(originals[1].sha256);
        const descriptors = originals.map((source: any) => ({ ...source, bodyFrames: source.totalFrames / 2 }));
        const contract: any = { theater: 'URBAN', sources: { [member]: descriptors[0] }, families: {
            ra2: { members: [member] }, yr: { members: [member], sourceOverrides: { [member]: descriptors[1] } },
        } };
        for (const [index, family] of ['ra2', 'yr'].entries()) {
            const source: any = { member, theater: 'URBAN', sha256: descriptors[index].sha256,
                canvas: descriptors[index].canvas, frames: Array(descriptors[index].bodyFrames).fill({}) };
            expect(environmentMemberSource(contract, family, member)).toBe(descriptors[index]);
            expect(environmentSourceDescriptor(contract, source)).toBe(descriptors[index]);
            expect(environmentSourceDescriptor(contract, { ...source, sha256: '0'.repeat(64) })).toBeUndefined();
            expect(environmentSourceDescriptor(contract, { ...source, frames: [] })).toBeUndefined();
            expect(environmentSourceDescriptor(contract, { ...source, canvas: [1, 1] })).toBeUndefined();
        }
        expect(environmentMemberSource(contract, 'missing', member)).toBeUndefined();
        expect(environmentMemberSource(contract, 'yr', 'unlisted.shp')).toBeUndefined();
    });
}

test('Desktop registration and additive assembly preserve same-named source variants', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'm24-environment-source-variants-')));
    const member = 'cgpars11.shp';
    const sourceHashes = guide.sources.filter((s: any) => s.member === member).map((s: any) => s.sha256);
    const descriptor = (sha256: string) => ({ sha256, bodyFrames: 4 });
    const family = (index: number) => ({ members: [member], familyHash: String(index + 1).repeat(64),
        ...(index ? { sourceOverrides: { [member]: descriptor(sourceHashes[index]) } } : {}) });
    const contract: any = { theater: 'URBAN', sources: { [member]: descriptor(sourceHashes[0]) },
        families: { ra2: family(0), yr: family(1) } };
    const write = async (name: string, value: any) => {
        const file = path.join(root, name);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify(value));
    };
    try {
        const packs: any[] = [];
        for (const [index, id] of ['ra2', 'yr'].entries()) {
            // Metadata-only fixtures exercise routing and provenance, not authored render acceptance.
            const metadata = { source: { member, sha256: sourceHashes[index] },
                logical: { frames: Array(4).fill({}) }, variants: [2, 4].map(density => ({ density, pages: [] })) };
            const relative = `members/cgpars11-shp-${sourceHashes[index]}/manifest.json`;
            const revision = `variant-${id}`;
            await write(`.local/environment-packs/${revision}/${relative}`, metadata);
            const pack = { schema: 'environment-shp-pack-v1', theater: 'URBAN', editions: ['ra2', 'yr'], revision,
                families: { [id]: { familyHash: contract.families[id].familyHash,
                    members: [{ member, path: relative, sha256: sha(JSON.stringify(metadata)) }] } } };
            await write(`.local/environment-packs/${revision}/manifest.json`, pack);
            packs.push(pack);
        }
        await write('.local/environment-urban-selection.json', { schemaVersion: 1, revision: packs[0].revision,
            sha256: sha(JSON.stringify(packs[0])) });
        await write('contract.json', contract);
        execFileSync('python3', [path.join(repository, 'scripts/m2/official-maps/combine-environment.py'),
            'variants-combined', '--contract', path.join(root, 'contract.json'),
            '--base-pointer', path.join(root, '.local/environment-urban-selection.json'),
            '--append', path.join(root, '.local/environment-packs/variant-yr'),
            '--receipt', path.join(root, 'assembly.json')], { cwd: root, stdio: 'pipe' });
        const assembly = JSON.parse(await fs.readFile(path.join(root, 'assembly.json'), 'utf8'));
        expect(assembly.preservedFamilies).toEqual(['ra2']);
        expect(assembly.appendedFamilies).toEqual(['yr']);
        expect(Object.keys(assembly.payloadHashes).length).toBe(2);
        await write('.local/environment-urban-selection.json', assembly.pack);
        contract.selectedPack = assembly.pack;
        const events: any[] = [];
        const registered = await registerEnvironmentPack(path.join(root, '.local'), (e: any) => events.push(e),
            contract, 'environment-urban-selection.json', '/selection');
        expect(events).toEqual([expect.objectContaining({ type: 'environment-registered' })]);
        const selected = registered.selections.get('/selection');
        expect(Object.keys(selected.families).sort()).toEqual(['ra2', 'yr']);
        expect(selected.families.ra2.members[0].manifest).not.toBe(selected.families.yr.members[0].manifest);
        expect(registered.routes.size).toBe(2);
        expect(events[0].type).toBe('environment-registered');
        delete contract.families.yr.sourceOverrides;
        const rejected = await registerEnvironmentPack(path.join(root, '.local'), (e: any) => events.push(e),
            contract, 'environment-urban-selection.json', '/selection');
        expect(rejected.routes.size).toBe(0);
        expect(rejected.selections.size).toBe(0);
        expect(events.at(-1).reason).toContain('native source identity');
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
