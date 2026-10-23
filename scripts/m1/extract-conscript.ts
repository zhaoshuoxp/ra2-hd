import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { IniFile } from '../../src/data/IniFile';
const out = '.artifacts/m1-1';
mkdirSync(out, { recursive: true });
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
    [name, readFileSync(`.local/assets/ra2/${name}`)])));
const member = resolveMember(tree, 'cons.shp');
const bytes = member.file.getBytes();
const shp = new ShpFile(member.file);
const palette = new Palette(resolveMember(tree, 'unittem.pal').file);
const art = new IniFile(resolveMember(tree, 'art.ini').file.readAsString());
const raw = { source: { kind: 'resolved-shp-member', member: 'cons.shp', theater: 'TEMPERATE',
    sha256: createHash('sha256').update(bytes).digest('hex') },
    canvas: [shp.width, shp.height], palette: palette.colors.map(c => [c.r, c.g, c.b]),
    frames: shp.images.map((f, nativeFrame) => ({ nativeFrame, x: f.x, y: f.y, width: f.width,
        height: f.height, pixels: Array.from(f.imageData) })),
    sequences: Object.fromEntries(art.getSection('ConSequence')!.entries) };
writeFileSync(`${out}/conscript-source.json`, JSON.stringify(raw));
writeFileSync(`${out}/cons.shp`, bytes);
console.log(JSON.stringify({ source: raw.source, canvas: raw.canvas, visibleFrames: shp.numImages / 2,
    maxTrim: [Math.max(...shp.images.slice(0, 301).map(f => f.width)), Math.max(...shp.images.slice(0, 301).map(f => f.height))] }));
