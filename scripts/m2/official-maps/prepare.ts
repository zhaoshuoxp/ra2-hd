// Export immutable native guides for missing theater families and their children.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../../src/offline/editionRetail';
import { resolveMember } from '../../../src/offline/retail';
import { ShpFile } from '../../../src/data/ShpFile';
import { TmpFile } from '../../../src/data/TmpFile';
import { Palette } from '../../../src/data/Palette';
import { TmpDrawable } from '../../../src/engine/gfx/drawable/TmpDrawable';
import { nativeTerrainMetadata } from '../../../src/engine/renderable/entity/map/terrainHdContract';

const [inventoryFile, root, theater = 'TEMPERATE'] = process.argv.slice(2);
const memberAllowlist = process.argv.find(arg => arg.startsWith('--members='))?.slice(10).split(',');
if (memberAllowlist && (!memberAllowlist.every(Boolean) || new Set(memberAllowlist).size !== memberAllowlist.length))
    throw Error('Member allowlist must contain unique nonempty source names');
if (!inventoryFile || !root) throw Error('Usage: prepare.ts <inventory.json> <new-output-directory>');
mkdirSync(root, { recursive: false }); mkdirSync(`${root}/native`);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const ledger = JSON.parse(readFileSync(inventoryFile, 'utf8'));
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = new Map(['ra2', 'yr'].map(edition => [edition, editionRetailTree(top, edition as 'ra2' | 'yr')]));
const sources = new Map<string, any>(), palettes = new Map<string, Palette>();
const rows = ledger.rows.filter((row: any) => row.theater === theater && row.decision === 'MISSING_AUTHORED_FAMILY'
    && (!memberAllowlist || memberAllowlist.includes(row.source?.member)));
if (memberAllowlist) for (const member of memberAllowlist)
    if (!rows.some((row: any) => row.source?.member === member)) throw Error(`Requested native member was not resolved: ${member}`);
for (const row of rows) for (const [role, source, context] of [
    ['body', row.source, row], ...(row.dependencies ?? []).map((child: any) => [child.role, child.source, child]),
] as [string, any, any][]) {
    if (!source?.sha256 || !/\.(tem|sno|urb|ubn|des|shp|vxl)$/.test(source.member)) continue;
    const tree = trees.get(row.edition)!;
    const paletteIdentity = context.palette ?? row.palette ?? (() => {
        const name = ({ TEMPERATE: 'isotem', SNOW: 'isosno', URBAN: 'isourb', NEWURBAN: 'isoubn', DESERT: 'isodes' } as any)[theater] + '.pal';
        const file = resolveMember(tree, name);
        return { member: name, archive: file.source, sha256: sha(file.file.getBytes()) };
    })();
    const key = `${source.member}:${source.sha256}:${paletteIdentity.sha256}`;
    const binding = { id: row.id, edition: row.edition, kind: row.kind, role,
        nativeArt: context.nativeArt ?? row.nativeArt, nativeRules: row.nativeRules,
        damagedNativeArt: context.damagedNativeArt, hasShadow: context.hasShadow ?? row.hasShadow,
        remapable: context.remapable ?? row.remapable, drawOffset: row.drawOffset, extraOffset: context.extraOffset,
        mapIds: Object.keys(row.usage), states: row.states };
    if (sources.has(key)) { sources.get(key).bindings.push(binding); continue; }
    const file = resolveMember(tree, source.member).file;
    if (sha(file.getBytes()) !== source.sha256) throw Error(`Source drift: ${row.edition}:${source.member}`);
    // RA2 and YR may provide different original bytes under the same member name.
    const nativeDirectory = `${source.member.replace('.', '-')}-${source.sha256}-${paletteIdentity.sha256}`;
    mkdirSync(`${root}/native/${nativeDirectory}`);
    const save = (name: string, bytes: Uint8Array) => {
        const relative = `${nativeDirectory}/${name}`;
        writeFileSync(`${root}/native/${relative}`, bytes, { flag: 'wx' }); return relative;
    };
    const nativeFile = save(source.member, file.getBytes());
    if (!palettes.has(paletteIdentity.sha256)) {
        const native = resolveMember(tree, paletteIdentity.member).file;
        if (sha(native.getBytes()) !== paletteIdentity.sha256) throw Error('Palette drift');
        palettes.set(paletteIdentity.sha256, new Palette(native));
        writeFileSync(`${root}/native/${paletteIdentity.sha256}.pal`, native.getBytes(), { flag: 'wx' });
    }
    const palette = palettes.get(paletteIdentity.sha256)!;
    const colors = (indices: Uint8Array) => {
        const rgba = new Uint8Array(indices.length * 4);
        indices.forEach((index, pixel) => {
            const color = palette.colors[index];
            rgba.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
        }); return rgba;
    };
    const entry: any = { ...source, key, nativeFile, palette: paletteIdentity, bindings: [binding],
        hasShadow: binding.hasShadow, remapable: binding.remapable, nativeArt: binding.nativeArt,
        nativeRules: row.nativeRules, setIndex: row.set, setName: row.setName };
    if (source.member.endsWith('.vxl')) {
        entry.format = 'vxl';
        const hvaName = source.member.replace(/\.vxl$/, '.hva');
        const hva = resolveMember(tree, hvaName);
        const bytes = hva.file.getBytes();
        entry.hva = { member: hvaName, archive: hva.source, sha256: sha(bytes),
            bytes: bytes.length, nativeFile: save(hvaName, bytes) };
    } else if (row.kind === 'tmp' && role === 'body') {
        entry.format = 'tmp';
        const tmp = new TmpFile(file), view = new DataView(file.getBytes().buffer, file.getBytes().byteOffset, file.getSize());
        entry.emptySlots = tmp.emptySlots;
        entry.images = tmp.images.flatMap((image, slot) => {
            const bitmap = new TmpDrawable().draw(image as any, tmp.blockWidth, tmp.blockHeight);
            const rgba = colors(bitmap.data);
            return [{ ...nativeTerrainMetadata(tmp, slot), nativeOffset: view.getInt32(16 + slot * 4, true),
                size: [bitmap.width, bitmap.height], file: save(`${slot}.rgba`, rgba), rgbaSha256: sha(rgba) }];
        });
    } else {
        entry.format = 'shp';
        const shp = new ShpFile(file); entry.canvas = [shp.width, shp.height];
        entry.frames = shp.images.map((frame, slot) => {
            const rgba = colors(frame.imageData);
            return { slot, origin: [frame.x, frame.y], size: [frame.width, frame.height],
                empty: frame.imageData.every(index => index === 0),
                file: save(`${slot}.rgba`, rgba), indexFile: save(`${slot}.index`, frame.imageData),
                indexSha256: sha(frame.imageData), rgbaSha256: sha(rgba) };
        });
    }
    sources.set(key, entry);
}
writeFileSync(`${root}/source.json`, JSON.stringify({ schema: 'm2-3-native-export-input-v1',
    inventoryFile, theater, inventorySha256: sha(readFileSync(inventoryFile)), sources: [...sources.values()],
    nativeMemberAllowlist: memberAllowlist,
    status: 'IMMUTABLE_NATIVE_GUIDES_ONLY_NO_AUTHORED_HD_OR_RUNTIME_CLAIM' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sources: sources.size, formats: Object.fromEntries(['tmp', 'shp', 'vxl'].map(format =>
    [format, [...sources.values()].filter(source => source.format === format).length])) }));
