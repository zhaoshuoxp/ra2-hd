import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { retailMember, sha256 } from '../test-support/resources';
import { vxlUnitFamilies } from '../../src/engine/renderable/unitVxl/identities';
const root = path.resolve(import.meta.dir, '../..');
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const catalogs = ['TEMPERATE', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT'].map(theater => {
    const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
    return { theater, contract: JSON.parse(readFileSync(path.join(root, `desktop/environment${suffix}-hd-contract.json`), 'utf8')) };
});
const palette = retailMember('ra2', 'unittem.pal').sha256;
const rows = [];
for (const row of report.rows) {
    if (!row.member || row.invisible) continue;
    let source;
    try { source = retailMember('ra2', row.member); } catch { continue; }
    const observed = row.instances.some((instance: any) => instance.vxlActive || instance.rhinoBound || instance.parts.some((part: any) => part.gpuHd) || instance.batch?.gpuHd);
    const candidates = catalogs.flatMap(({ theater, contract }) => Object.entries(contract.families).flatMap(([id, family]: [string, any]) =>
        family.members.flatMap((member: string) => {
            const entry = family.sourceOverrides?.[member] ?? contract.sources[member];
            return entry.sha256 === source.sha256 ? [{ theater, id, member, source: entry, paletteMatch: entry.palette.sha256 === palette,
                editions: family.editions, sourceScope: family.sourceScope }] : [];
        })));
    rows.push({ name: row.name, member: row.member, sourceSha256: source.sha256, observed, preparedOverride: row.preparedOverride,
        instances: row.instances.length, candidates, vxl: row.isVoxel && Object.entries(vxlUnitFamilies).filter(([, family]) =>
            JSON.stringify(family).includes(row.member)).map(([name]) => name) });
}
for (const name of ['vlad.vxl', 'vlad.hva', 'dred.vxl', 'dred.hva']) {
    const file = retailMember('ra2', name); console.log(name, file.sha256, file.file.getSize());
}
writeFileSync(path.resolve(root, '../project-history/m3-2-first-batch-20261025/resource-reuse-inventory.json'), JSON.stringify({ palette, rows }, null, 2) + '\n');
for (const row of rows.filter(row => !row.observed && !row.preparedOverride)) console.log(row.name, row.member, row.candidates.map(c => `${c.theater}:${c.id}:${c.paletteMatch}`).join(' '), row.vxl);
