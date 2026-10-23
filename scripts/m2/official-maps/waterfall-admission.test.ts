import { selectedPack, nativeShpSource, sha256 } from '../../test-support/resources';
import { beforeAll, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolveHdSprite } from '../../../src/engine/renderable/builder/resolveHdSprite';

let root: string, pack: any;
beforeAll(() => { const selected = selectedPack('environment'); root = selected.directory; pack = selected.manifest; });
const names = ['wa01x.tem', 'wa02x.tem', 'wa03x.tem', 'wa04x.tem', 'wb01x.tem', 'wb02x.tem',
    'wb03x.tem', 'wb04x.tem', 'wd01x.tem', 'wd02x.tem', 'wd04x.tem'];
function fixture(name: string) {
    const member = Object.values(pack.families).flatMap((family: any) => family.members)
        .find((member: any) => member.member === name) as any;
    if (!member) throw Error(`Selected environment lacks required member ${name}`);
    const bytes = readFileSync(`${root}/${member.path}`);
    expect(sha256(bytes)).toBe(member.sha256);
    const manifest = JSON.parse(bytes.toString());
    const { source } = nativeShpSource('ra2', name, manifest.source.sha256, manifest.logical.frames.length, manifest.source.theater);
    return { manifest, source, hash: member.sha256 };
}

test('all eleven complete native waterfall manifests reach page validation at both densities', async () => {
    for (const name of names) for (const density of [2, 4]) {
        const { manifest, source, hash } = fixture(name);
        expect(manifest.color.visualOpacity).toBe(.64);
        let reads = 0;
        const result = await resolveHdSprite(manifest, hash, source, density, 2048, async () => {
            reads++; throw Error('waterfall-page-validation-reached');
        }, () => {}, false, true);
        expect(reads).toBeGreaterThan(0);
        expect(result.attempts.at(-1)?.reason).toBe('waterfall-page-validation-reached');
        expect(result.override).toBeUndefined();
    }
});

test('altered native identities, non-waterfall opacity and invalid opacity fail before page reads', async () => {
    const waterfall = fixture('wa01x.tem'), flag = fixture('ctusfgl_a.shp');
    const inputs = [
        { ...waterfall, source: { ...waterfall.source, sha256: 'a'.repeat(64) } },
        { ...waterfall, source: { ...waterfall.source, theater: 'SNOW' } },
        { ...flag, manifest: { ...flag.manifest, color: { ...flag.manifest.color, visualOpacity: .64 } } },
        ...[0, -1, 1.01, NaN].map(value => ({ ...waterfall, manifest: {
            ...waterfall.manifest, color: { ...waterfall.manifest.color, visualOpacity: value } } })),
    ];
    for (const { manifest, source, hash } of inputs) {
        let reads = 0;
        const result = await resolveHdSprite(manifest, hash, source, 4, 2048, async () => {
            reads++; throw Error('unexpected-page-read');
        }, () => {}, false, true);
        expect(reads).toBe(0);
        expect(result.override).toBeUndefined();
        expect(result.attempts[0]?.reason).toBe('source-or-contract-mismatch');
    }
});
