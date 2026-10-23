// Compare native cloth poses independently of pole height, source names and canvas margins.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ShpFile } from '../../src/data/ShpFile';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-4/newurban-remaining-actors-batch97-20261021';
const version = process.argv[2] ?? 'v2';
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ file, sha256: sha(readFileSync(file)), bytes: readFileSync(file).length });
const target = read(path.join(root, 'source-v1.json')).sources.find((s: any) => s.member === 'cgslab_f.shp');
const top = new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']
    .map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const trees = ['yr', 'ra2'].map(edition => editionRetailTree(top, edition as 'yr' | 'ra2'));
function exact(name: string, expected: string) {
    for (const tree of trees) if (tree.some(({ mix }) => mix.containsFile(name))) {
        const file = resolveMember(tree, name).file;
        if (sha(file.getBytes()) === expected) return file;
    }
    throw Error(`Pinned source unavailable: ${name} ${expected}`);
}
const native = new ShpFile(exact(target.member, target.sha256));
function cloth(frame: any) {
    const coordinates = [...frame.imageData.keys()].filter(i => frame.imageData[i] >= 16 && frame.imageData[i] <= 31);
    if (!coordinates.length) return { bounds: [] as number[], sha256: null, indices: [],
        nativeVisiblePixels: frame.imageData.filter(Boolean).length };
    const xs = coordinates.map(i => i % frame.width), ys = coordinates.map(i => Math.floor(i / frame.width));
    const x = Math.min(...xs), y = Math.min(...ys), width = Math.max(...xs) - x + 1, height = Math.max(...ys) - y + 1;
    const indices = new Uint8Array(width * height);
    for (const i of coordinates) indices[(Math.floor(i / frame.width) - y) * width + i % frame.width - x] = frame.imageData[i];
    return { bounds: [x, y, width, height], sha256: sha(indices), indices: [...indices] };
}
const rows: any[] = [];
const output = path.join(root, `accepted-flag-native-${version}`);
mkdirSync(output);
for (const theater of ['TEMPERATE', 'SNOW', 'URBAN', 'DESERT', 'NEWURBAN']) {
    const file = `desktop/environment${theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase()}-hd-contract.json`;
    const contract = read(file), folder = path.join('.local/environment-packs', contract.selectedPack.revision);
    const pack = read(path.join(folder, 'manifest.json'));
    for (const [member, descriptor] of Object.entries<any>(contract.sources)) {
        if (!member.endsWith('_f.shp')) continue;
        const shp = new ShpFile(exact(member, descriptor.sha256));
        const family = Object.values<any>(pack.families).find(f => f.members.some((m: any) => m.member === member));
        const selected = family.members.find((m: any) => m.member === member);
        const metadata = path.join(folder, selected.path);
        assert.equal(sha(readFileSync(metadata)), selected.sha256);
        const frames = Array.from({ length: descriptor.bodyFrames }, (_, slot) => {
            const image = shp.images[slot];
            const indexFile = path.join(output, `${theater.toLowerCase()}-${member}-${slot}.index`);
            writeFileSync(indexFile, image.imageData, { flag: 'wx' });
            const pose = cloth(image);
            return { slot, origin: [image.x, image.y], size: [image.width, image.height],
                cloth: pose, index: pin(indexFile) };
        });
        const slots = target.frames.map((frame: any, slot: number) => {
            const pose = cloth(native.images[slot]);
            const matches = frames.filter(f => pose.sha256 && f.cloth.sha256 === pose.sha256
                && f.cloth.bounds.slice(2).join() === pose.bounds.slice(2).join()).map(f => f.slot);
            return { slot, targetCloth: pose, exactClothSlots: matches };
        });
        rows.push({ theater, member, sourceSha256: descriptor.sha256, descriptor,
            acceptedMetadata: pin(metadata), frames, slots,
            exactClothTargets: slots.filter(s => s.exactClothSlots.length).length });
    }
}
writeFileSync(path.join(root, `secret-lab-flag-reuse-audit-${version}.json`), JSON.stringify({
    status: 'READ_ONLY_CLOTH_POSE_AUDIT_NOT_EXPORTED', targetMember: target.member,
    targetSourceSha256: target.sha256, rows, originalSourcesEdited: false,
    qualification: 'Exact cloth masks nominate a pose donor. RGB/alpha, pole registration, ownership and complete normal/damaged loops still require explicit target export and native validation.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(rows.map(r => ({ theater: r.theater, member: r.member, exact: r.exactClothTargets })));
