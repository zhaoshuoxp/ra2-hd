import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TmpFile } from '../../src/data/TmpFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../src/engine/renderable/entity/map/terrainHdContract';

const root = process.argv[2] ?? '.artifacts/m2-2/prepared-native-v1';
mkdirSync(root, { recursive: false });
mkdirSync(`${root}/native`);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const tree = editionRetailTree(top, 'yr');
const ledger = JSON.parse(readFileSync('docs/m2-2-map-coverage.json', 'utf8'));
const rows = ledger.rows.filter((row: any) => row.edition === 'yr' && row.usage['XMP03T4.map']
    && row.decision === 'MISSING_HD_TO_PRODUCE');
const palettes = new Map<string, { identity: any; palette: Palette }>();
const getPalette = (name: string) => {
    if (!palettes.has(name)) {
        const member = resolveMember(tree, name), bytes = Uint8Array.from(member.file.getBytes());
        palettes.set(name, { identity: { member: name, archive: member.source, sha256: sha(bytes) },
            palette: new Palette(member.file) });
        writeFileSync(`${root}/native/${name}`, bytes);
    }
    return palettes.get(name)!;
};
const colors = (indices: Uint8Array, palette: Palette) => {
    const rgba = new Uint8Array(indices.length * 4);
    indices.forEach((index, pixel) => {
        const color = palette.colors[index];
        rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
    });
    return rgba;
};
const sources = new Map<string, any>(), failures: any[] = [];
for (const row of rows) for (const [role, declared, context] of [
    ['body', row.source, row], ...(row.dependencies ?? []).map((dependency: any) =>
        [dependency.role, dependency.source, dependency]),
] as [string, any, any][]) {
    if (!declared?.sha256) { failures.push({ id: row.id, role, declared }); continue; }
    const paletteName = context.paletteType === 2 ? 'unittem.pal' : context.paletteType === 3 ? 'temperat.pal'
        : context.paletteType === 4 ? 'anim.pal' : context.paletteType === 5 ? `${context.customPalette}.pal` : 'isotem.pal';
    const key = `${declared.sha256}:${paletteName}`;
    const previous = sources.get(key);
    const binding = { id: row.id, kind: row.kind, role, nativeArt: context.nativeArt,
        damagedNativeArt: context.damagedNativeArt, hasShadow: context.hasShadow,
        remapable: context.remapable, drawOffset: context.drawOffset, extraOffset: context.extraOffset,
        palettePolicy: context.palettePolicy };
    if (previous) { previous.bindings.push(binding); continue; }
    const native = resolveMember(tree, declared.member), bytes = Uint8Array.from(native.file.getBytes());
    if (sha(bytes) !== declared.sha256) throw Error(`Source identity drift: ${declared.member}`);
    const source: any = { member: declared.member, sha256: declared.sha256, archive: native.source,
        bindings: [binding], nativeRules: row.nativeRules, nativeArt: context.nativeArt,
        hasShadow: context.hasShadow, remapable: context.remapable, drawOffset: context.drawOffset };
    const base = declared.member;
    writeFileSync(`${root}/native/${base}`, bytes);
    if (base.endsWith('.vxl')) {
        const hvaName = base.replace(/\.vxl$/, '.hva'), hva = resolveMember(tree, hvaName);
        const hvaBytes = Uint8Array.from(hva.file.getBytes());
        source.hva = { member: hvaName, archive: hva.source, sha256: sha(hvaBytes) };
        writeFileSync(`${root}/native/${hvaName}`, hvaBytes);
        const vpl = resolveMember(tree, 'voxels.vpl'), vplBytes = Uint8Array.from(vpl.file.getBytes());
        source.vpl = { member: 'voxels.vpl', archive: vpl.source, sha256: sha(vplBytes) };
        if (![...sources.values()].some(value => value.vpl)) writeFileSync(`${root}/native/voxels.vpl`, vplBytes);
        source.palette = getPalette('unittem.pal').identity;
        source.format = 'vxl';
    } else if (row.kind === 'tmp' && role === 'body') {
        const file = new TmpFile(native.file), palette = getPalette('isotem.pal');
        source.format = 'tmp'; source.palette = palette.identity;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        source.images = file.images.map((image, slot) => {
            const bitmap = new TmpDrawable().draw(image as any, file.blockWidth, file.blockHeight);
            const rgba = colors(bitmap.data, palette.palette), relative = `${base}-${slot}.rgba`;
            writeFileSync(`${root}/native/${relative}`, rgba);
            return { ...nativeTerrainMetadata(file, slot), nativeOffset: view.getInt32(16 + slot * 4, true),
                file: relative, size: [bitmap.width, bitmap.height], rgbaSha256: sha(rgba) };
        });
    } else {
        const file = new ShpFile(native.file), palette = getPalette(paletteName);
        source.format = 'shp'; source.palette = palette.identity; source.canvas = [file.width, file.height];
        source.frames = file.images.map((frame, slot) => {
            const rgba = colors(frame.imageData, palette.palette), relative = `${base}-${paletteName}-${slot}.rgba`;
            writeFileSync(`${root}/native/${relative}`, rgba);
            writeFileSync(`${root}/native/${base}-${slot}.index`, frame.imageData);
            return { slot, origin: [frame.x, frame.y], size: [frame.width, frame.height], file: relative,
                empty: frame.imageData.every(index => index === 0), indexSha256: sha(frame.imageData), rgbaSha256: sha(rgba) };
        });
    }
    sources.set(key, source);
}
const result = { schema: 'm2-2-native-export-input-v1', ledgerSha256: sha(readFileSync('docs/m2-2-map-coverage.json')),
    primaryMapSha256: ledger.primary.sha256, sources: [...sources.values()], failures,
    acceptance: 'Native reference/export inputs only. No authored HD resources or runtime publication.',
    densityContract: 'Independent 2X/4X sampling from sufficiently large approved masters; native metadata/slots/masks immutable.' };
writeFileSync(`${root}/source.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sources: sources.size, formats: Object.fromEntries(['tmp', 'shp', 'vxl'].map(format =>
    [format, result.sources.filter(source => source.format === format).length])),
    frames: result.sources.reduce((sum, source) => sum + (source.frames?.length ?? source.images?.length ?? 0), 0), failures }));
