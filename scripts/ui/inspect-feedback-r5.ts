import fs from 'node:fs';
import path from 'node:path';
import { retailMember } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';

const output = path.resolve(process.argv[2]);
fs.mkdirSync(output, { recursive: false });
for (const edition of ['ra2', 'yr'] as const) {
    const rules = new IniFile(retailMember(edition, edition === 'ra2' ? 'rules.ini' : 'rulesmd.ini').file.readAsString());
    const art = new IniFile(retailMember(edition, edition === 'ra2' ? 'art.ini' : 'artmd.ini').file.readAsString());
    const commonRules = new IniFile(retailMember(edition, 'rules.ini').file.readAsString());
    const commonArt = new IniFile(retailMember(edition, 'art.ini').file.readAsString());
    const name = rules.getSection('AudioVisual')?.getString('Behind') || commonRules.getSection('AudioVisual')!.getString('Behind');
    const objectArt = art.getSection(name) ?? commonArt.getSection(name);
    const member = (objectArt?.getString('Image') || name).toLowerCase() + '.shp';
    const source = retailMember(edition, member), shp = new ShpFile(source.file);
    const paletteSource = retailMember(edition, 'anim.pal'), palette = Palette.fromVirtualFile(paletteSource.file);
    const info = { edition, rule: 'AudioVisual.Behind', name, member, sourceHash: source.sha256,
        canvas: [shp.width, shp.height], art: Object.fromEntries(objectArt?.entries ?? []),
        paletteSourceHash: paletteSource.sha256, palette: palette.colors,
        frames: shp.images.map((f, frame) => ({ frame, x: f.x, y: f.y, width: f.width, height: f.height, pixels: [...f.imageData] })),
        path: 'PipOverlay.updateBehindAnim -> Anim(BEHIND), renderOrder=999995; independent of MoveFlash and pointer.' };
    fs.writeFileSync(path.join(output, edition + '-behind.json'), JSON.stringify(info) + '\n');
    console.log(JSON.stringify({ ...info, palette: undefined, frames: shp.numImages }));
}
