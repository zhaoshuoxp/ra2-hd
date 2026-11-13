import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function prepareCampaignScore(root: string) {
    const archives = new Map(await Promise.all(['language.mix', 'ra2.mix'].map(async name =>
        [name, await readFile(path.join(root, '.local/assets/ra2', name))] as const)));
    const directory = path.join(root, '.local/campaign/ra2/sov01t');
    const provenance = JSON.parse(await readFile(path.join(directory, 'provenance.json'), 'utf8'));
    for (const [name, bytes] of archives) {
        if (provenance.archivePriority.find((item: any) => item.name === name)?.sha256 !== sha(bytes)) {
            throw new Error(`Campaign score archive identity mismatch: ${name}`);
        }
    }
    const contract = buildCampaignScore(retailTree(archives));
    const name = 'score-presentation.json', bytes = Buffer.from(JSON.stringify(contract, null, 2) + '\n');
    await writeFile(path.join(directory, name), bytes);
    return { name, bytes: bytes.length, sha256: sha(bytes), route: `/local-campaign/ra2/sov01t/${name}` };
}

export function buildCampaignScore(tree: ReturnType<typeof retailTree>, filename = 'sov01t.map') {
    const sources: any[] = [], prefix = filename.startsWith('sov') ? 's' : 'a';
    const sprites = Object.fromEntries([
        ['background', `${prefix}scrbkmd.shp`], ['panel', `${prefix}scrtmd.shp`], ['emblem', `${prefix}scramd.shp`],
    ].map(([key, name]) => {
        const source = resolveMember(tree, name), bytes = source.file.getBytes(), sprite = new ShpFile(source.file);
        sources.push({ name, archive: source.source, bytes: bytes.length, sha256: sha(bytes) });
        return [key, { image: name, width: sprite.width, height: sprite.height, frames: sprite.numImages }];
    }));
    const paletteName = `${prefix}score.pal`, palette = resolveMember(tree, paletteName), paletteBytes = palette.file.getBytes();
    sources.push({ name: paletteName, archive: palette.source, bytes: paletteBytes.length, sha256: sha(paletteBytes) });
    return { schemaVersion: 1, edition: filename.endsWith('md.map') ? 'yr' : 'ra2', mission: filename, sources, sprites,
        palette: paletteName, width: 632, height: 568,
        panel: { x: 80, y: 60, openingFrames: [5, 4, 3, 2, 1, 0] }, emblem: { x: 104, y: 196 }, framesPerSecond: 15,
        timingScope: 'Source frame order, with a presentation-only cadence. Exact retail timing is not certified.',
        density: 'Original archived pixels; scalable live text. No authored HD bitmap replacement.' };
}

if (import.meta.main) {
    const root = path.resolve(import.meta.dir, '../..'), entry = await prepareCampaignScore(root);
    const filename = path.join(root, '.local/campaign/ra2/sov01t/manifest.json');
    const manifest = JSON.parse(await readFile(filename, 'utf8'));
    manifest.files = [...manifest.files.filter((file: any) => file.name !== entry.name), entry];
    await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify(entry));
}
