import fs from 'node:fs';
import path from 'node:path';
import { retailMember } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';

const out = path.resolve(process.argv[2]);
fs.mkdirSync(out, { recursive: false });
for (const edition of ['ra2', 'yr'] as const) {
    const rules = new IniFile(retailMember(edition, edition === 'ra2' ? 'rules.ini' : 'rulesmd.ini').file.readAsString());
    const art = new IniFile(retailMember(edition, edition === 'ra2' ? 'art.ini' : 'artmd.ini').file.readAsString());
    const move = rules.getSection('AudioVisual')!.getString('MoveFlash') || 'RING';
    const dead = rules.getSection('AudioVisual')!.getArray('DeadBodies').length ? rules.getSection('AudioVisual')!.getArray('DeadBodies') : ['DEATH_A', 'DEATH_B', 'DEATH_C', 'DEATH_D', 'DEATH_E', 'DEATH_F'];
    const plain = (name: string) => Object.fromEntries(art.getSection(name)?.entries ?? []);
    const info = { edition, move, moveArt: plain(move), dead, deadArt: Object.fromEntries(dead.map(n => [n, plain(n)])),
        gi: plain('GI'), giSequence: plain('GISequence') };
    fs.writeFileSync(path.join(out, edition + '-routing.json'), JSON.stringify(info, null, 2) + '\n');
    const names = ['gi.shp', (art.getSection(move)?.getString('Image') || move).toLowerCase() + '.shp',
        ...dead.map(n => (art.getSection(n)?.getString('Image') || n).toLowerCase() + '.shp')];
    for (const member of [...new Set(names)]) {
        const source = retailMember(edition, member), shp = new ShpFile(source.file);
        const palette = Palette.fromVirtualFile(retailMember(edition, 'unittem.pal').file);
        fs.writeFileSync(path.join(out, edition + '-' + member + '.json'), JSON.stringify({
            member, sha256: source.sha256, canvas: [shp.width, shp.height], palette: palette.colors,
            frames: shp.images.map((f, frame) => ({ frame, x: f.x, y: f.y, width: f.width, height: f.height, pixels: [...f.imageData] })),
        }));
    }
    console.log(JSON.stringify(info));
}
