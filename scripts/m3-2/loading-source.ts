import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
export function extractCampaignLoadingSource(mission: string, directory: string) {
    mkdirSync(directory, { recursive: true });
    const source = JSON.parse(readFileSync(`.local/campaign/ra2/${mission}/presentation.json`, 'utf8'));
    const spec = source.sprites.mission;
    const member = retailMember('ra2', spec.image), image = new ShpFile(member.file), frame = image.getImage(0);
    const palette = new Palette(retailMember('ra2', spec.palette).file), png = new PNG({ width: image.width, height: image.height });
    for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
        const color = palette.getColor(frame.imageData[y * frame.width + x]);
        png.data.set([color.r, color.g, color.b, 255], ((y + frame.y) * image.width + x + frame.x) * 4);
    }
    writeFileSync(`${directory}/original-${mission}-loading.png`, PNG.sync.write(png));
    writeFileSync(directory + '/source.json', JSON.stringify({ member: spec.image, sha256: member.sha256,
        palette: spec.palette, size: [image.width, image.height], contract: source }, null, 2) + '\n');
}

if (import.meta.main) extractCampaignLoadingSource(process.argv[2] ?? 'sov02t', process.argv[3] ?? '.artifacts/m3-2/loading');
