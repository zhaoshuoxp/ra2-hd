import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { ShpFile } from '../../src/data/ShpFile';
import { IniFile } from '../../src/data/IniFile';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export async function prepareCampaignPresentation(root: string) {
    const archives = new Map(await Promise.all(['language.mix', 'ra2.mix'].map(async name =>
        [name, await readFile(path.join(root, '.local/assets/ra2', name))] as const)));
    const provenance = JSON.parse(await readFile(path.join(root, '.local/campaign/ra2/sov01t/provenance.json'), 'utf8'));
    for (const [name, bytes] of archives) {
        if (provenance.archivePriority.find((item: any) => item.name === name)?.sha256 !== sha(bytes)) {
            throw new Error(`Campaign presentation archive differs from verified preparation: ${name}`);
        }
    }
    const contract = buildCampaignPresentation(retailTree(archives));
    const bytes = Buffer.from(JSON.stringify(contract, null, 2) + '\n');
    const name = 'presentation.json';
    await writeFile(path.join(root, '.local/campaign/ra2/sov01t', name), bytes);
    return { name, bytes: bytes.length, sha256: sha(bytes), route: `/local-campaign/ra2/sov01t/${name}` };
}

// The same archived UI geometry serves new missions without rewriting the
// accepted Soviet 01 preparation or changing any of its resource identities.
export function buildCampaignPresentation(tree: ReturnType<typeof retailTree>, filename = 'sov01t.map') {
    const edition = filename.endsWith('md.map') ? 'yr' : 'ra2';
    const missionFile = edition === 'yr' ? 'missionmd.ini' : 'mission.ini';
    const mission = new IniFile(resolveMember(tree, missionFile).file.readAsString()).getSection(filename);
    if (!mission) throw new Error(`Missing original mission loading record: ${filename}`);
    const image = mission.getString('LS800BkgdName').toLowerCase();
    const palette = edition === 'yr' ? mission.getString('LS800BkgdPal').toLowerCase()
        : filename.startsWith('sov') ? 'ldscrns.pal' : 'ldscrna.pal';
    const sources = new Map<string, any>();
    const member = (name: string) => {
        const item = resolveMember(tree, name);
        const bytes = item.file.getBytes();
        sources.set(name, { name, archive: item.source, bytes: bytes.length, sha256: sha(bytes) });
        return item.file;
    };
    const sprite = (image: string, palette: string) => {
        const file = new ShpFile(member(image)); member(palette);
        return { image, palette, width: file.width, height: file.height, frames: file.numImages };
    };
    const sprites = {
        background: sprite('fsbkgdlg.shp', 'fsscrn.pal'),
        allied: sprite('fsalg.shp', 'fsscrn.pal'),
        tutorial: sprite('fsbclg.shp', 'fsscrn.pal'),
        soviet: sprite('fsslg.shp', 'fsscrn.pal'),
        mission: sprite(image, palette),
        title: sprite('ttlbr800.shp', 'ldscrn.pal'),
        progressHousing: sprite('spldbrl.shp', 'spldbr.pal'),
        progressFill: sprite('spldbr.shp', 'spldbr.pal'),
    };
    const anchors = { allied: { x: 30, y: 26 }, tutorial: { x: 82, y: 187 }, soviet: { x: 98, y: 298 } };
    const background = new ShpFile(resolveMember(tree, sprites.background.image).file).getImage(0);
    for (const name of edition === 'ra2' ? ['allied', 'tutorial', 'soviet'] as const : []) {
        const spec = sprites[name], frame = new ShpFile(resolveMember(tree, spec.image).file).getImage(0);
        const { x, y } = anchors[name];
        if (spec.frames !== 8 || frame.x || frame.y) throw new Error(`Unexpected original campaign animation: ${name}`);
        for (let row = 0; row < spec.height; row++) for (let col = 0; col < spec.width; col++) {
            if (frame.imageData[row * spec.width + col] !== background.imageData[(y + row) * background.width + x + col]) {
                throw new Error(`Campaign frame 0 does not match the original background at ${name}:${col},${row}`);
            }
        }
    }
    for (const name of ['trakgrip.pcx', 'trofl.pcx', 'trofr.pcx', 'trofm.pcx']) member(name);
    member(missionFile);
    if (mission.getString('LS800BkgdName').toLowerCase() !== sprites.mission.image) throw new Error('Mission loading image differs from original mission.ini');
    return { schemaVersion: 1, edition, mission: filename, sources: [...sources.values()], sprites, anchors,
        animation: { idle: 0, activeFrames: edition === 'yr' ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6, 7], framesPerSecond: 15,
            scope: 'All original arrow frames; exact retail frame cadence requires visual acceptance.' },
        loading: { width: 800, height: 600, imageY: 40, progressY: 560, fillX: 172, fillY: 568,
            loadMessage: mission.getString('LSLoadMessage'), briefing: mission.getString('LSLoadBriefing'),
            briefX: mission.getNumber('LS800BriefLocX'), briefY: mission.getNumber('LS800BriefLocY') + 40 },
        sourcePolicy: 'Original archived UI bytes only. No loose installation overlays or generated replacement artwork.' };
}

if (import.meta.main) {
    const root = path.resolve(import.meta.dir, '../..');
    const entry = await prepareCampaignPresentation(root);
    const filename = path.join(root, '.local/campaign/ra2/sov01t/manifest.json');
    const manifest = JSON.parse(await readFile(filename, 'utf8'));
    manifest.files = [...manifest.files.filter((file: any) => file.name !== entry.name), entry];
    await writeFile(filename, JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify(entry));
}
