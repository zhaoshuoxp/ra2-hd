import { readFileSync, writeFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';

const root = '.artifacts/m2-1/authoring-v4';
const source = JSON.parse(readFileSync('.artifacts/m2-1/authoring-v1/export-input.json', 'utf8'));
const tree = editionRetailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix',
    'langmd.mix', 'ra2md.mix', 'multimd.mix'].map(name =>
    [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)])), 'yr');
const groups = source.groups.map((group: any) => ({ ...group, members: group.members.filter((member: any) =>
    group.id === 'road-representative' ? /^proad0[12][a-c]?\.tem$/.test(member.member)
        : !/^cliff0[34]\.tem$/.test(member.member)).map((member: any) => {
            const bytes = resolveMember(tree, member.member).file.getBytes();
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return { ...member, nativeOffsets: member.images.map((_: any, i: number) => view.getInt32(16 + i * 4, true)) };
        }) }));
writeFileSync(`${root}/export-input.json`, JSON.stringify({ groups }, null, 2) + '\n');
const ledgerFile = 'docs/m2-1-temperate-coverage.json';
const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
ledger.representative = groups.map((group: any) => ({ id: group.id, members: group.members.length,
    subtiles: group.members.reduce((n: number, m: any) => n + m.images.length, 0) }));
ledger.representativeRevision = 'V4_ASSEMBLED_REVIEW_ONLY';
ledger.representativeScopeChange = 'V2/V3 road and cliff samples were rejected. V4 narrows preview to complete straight-road assemblies and cliff01/02, retaining ground and slope/fixup representatives. Full intended closure remains unchanged and gated.';
ledger.representativeOriginalControls = ['Unselected road junctions, ends and road slopes', 'Cliff03/04',
    'Native zero-offset TMP slots retain original pixel data and decoder behavior'];
writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
console.log(ledger.representative);
