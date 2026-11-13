import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { retailMember, sha256 } from '../test-support/resources';

const output = path.resolve(process.argv[2]); fs.mkdirSync(output, { recursive: false });
const curated = process.argv.includes('--material-semantics');
const pureGrass = process.argv.includes('--pure-grass');
const colorControls = process.argv.includes('--material-color-controls');
const theater = process.argv.find(value => value.startsWith('--theater='))?.slice(10) ?? 'URBAN';
assert(['URBAN', 'NEWURBAN'].includes(theater));
assert(!colorControls || theater === 'NEWURBAN' && curated);
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const guide = `.local/source-art/yr-campaign-v1/terrain-remaining-r1/${theater.toLowerCase()}/original-r1`;
const source = read(`${guide}/source.json`);
const pointer = theater === 'URBAN'
    ? read('docs/campaign-art/yr-v1/terrain-urban-paving-registration-r4.json').priorSelection
    : read('.local/terrain-newurban-selection.json');
const root = `.local/terrain-packs/${pointer.revision}`;
assert.equal(sha256(fs.readFileSync(`${root}/manifest.json`)), pointer.sha256);
const manifest = read(`${root}/manifest.json`), donors: any[] = [], palettes = new Map<string, Palette>();
const selections = [{ pointer, manifest, theater }];
if (process.argv.includes('--urban-sidewalk-material')) {
    assert.equal(theater, 'NEWURBAN');
    const pointer = read('docs/campaign-art/yr-v1/terrain-urban-paving-registration-r4.json').priorSelection;
    const bytes = fs.readFileSync(`.local/terrain-packs/${pointer.revision}/manifest.json`);
    assert.equal(sha256(bytes), pointer.sha256);
    selections.push({ pointer, manifest: JSON.parse(bytes.toString()), theater: 'URBAN' });
}
for (const selection of selections) for (const group of selection.manifest.groups) for (const member of group.members) {
    const edition = member.sourceHashes.yr ? 'yr' : 'ra2';
    const native = new TmpFile(retailMember(edition, member.member, member.sourceHashes[edition]).file);
    const paletteKey = `${edition}/${selection.theater}`;
    if (!palettes.has(paletteKey)) palettes.set(paletteKey,
        new Palette(retailMember(edition, selection.theater === 'URBAN' ? 'isourb.pal' : 'isoubn.pal').file));
    const palette = palettes.get(paletteKey)!;
    for (const [index, image] of native.images.entries()) {
        const metadata = nativeTerrainMetadata(native, index);
        if (metadata.logical.join() !== '60,30' || metadata.offset.join() !== '0,0'
            || metadata.rampType !== 0 || metadata.hasExtraData) continue;
        const bitmap = new TmpDrawable().draw(image as any, native.blockWidth, native.blockHeight);
        const rgba = new Uint8Array(bitmap.data.length * 4);
        bitmap.data.forEach((color, pixel) => { const c = palette.colors[color];
            rgba.set([c.r, c.g, c.b, color ? 255 : 0], pixel * 4); });
        donors.push({ group: group.id, member: member.member, subTile: index,
            edition, sourceSha256: member.sourceHashes[edition], rgba,
            donorTheater: selection.theater, acceptedSelection: selection.pointer });
    }
}
const records = [];
const materialControlWindows: Record<string, Record<string, number[]>> = colorControls ? {
    'pavfxb01.ubn': { asphalt: [0, 0, 60, 15] },
    'pavfxb03.ubn': { asphalt: [0, 19, 60, 30] },
    'pavfxb02.ubn': { asphalt: [40, 0, 60, 30] },
} : {};
const newUrbanMembers = new Set(['pavefx04.ubn', 'pavefx02.ubn', 'grfix04.ubn', 'grfix03.ubn',
    'rbfix06.ubn', 'rbfix04.ubn', 'rbfix05.ubn', 'rbfix07.ubn', 'rbfix08.ubn',
    'pavfxb03.ubn', 'pavfxb01.ubn', 'pavfxb02.ubn']);
