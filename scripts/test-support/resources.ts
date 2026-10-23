import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ShpFile } from '../../src/data/ShpFile';
import { IniFile } from '../../src/data/IniFile';
import { GAME_EDITIONS, type GameEdition } from '../../src/editions/GameEdition';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

export const resourceRoot = path.resolve(process.env.RA2_TEST_RESOURCE_ROOT ?? '.local');
export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function requiredBytes(relative: string) {
    const file = path.resolve(resourceRoot, relative);
    if (!file.startsWith(resourceRoot + path.sep)) throw Error(`Resource path escapes root: ${relative}`);
    if (!existsSync(file)) throw Error(`Missing required integration resource: ${file}. Set RA2_TEST_RESOURCE_ROOT to the imported .local directory.`);
    return readFileSync(file);
}
const trees = new Map<GameEdition, ReturnType<typeof editionRetailTree>>();
export function retailTreeFor(edition: GameEdition) {
    if (!trees.has(edition)) {
        const base = new Set<string>(GAME_EDITIONS.ra2.archives);
        const receipt = JSON.parse(requiredBytes(`${edition}-core-manifest.json`).toString());
        trees.set(edition, editionRetailTree(new Map(GAME_EDITIONS[edition].archives.map(name => {
            const bytes = requiredBytes(`assets/${base.has(name) ? 'ra2' : 'yr'}/${name}`);
            const expected = receipt.files.find((f: any) => f.virtualName === name);
            if (!expected || bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256)
                throw Error(`Imported archive identity mismatch: ${edition}/${name}`);
            return [name, bytes];
        })), edition));
    }
    return trees.get(edition)!;
}
export function retailMember(edition: GameEdition, name: string, expectedHash?: string) {
    const resolved = resolveMember(retailTreeFor(edition), name);
    const bytes = resolved.file.getBytes();
    const hash = sha256(bytes);
    if (expectedHash && hash !== expectedHash) throw Error(`Retail identity mismatch: ${edition}/${name} from ${resolved.source}: ${hash}`);
    return { ...resolved, sha256: hash };
}
export function retailIni(edition: GameEdition, kind: 'rules' | 'art' = 'rules') {
    const member = retailMember(edition, GAME_EDITIONS[edition][kind]);
    const receipt = JSON.parse(requiredBytes(`${edition}-core-manifest.json`).toString());
    const expected = receipt.core.resources[GAME_EDITIONS[edition][kind]];
    if (!expected || member.source !== expected.source || member.file.getSize() !== expected.bytes
        || member.memberId !== expected.memberId) throw Error(`Retail ${edition}/${kind} resolution differs from import receipt`);
    return new IniFile(member.file.readAsString());
}
export function selectedPack(kind: 'environment' | 'terrain') {
    const selection = JSON.parse(requiredBytes(`${kind}-selection.json`).toString());
    const relative = `${kind}-packs/${selection.revision}/manifest.json`;
    const bytes = requiredBytes(relative);
    if (sha256(bytes) !== selection.sha256) throw Error(`Selected ${kind} manifest identity mismatch: ${relative}`);
    return { directory: path.dirname(path.join(resourceRoot, relative)), manifest: JSON.parse(bytes.toString()) };
}

export function nativeShpSource(edition: GameEdition, member: string, hash: string, count: number, theater: string) {
    const resolved = retailMember(edition, member, hash);
    const image = new ShpFile(resolved.file);
    if (image.numImages < count) throw Error(`Insufficient native frames: ${member}: ${image.numImages} < ${count}`);
    return { image, source: { member, sha256: resolved.sha256, theater,
        canvas: [image.width, image.height], frames: image.images.slice(0, count).map((f, nativeFrame) => ({
            nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
            legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean),
        })) } };
}
