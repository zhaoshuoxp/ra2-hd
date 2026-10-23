import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { MapFile } from '../../src/data/MapFile';
import { TmpFile } from '../../src/data/TmpFile';
import { Palette } from '../../src/data/Palette';
import { TileSets } from '../../src/game/theater/TileSets';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';

const out = process.argv[2] ?? '.artifacts/m2-1/inventory';
mkdirSync(out, { recursive: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const result: any = { schema: 'temperate-native-inventory-v1', editions: {} };
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const iniMember = resolveMember(tree, edition === 'yr' ? 'temperatmd.ini' : 'temperat.ini');
    const ini = new IniFile(iniMember.file);
    writeFileSync(`${out}/${edition}-theater.ini`, iniMember.file.getBytes());
    const palette = new Palette(resolveMember(tree, 'isotem.pal').file);
    const decoded = new Map<string, TmpFile>();
    const metadata = new Map<TmpFile, any>();
    const tileSets = new TileSets(ini);
    tileSets.loadTileData({ get(name: string) {
        if (decoded.has(name)) return decoded.get(name);
        try {
            const member = resolveMember(tree, name), sourceHash = hash(member.file.getBytes());
            const file = new TmpFile(member.file);
            decoded.set(name, file);
            metadata.set(file, { member: name, archive: member.source, sha256: sourceHash });
            return file;
        } catch { return undefined; }
    } }, '.tem');
    const sets = (tileSets as any).tileSets.map((set: any, index: number) => ({
        index, name: set.setName, prefix: set.fileName, entries: set.entries.length,
        members: set.entries.flatMap((entry: any) => entry.files.map((file: TmpFile) => ({
            ...metadata.get(file), dimensions: [file.width, file.height], block: [file.blockWidth, file.blockHeight],
            images: file.images.map((image, subTile) => ({ subTile, x: image.x, y: image.y,
                height: image.height, terrainType: image.terrainType, rampType: image.rampType,
                hasExtraData: image.hasExtraData, hasZData: image.hasZData,
                extra: [image.extraX, image.extraY, image.extraWidth, image.extraHeight] }))
        })))
    }));
    const pkt = new IniFile(resolveMember(tree, edition === 'yr' ? 'missionsmd.pkt' : 'missions.pkt').file);
    const maps: any[] = [];
    for (const raw of pkt.getSection('MultiMaps')!.entries.values()) {
        const name = String(Array.isArray(raw) ? raw[0] : raw) + '.map';
        try {
            const member = resolveMember(tree, name), map = new MapFile(member.file);
            if (map.theaterType !== 1) continue;
            const coverage = new Map<number, number>();
            for (const tile of map.tiles) {
                const set = tileSets.getSetNum(tile.tileNum);
                coverage.set(set, (coverage.get(set) ?? 0) + 1);
            }
            maps.push({ member: name, archive: member.source, sha256: hash(member.file.getBytes()),
                size: map.fullSize, starts: map.startingLocations.length,
                elevation: [...new Set(map.tiles.map(tile => tile.z))],
                coverage: [...coverage].map(([index, cells]) => ({ index, name: sets[index].name, cells })) });
        } catch (error) { console.warn('Map inventory skipped', name, String(error)); }
    }
    result.editions[edition] = { theater: { member: iniMember.file.filename, archive: iniMember.source,
        sha256: hash(iniMember.file.getBytes()) }, general: Object.fromEntries(ini.getSection('General')!.entries), sets, maps };
    if (edition === 'yr') {
        const samples = sets.filter((set: any) => [0, 9, 10, 13, 14, 16, 17, 18, 20, 23, 25, 33, 34, 36, 40, 41, 42, 43, 47].includes(set.index));
        mkdirSync(`${out}/native`, { recursive: true });
        for (const set of samples) for (const member of set.members) {
            const file = decoded.get(member.member)!;
            for (let subTile = 0; subTile < file.images.length; subTile++) {
                const bitmap = new TmpDrawable().draw(file.images[subTile] as any, file.blockWidth, file.blockHeight);
                const rgba = new Uint8Array(bitmap.width * bitmap.height * 4);
                bitmap.data.forEach((index, i) => {
                    const color = palette.colors[index];
                    rgba.set([color.r, color.g, color.b, index ? 255 : 0], i * 4);
                });
                writeFileSync(`${out}/native/${member.member}-${subTile}.rgba`, rgba);
                member.images[subTile].canvas = [bitmap.width, bitmap.height];
            }
        }
    }
}
writeFileSync(`${out}/inventory.json`, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.editions).map(([edition, value]: any) =>
    [edition, { sets: value.sets.filter((set: any) => /clear|dirt|grass|road|cliff|ramp|slope/i.test(set.name))
        .map((set: any) => ({ index: set.index, name: set.name, members: set.members.length,
            images: set.members.reduce((n: number, member: any) => n + member.images.length, 0) })), maps: value.maps }]))));
