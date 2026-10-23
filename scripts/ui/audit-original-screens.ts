// Decode only explicitly named original menu/loading resources from isolated imports.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { loadingArtwork, getLoadingArtwork } from '../../src/gui/screen/game/loadingScreen/loadingArtwork';

const output = '.artifacts/menu-ui/original-screens';
mkdirSync(output, { recursive: true });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(`.local/assets/ra2/${name}`)])));
const requests = [
    ...Object.entries(loadingArtwork).filter(([country]) => country !== 'YuriCountry')
        .map(([country]) => {
            const artwork = getLoadingArtwork(country, 'ra2')!;
            return [artwork.image + '.shp', artwork.palette];
        }),
    ['mnscrnl.shp', 'shell.pal'], ['lwscrnl.shp', 'shell.pal'], ['sdtp.shp', 'shell.pal'],
    ['glsl.shp', 'gls.pal'],
];
const assets: object[] = [];
for (const [name, paletteName] of requests) {
    try {
        const member = resolveMember(tree, name), palMember = resolveMember(tree, paletteName);
        const shp = new ShpFile(member.file), palette = new Palette(palMember.file);
        const frame = shp.getImage(0), rgba = new Uint8Array(shp.width * shp.height * 4);
        for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
            const index = frame.imageData[y * frame.width + x], color = palette.colors[index];
            const position = ((frame.y + y) * shp.width + frame.x + x) * 4;
            rgba.set([color.r, color.g, color.b, index ? 255 : 0], position);
        }
        writeFileSync(`${output}/${name}.rgba`, rgba);
        assets.push({ name, source: member.source, sha256: hash(member.file.getBytes()),
            palette: paletteName, paletteSource: palMember.source, paletteSha256: hash(palMember.file.getBytes()),
            width: shp.width, height: shp.height, frames: shp.numImages,
            frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
            variants: tree.filter(owner => owner.mix.containsFile(name)).map(owner => owner.path) });
    } catch (error) { assets.push({ name, error: String(error) }); }
}
let video: object;
try {
    const member = resolveMember(tree, 'ra2ts_l.bik');
    writeFileSync(`${output}/ra2ts_l.bik`, member.file.getBytes());
    video = { name: 'ra2ts_l.bik', source: member.source, sha256: hash(member.file.getBytes()), bytes: member.file.getSize() };
} catch (error) { video = { name: 'ra2ts_l.bik', error: String(error) }; }
writeFileSync(`${output}/inventory.json`, JSON.stringify({ assets, video }, null, 2));
console.log(JSON.stringify({ assets, video }, null, 2));