for (const member of source.sources.filter((member: any) => theater === 'URBAN' || newUrbanMembers.has(member.member))) {
    assert.equal(member.images.length, 1);
    const image = member.images[0], bytes = fs.readFileSync(`${guide}/native/${image.file}`);
    assert.equal(sha256(bytes), image.rgbaSha256);
    const masks = new Map<string, number[]>();
    const add = (role: string, pixel: number) => {
        const window = materialControlWindows[member.member]?.[role], x = pixel % 60, y = Math.floor(pixel / 60);
        if (window && (x < window[0] || y < window[1] || x >= window[2] || y >= window[3])) return;
        masks.set(role, [...(masks.get(role) ?? []), pixel]);
    };
    for (let pixel = 0; pixel < bytes.length / 4; pixel++) {
        if (!bytes[pixel * 4 + 3]) continue;
        const r = bytes[pixel * 4], g = bytes[pixel * 4 + 1], y = Math.floor(pixel / 60);
        if (theater === 'NEWURBAN') {
            const b = bytes[pixel * 4 + 2], maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
            const grass = /^(pavefx|grfix)/.test(member.member);
            const redPaving = /^(rbfix|pavfxb)/.test(member.member);
            const asphalt = /^(pavefx|pavfxb)/.test(member.member);
            if (grass && g - r > 8 && g - b > 8) add('grass', pixel);
            else if (redPaving && r - g > 32 && r - b > 32) add('paving', pixel);
            else if (r + g + b > 420 && maximum - minimum < 60) add('sidewalk', pixel);
            else if (asphalt && maximum < 95 && maximum - minimum < 24) add('asphalt', pixel);
        } else if (member.member.startsWith('gbfix')) {
            if (g - r > 8) add('grass', pixel);
            else if (r - g > 18) add('paving', pixel);
        } else if (y < 13 && r - g > 18) add('paving', pixel);
        else if (y >= 15 && y <= 19) add('sidewalk', pixel);
        else if (y >= 22) add('asphalt', pixel);
    }
    for (const [role, mask] of masks) {
        const requiredMaterialCoverage = ['grass', 'asphalt'].includes(role) ? 0 : .95;
        const roleDonors = curated ? donors.filter(donor => theater === 'NEWURBAN'
            ? role === 'grass' ? /^clear01[a-z]?\.ubn$/.test(donor.member)
                : role === 'paving' ? /newurban-ground-set(?:39|46)$/.test(donor.group)
                : role === 'sidewalk' ? colorControls && /^(pavefx|pavfxb)/.test(member.member)
                    ? /^droads[0-9]+[a-z]?\.ubn$/.test(donor.member)
                    : /^(pave[0-9]+|pvclr01)[a-z]?\.ubn$/.test(donor.member)
                        || /^clear01[a-z]?\.urb$/.test(donor.member)
                : /^droads[0-9]+[a-z]?\.ubn$/.test(donor.member)
            : role === 'grass'
            ? pureGrass ? /^green[0-9]+[a-z]?\.urb$/.test(donor.member)
                : donor.member === member.member.replace('gbfix', 'grfix')
            : role === 'paving' ? /urban-pavement-set(?:39|46)$/.test(donor.group)
            : /urban-(?:side-)?roads-set/.test(donor.group)) : donors;
        assert(roleDonors.length, 'Original material role needs a semantic source cohort');
        const candidates = roleDonors.map(donor => {
            let identical = 0, withinPaletteSteps = 0, error = 0, covered = 0, materialControls = 0;
            const targetMean = [0, 0, 0], donorMean = [0, 0, 0];
            for (const pixel of mask) {
                const offset = pixel * 4;
                if (donor.rgba[offset + 3] !== 255) { error += 765; continue; }
                covered++;
                const [red, green, blue] = donor.rgba.subarray(offset, offset + 3);
                const peak = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
                if (role === 'sidewalk' ? red + green + blue > 420 && peak - minimum < 60
                    : role === 'asphalt' ? peak < 95 && peak - minimum < 24
                    : role === 'grass' ? green - red > 8 && green - blue > 8
                    : red - green > 32 && red - blue > 32) materialControls++;
                let difference = 0, maximum = 0;
                for (let channel = 0; channel < 3; channel++) {
                    targetMean[channel] += bytes[offset + channel] / mask.length;
                    donorMean[channel] += donor.rgba[offset + channel] / mask.length;
                    const delta = Math.abs(bytes[offset + channel] - donor.rgba[offset + channel]);
                    difference += delta; maximum = Math.max(maximum, delta);
                }
                if (maximum <= 12) withinPaletteSteps++;
                if (!difference) identical++; error += difference;
            }
            const { rgba, ...identity } = donor;
            const meanColorDifference = targetMean.reduce((sum, value, channel) =>
                sum + Math.abs(value - donorMean[channel]), 0) / 3;
            return { ...identity, exactFraction: identical / mask.length,
                targetMean, donorMean, coverageFraction: covered / mask.length, meanColorDifference,
                nativeMaterialCoverage: materialControls / mask.length,
                withinThreePaletteSteps: withinPaletteSteps / mask.length,
                meanChannelError: error / mask.length / 3 };
        }).sort((a, b) => colorControls
            ? Number(b.coverageFraction === 1 && b.nativeMaterialCoverage >= requiredMaterialCoverage)
                - Number(a.coverageFraction === 1 && a.nativeMaterialCoverage >= requiredMaterialCoverage)
                || b.coverageFraction - a.coverageFraction || a.meanColorDifference - b.meanColorDifference
                || a.meanChannelError - b.meanChannelError
            : a.meanChannelError - b.meanChannelError || b.exactFraction - a.exactFraction);
        records.push({ member: member.member, targetSourceSha256: member.sha256, role, controls: mask.length,
            controlWindow: materialControlWindows[member.member]?.[role],
            requiredNativeMaterialCoverage: requiredMaterialCoverage,
            qualified: candidates[0].exactFraction >= .95,
            materialAppearanceCandidate: candidates[0].meanChannelError <= 4,
            best: candidates.slice(0, colorControls ? 20 : 3) });
    }
}
const report = { schema: 'yr-urban-source-ground-region-reuse-audit-v1',
    status: 'READ_ONLY_SOURCE_REGION_QUALIFICATION_NATIVE_AND_VISUAL_SEPARATE', theater, acceptedSelection: pointer,
    qualification: 'Exact controls and source palette error are reported separately. A similar material region is not a complete original-image reuse qualification. Target source/geometry, accepted HD pixel provenance and native visual context require independent evidence.',
    materialSemanticsConstrained: curated, pureGrassMaterial: pureGrass,
    materialColorControls: colorControls,
    colorControlScope: colorControls
        ? 'Only complete opaque source material controls are ranked by region color. Per-pixel equality and error remain recorded; this is material composition, with separate target geometry and visual qualification.'
        : 'Per-pixel source control ranking retained.',
    records, runtimeSelectionsChanged: 0, newArtwork: 0 };
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ qualifiedRegions: records.filter(row => row.qualified).length,
    regions: records.length, donors: donors.length, output }));
