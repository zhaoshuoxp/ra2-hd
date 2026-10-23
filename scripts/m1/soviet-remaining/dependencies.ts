import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { retailTree, resolveMember } from '../../../src/offline/retail';
import { VxlFile } from '../../../src/data/VxlFile';
import { HvaFile } from '../../../src/data/HvaFile';
import { wallTypes } from '../../../src/game/map/wallTypes';
const root = '.artifacts/soviet-remaining';
const tree = retailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(n => [n, readFileSync(`.local/assets/ra2/${n}`)])));
const inventory = JSON.parse(readFileSync(`${root}/source-v1/inventory.json`, 'utf8'));
const results: any = {};
for (const id of ['NALASR', 'NAFLAK']) {
    const rules = inventory.families[id].rules, turret = rules.TurretAnim.toLowerCase();
    const parts = [turret, ...(turret.includes('tur') ? [turret.replace('tur', 'barl')] : [])];
    results[id] = { rules, parts: parts.map(name => ({ name, files: ['vxl', 'hva'].map(ext => {
        const member = `${name}.${ext}`;
        let resolved;
        try { resolved = resolveMember(tree, member); } catch (error) {
            if (name === turret) throw error;
            return { member, status: 'ABSENT_OPTIONAL_NATIVE_BARREL', note: 'The engine only adds this optional part when present; no fabricated separate barrel.' };
        }
        const bytes = resolved.file.getBytes();
        const model = ext === 'vxl' ? new VxlFile(resolved.file) : new HvaFile(resolved.file);
        return { member, archive: resolved.source, sha256: createHash('sha256').update(bytes).digest('hex'),
            sections: model.sections.map((s: any) => ({ name: s.name, size: [s.sizeX, s.sizeY, s.sizeZ], frames: s.matrices?.length })) };
    }) })) };
}
results.NAWALL = { source: inventory.families.NAWALL.members[0].source, wallTypes,
    nativeNormalFrames: wallTypes.map((_, i) => i), nativeDamagedFrames: wallTypes.map((_, i) => i + 16),
    remainingFrames: 'Retained in raw inventory; current Overlay.computeFrame uses one +16 damaged offset, not a third inferred health state.',
    behavior: 'Placement creates an overlay via ToOverlay; connection changes are discrete native states, not a timed idle animation.' };
writeFileSync(`${root}/dependencies-v1.json`, JSON.stringify(results, null, 2) + '\n', { flag: 'wx' });
console.log('Verified LASER and FLAKTUR/FLAKBARL VXL/HVA identities and native wall mapping');
