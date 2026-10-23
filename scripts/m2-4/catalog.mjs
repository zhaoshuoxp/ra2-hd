import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const [auditFile, output] = process.argv.slice(2);
assert(auditFile && output, 'Usage: catalog.mjs <source-audit.json> <catalog.json>');
const bytes = await fs.readFile(auditFile);
const audit = JSON.parse(bytes);
const maps = audit.maps.map(row => {
    const selected = row.catalogVisibility === 'SELECTED_NATIVE_CATALOG';
    const runtimeName = selected ? row.source.member : `official-${row.source.sha256.slice(0, 24)}.map`;
    return { edition: row.edition, mapId: row.mapId, runtimeName, source: row.source,
        uiName: row.metadata.Description || `NOSTR:${row.source.member.replace(/\.map$/i, '')} [archive ${row.source.sha256.slice(0, 8)}]`,
        originalModes: row.originalModes, modeProvenance: row.modeProvenance,
        maxSlots: row.starts, starts: row.starts, selected,
        declaredMaxSlots: row.metadata.MaxPlayers ? Number(row.metadata.MaxPlayers) : null };
});
for (const edition of ['ra2', 'yr']) {
    const names = maps.filter(row => row.edition === edition).map(row => row.runtimeName);
    assert.equal(new Set(names).size, names.length, `Duplicate runtime name: ${edition}`);
}
await fs.writeFile(output, JSON.stringify({ schema: 'official-unified-skirmish-catalog-v1',
    auditSha256: createHash('sha256').update(bytes).digest('hex'),
    policy: 'Imported official skirmish sources only; standard mode 1; original map bytes and mechanisms preserved.', maps }, null, 2) + '\n');
console.log(JSON.stringify({ entries: maps.length, output }));
