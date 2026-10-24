import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { IniFile } from '../../src/data/IniFile';

const output = process.argv[2];
mkdirSync(output, { recursive: false });
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(`.local/assets/ra2/${name}`)])));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const assets: any[] = [];
for (const [name, paletteName] of [['glsl.shp', 'gls.pal'], ['glss.shp', 'gls.pal'],
    ['mnscrnl.shp', 'shell.pal'], ['lwscrnl.shp', 'shell.pal'], ['sdtp.shp', 'shell.pal'],
    ['bkgdlg.shp', 'uibkgd.pal'], ['bkgdmd.shp', 'uibkgd.pal'], ['bkgdsm.shp', 'uibkgd.pal'],
    ['fsbkgdlg.shp', 'uibkgd.pal'], ['pudlgbgn.shp', 'dialog.pal'],
    ['pudlgbga.shp', 'dialog.pal'], ['pudlgbgs.shp', 'dialog.pal'],
    ['ls800ustates.shp', 'mpls.pal'], ['ls800russia.shp', 'mpls.pal']]) {
    try {
        const member = resolveMember(tree, name), pal = resolveMember(tree, paletteName);
        const shp = new ShpFile(member.file), palette = new Palette(pal.file);
        const frames: any[] = [];
        for (let index = 0; index < Math.min(shp.numImages, 3); index++) {
            const frame = shp.getImage(index), rgba = new Uint8Array(shp.width * shp.height * 4);
            for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
                const pixel = frame.imageData[y * frame.width + x], color = palette.colors[pixel];
                rgba.set([color.r, color.g, color.b, pixel ? 255 : 0], ((frame.y + y) * shp.width + frame.x + x) * 4);
            }
            const file = `${name}-${index}.rgba`;
            writeFileSync(path.join(output, file), rgba);
            frames.push({ file, sha256: sha(rgba) });
        }
        assets.push({ name, paletteName, source: member.source, sha256: sha(member.file.getBytes()),
            width: shp.width, height: shp.height, count: shp.numImages, frames });
    } catch (error) { assets.push({ name, error: String(error) }); }
}
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const fountain = Object.fromEntries(['CAWASH18', 'CAWSH18A'].map(name =>
    [name, Object.fromEntries(art.getSection(name)?.entries ?? [])]));
writeFileSync(path.join(output, 'inventory.json'), JSON.stringify({ assets, fountain }, null, 2) + '\n');
console.log(JSON.stringify({ assets: assets.map(({ frames, ...asset }) => asset), fountain }));
