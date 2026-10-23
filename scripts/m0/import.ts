import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { profiles, retailTree, validateCore } from '../../src/offline/retail';

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function selectNames(names: string[], required: readonly string[]) {
    return required.map(expected => {
        const matches = names.filter(name => name.toLowerCase() === expected);
        if (matches.length !== 1) throw new Error(`${matches.length ? 'Ambiguous case collision' : 'Missing required input'}: ${expected}`);
        return { originalName: matches[0], virtualName: expected };
    });
}
async function exists(p: string) {
    try { return await fs.lstat(p); } catch (e: any) { if (e.code === 'ENOENT') return undefined; throw e; }
}
export async function safeDirectory(target: string) {
    const absolute = path.resolve(target);
    let current = path.parse(absolute).root;
    for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = await exists(current);
        if (stat?.isSymbolicLink()) throw new Error(`Symlink directory rejected: ${current}`);
        if (stat && !stat.isDirectory()) throw new Error(`Not a directory: ${current}`);
        if (!stat) await fs.mkdir(current);
    }
}
export async function importAssets(source: string, profile: keyof typeof profiles, dryRun: boolean, localRoot: string) {
    source = path.resolve(source);
    localRoot = path.resolve(localRoot);
    const realSource = await fs.realpath(source);
    if (realSource !== source) throw new Error('Source root must not traverse symlinks');
    if (localRoot === source || localRoot.startsWith(source + path.sep) || source.startsWith(localRoot + path.sep)) {
        throw new Error('Source and local output must be separate trees');
    }
    await safeDirectory(localRoot);
    const selected = selectNames(await fs.readdir(source), profiles[profile]);
    const top = new Map<string, Uint8Array>();
    const files = [];
    for (const entry of selected) {
        const sourcePath = path.join(source, entry.originalName);
        const stat = await fs.lstat(sourcePath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Only regular source files allowed: ${entry.originalName}`);
        const bytes = await fs.readFile(sourcePath);
        top.set(entry.virtualName, bytes);
        files.push({ ...entry, sourcePath, bytes: bytes.length, sha256: sha256(bytes), profile,
            destination: path.join(localRoot, 'assets/ra2', entry.virtualName), validation: 'pending', copy: 'not-run' });
    }
    const tree = retailTree(top);
    const core = profile === 'ra2-core' ? validateCore(tree) : undefined;
    const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), source, profile, dryRun,
        authenticity: 'unverified', files, containers: tree.map(({ path, mix }) => ({ path, members: mix.getEntries().length })), core };
    // Validate the complete profile and all conflicts before making any archive copy.
    for (const file of files) {
        const stat = await exists(file.destination);
        if (stat && (!stat.isFile() || stat.isSymbolicLink() || sha256(await fs.readFile(file.destination)) !== file.sha256)) {
            throw new Error(`Conflicting destination: ${file.destination}`);
        }
        file.validation = 'structural-pass';
    }
    if (!dryRun) {
        await safeDirectory(path.join(localRoot, 'assets/ra2'));
        for (const file of files) {
            if (sha256(await fs.readFile(file.sourcePath)) !== file.sha256) throw new Error('Source changed before copy');
            if (await exists(file.destination)) {
                file.copy = 'unchanged';
            } else {
                const temporary = file.destination + '.' + randomUUID() + '.tmp';
                try {
                    await fs.copyFile(file.sourcePath, temporary, 1);
                    if (sha256(await fs.readFile(temporary)) !== file.sha256) throw new Error('Temporary copy hash mismatch');
                    // Atomic create-if-absent: never replace a concurrent conflicting file.
                    await fs.link(temporary, file.destination);
                    file.copy = 'copied';
                } finally { await fs.unlink(temporary).catch(() => {}); }
            }
            if (sha256(await fs.readFile(file.sourcePath)) !== file.sha256) throw new Error('Source changed after copy');
            if (sha256(await fs.readFile(file.destination)) !== file.sha256) throw new Error('Destination hash mismatch');
        }
    }
    for (const file of files) {
        if (sha256(await fs.readFile(file.sourcePath)) !== file.sha256) throw new Error('Source changed during validation');
    }
    const output = path.join(localRoot, `${profile}-${dryRun ? 'dry-run' : 'manifest'}.json`);
    const temporary = output + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await fs.rename(temporary, output);
    return manifest;
}
if (import.meta.main) {
    const args = process.argv.slice(2);
    const source = args[args.indexOf('--source') + 1];
    const profile = (args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'ra2-core') as keyof typeof profiles;
    if (!args.includes('--source') || !source || !(profile in profiles)) throw new Error('Usage: bun scripts/m0/import.ts --source PATH [--profile ra2-core|ra2-campaign|ra2-media] [--dry-run]');
    const result = await importAssets(source, profile, args.includes('--dry-run'), path.resolve('.local'));
    console.log(JSON.stringify(result, null, 2));
}
