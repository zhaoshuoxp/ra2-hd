import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { retailMember } from '../test-support/resources';
const base = path.resolve(process.argv[2]); mkdirSync(base, { recursive: true });
const names = ['vlad.vxl', 'vlad.hva', 'vladwo.vxl', 'vladwo.hva', 'dmisl.vxl', 'dmisl.hva', 'unittem.pal', 'voxels.vpl'];
const assets = Object.fromEntries(names.map(name => { const item = retailMember('ra2', name); return [name, { sha256: item.sha256, archive: item.source, bytes: item.file.getSize() }]; }));
const inventory = { families: [{ id: 'VLAD', members: ['vlad.vxl', 'vlad.hva', 'vladwo.vxl', 'vladwo.hva'], children: [] }], assets };
writeFileSync(path.join(base, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
writeFileSync(path.join(base, 'source.json'), JSON.stringify({ sources: [{ identity: 'VLAD', member: 'vlad.vxl', format: 'vxl', sha256: assets['vlad.vxl'].sha256 }] }, null, 2) + '\n');
