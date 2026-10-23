// Select only resources resolved by this worktree's committed baseline catalogs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerHdResources, sovietBatchIdentities, sovietBatchRevisions,
    unitIdentities, vxlUnitIdentities } from '../../../desktop/hd-profile.mjs';

const source = path.resolve(process.argv[2]);
const destination = path.resolve('.local');
if (!source || source === destination) throw Error('Distinct source resource root required');
const digest = b => createHash('sha256').update(b).digest('hex');
const events = [];
const before = await registerHdResources(source, e => events.push(e));
const files = new Set([...before.routes.values()].map(p => path.relative(source, p)));
for (const entry of [...Object.values(unitIdentities), ...Object.values(vxlUnitIdentities)]) {
    if (!entry.blockedReason) files.add(entry.familyPath ?? entry.path);
}
for (const catalog of ['soviet-building-coverage', 'allied-building-coverage']) {
    const entries = JSON.parse(await fs.readFile(`desktop/${catalog}.json`));
    for (const entry of Object.values(entries)) files.add(entry.familyPath);
}
for (const id of Object.keys(sovietBatchIdentities))
    files.add(`hd-packs/soviet-${id}-authored/${sovietBatchRevisions[id]}/family.json`);
files.add('hd-packs/power-plant-authored/owner-r3/family.json');
files.add('hd-packs/soviet-power-plant-authored/owner-r3/family.json');
files.add('ui-selection.json');
const ui = JSON.parse(await fs.readFile(path.join(source, 'ui-selection.json')));
files.add(`ui-packs/${ui.revision}/manifest.json`);
// SHP routes hold page images; copy their validated member manifests as well.
for (const relative of [...files]) {
    if (relative.startsWith('hd-packs/') && !relative.endsWith('family.json')) {
        const manifest = path.join(path.dirname(relative), 'manifest.json');
        if (await fs.stat(path.join(source, manifest)).then(s => s.isFile()).catch(() => false)) files.add(manifest);
    }
}
const copied = [];
for (const relative of [...files].sort()) {
    if (path.isAbsolute(relative) || relative.startsWith('..')) throw Error('Resource outside source root');
    const src = path.join(source, relative), dst = path.join(destination, relative);
    const bytes = await fs.readFile(src);
    const hash = digest(bytes);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(src, dst, fsConstants.COPYFILE_EXCL | fsConstants.COPYFILE_FICLONE);
    if (digest(await fs.readFile(dst)) !== hash) throw Error('Copy mismatch: ' + relative);
    copied.push({ relativeDestination: `.local/${relative}`, sha256: hash, size: bytes.length,
        sourceRoot: source, sourceRelative: relative, status: 'INDEPENDENT_COPY_HASH_VERIFIED',
        familyIdentity: relative.split('/')[1], density: 'BASELINE_MANIFEST_DEFINED',
        gitTransfer: 'IGNORED_REQUIRES_SEPARATE_COPY' });
}
const afterEvents = [];
const after = await registerHdResources(destination, e => afterEvents.push(e));
if (JSON.stringify(after.availability) !== JSON.stringify(before.availability)) throw Error('Local availability mismatch');
if ([...after.routes.values()].some(p => !p.startsWith(destination + path.sep))) throw Error('Nonlocal route');
for (const p of await fs.readdir('.local/assets')) {
    for (const name of await fs.readdir(`.local/assets/${p}`)) {
        const relative = `assets/${p}/${name}`, bytes = await fs.readFile(path.join(destination, relative));
        const srcBytes = await fs.readFile(path.join(source, relative));
        if (digest(bytes) !== digest(srcBytes)) throw Error('Retail archive copy mismatch');
        copied.push({ relativeDestination: `.local/${relative}`, sha256: digest(bytes), size: bytes.length,
            sourceRoot: source, sourceRelative: relative, familyIdentity: 'RETAIL_EDITION_ARCHIVE', density: 1,
            status: 'INDEPENDENT_COW_COPY_HASH_VERIFIED', gitTransfer: 'IGNORED_REQUIRES_SEPARATE_COPY' });
    }
}
const report = { schemaVersion: 1, taskId: 'D', baseMainSha: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
    status: 'PASS_BASELINE_SELECTIVE_COPY_LOCAL_RESOLUTION', sourceRoot: source, destinationRoot: destination,
    copied, routes: after.routes.size, availability: after.availability,
    knownOriginalExceptions: afterEvents.filter(e => e.type === 'hd-unavailable'),
    excluded: 'Historical revisions, C candidate exports, source installations and writable peer profiles',
    note: 'Resource metadata belongs to committed D baseline catalogs, even when main source files are dirty.' };
await fs.writeFile('.artifacts/yuri-units/baseline-resources.json', JSON.stringify(report, null, 2) + '\n', {flag:'wx'});
console.log(report.status, copied.length, after.routes.size);
