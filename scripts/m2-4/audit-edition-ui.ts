import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { loadingArtwork, getLoadingArtwork } from '../../src/gui/screen/game/loadingScreen/loadingArtwork';

const output = process.argv[2];
mkdirSync(output, { recursive: false });
const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync('.local/assets/' + (name.includes('md') ? 'yr/' : 'ra2/') + name)]));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const entries: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const tree = editionRetailTree(top, edition);
    const requests = [
        ...['fsbkgdlg', 'fsbkgdsm', 'bkgdlg', 'bkgdmd', 'bkgdsm'].map(name => ({ name: name + '.shp',
            palette: edition === 'yr' && name === 'fsbkgdlg' ? 'fsbkgdlg.pal' : 'uibkgd.pal' })),
        ...['pudlgbgn', 'pudlgbga', 'pudlgbgs', 'pudlgbgy'].map(name => ({ name: name + '.shp',
            palette: edition === 'yr' && ['pudlgbgn', 'pudlgbgy'].includes(name)
                ? (name === 'pudlgbgn' ? 'dialogn.pal' : 'dialogy.pal') : 'dialog.pal' })),
        ...Object.keys(loadingArtwork).flatMap(country => {
            const art = getLoadingArtwork(country, edition);
            return art ? [{ name: art.image + '.shp', palette: art.palette, country }] : [];
        }),
    ];
    for (const request of requests) {
        try {
            const member = resolveMember(tree, request.name), pal = resolveMember(tree, request.palette);
            const shp = new ShpFile(member.file), palette = new Palette(pal.file), frame = shp.getImage(0);
            const rgba = new Uint8Array(shp.width * shp.height * 4);
            for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
                const index = frame.imageData[y * frame.width + x], color = palette.colors[index];
                rgba.set([color.r, color.g, color.b, 255], ((frame.y + y) * shp.width + frame.x + x) * 4);
            }
            const file = `${edition}-${request.name}.rgba`;
            writeFileSync(path.join(output, file), rgba);
            entries.push({ edition, ...request, source: member.source, sha256: sha(member.file.getBytes()),
                paletteSource: pal.source, paletteSha256: sha(pal.file.getBytes()),
                width: shp.width, height: shp.height, frames: shp.numImages, file, rgbaSha256: sha(rgba) });
        } catch (error) { entries.push({ edition, ...request, error: String(error) }); }
    }
}
writeFileSync(path.join(output, 'inventory.json'), JSON.stringify(entries, null, 2) + '\n');
console.log(JSON.stringify(entries.map(({ file, ...entry }) => entry), null, 2));
