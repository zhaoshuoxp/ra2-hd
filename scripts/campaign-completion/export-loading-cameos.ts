import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { retailIni, retailMember, sha256 } from '../test-support/resources';

const [directory, ...identities] = process.argv.slice(2);
assert(directory && identities.length);
fs.mkdirSync(directory, { recursive: false });
const rules = retailIni('ra2'), art = retailIni('ra2', 'art');
const paletteMember = retailMember('ra2', 'cameo.pal'), palette = new Palette(paletteMember.file);
const records = identities.map(identity => {
    const nativeRules = rules.getSection(identity); assert(nativeRules, identity);
    const image = nativeRules.getString('Image', identity), nativeArt = art.getSection(image);
    assert(nativeArt?.getString('Cameo'), 'Original Cameo identity required: ' + identity);
    const name = nativeArt.getString('Cameo').toLowerCase() + '.shp', member = retailMember('ra2', name);
    const shp = new ShpFile(member.file); assert.equal(shp.numImages, 1);
    const frame = shp.getImage(0), png = new PNG({ width: frame.width, height: frame.height });
    frame.imageData.forEach((index, pixel) => {
        const color = palette.getColor(index); png.data.set([color.r, color.g, color.b, 255], pixel * 4);
    });
    const file = identity.toLowerCase() + '-cameo-original.png', bytes = PNG.sync.write(png);
    fs.writeFileSync(path.join(directory, file), bytes, { flag: 'wx' });
    return { identity, image, cameo: name, sourceSha256: member.sha256, archive: member.source,
        palette: 'cameo.pal', paletteSha256: paletteMember.sha256, file, pngSha256: sha256(bytes),
        nativeRules: Object.fromEntries(nativeRules.entries), nativeArt: Object.fromEntries(nativeArt.entries) };
});
fs.writeFileSync(path.join(directory, 'source.json'), JSON.stringify({ schema: 'original-loading-cameo-reference-v1',
    edition: 'ra2', records, scope: 'Unmodified original production cameos for design/identity reference only; no HD or runtime acceptance.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(records.map(record => ({ identity: record.identity, cameo: record.cameo }))));
