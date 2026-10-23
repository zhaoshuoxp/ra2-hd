import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseMix, retailTree, resolveMember, type Container } from '../../src/offline/retail';
import { MixFile } from '../../src/data/MixFile';
import { sovietBuildingHdFamilies } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';
import { napowrHdFamily } from '../../src/engine/renderable/builder/napowrHdFamily';
import { ShpFile } from '../../src/data/ShpFile';
const root = process.argv[2];
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const base = retailTree(new Map(['language.mix', 'ra2.mix', 'multi.mix'].map(n => [n, readFileSync(`${root}/${n}`)])));
const expansion: Container[] = [];
function visit(name: string, mix: MixFile) {
    expansion.push({ path: name, mix });
    for (const child of ['localmd.mix', 'cachemd.mix', 'conqmd.mix', 'urbann.mix', 'desert.mix', 'lunar.mix', 'snowmd.mix', 'isoubnmd.mix', 'isoubn.mix', 'isodesmd.mix', 'isodes.mix', 'isolunmd.mix', 'isolun.mix', 'ubn.mix', 'des.mix', 'lun.mix']) {
        if (mix.containsFile(child)) visit(`${name}/${child}`, new MixFile(mix.openFile(child).stream));
    }
}
for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix']) visit(name, parseMix(readFileSync(`${root}/${name}`), name));
const support = { path: 'upstream-support/ra2cd.mix', mix: parseMix(readFileSync('.local/upstream-support/ra2cd.mix'), 'ra2cd.mix') };
const tree = [...expansion, support, ...base];
const result: any = { families: {}, pips: {} };
for (const [family, spec] of Object.entries({ ...sovietBuildingHdFamilies, NAPOWR: napowrHdFamily })) {
    result.families[family] = Object.fromEntries(['t', 'u', 'n', 'd', 'a', 'l'].map(theater => [theater, spec.members.map(m => {
        const names = [m.member[0] + theater + m.member.slice(2), m.member[0] + 'g' + m.member.slice(2), m.member[0] + 'a' + m.member.slice(2)];
        const resolved = names.map(n => { try { return { name: n, ...resolveMember(tree, n) }; } catch { return undefined; } }).find(Boolean)!;
        return { member: m.member, resolved: resolved.name, source: resolved.source, same: hash(resolved.file.getBytes()) === m.sha256 };
    })]));
}
visit('multimd.mix', parseMix(readFileSync(`${root}/multimd.mix`), 'multimd.mix'));
const maps = parseMix(readFileSync(`${root}/multimd.mix`), 'multimd.mix');
result.maps = [];
const pkt = resolveMember([...expansion, ...base], 'missionsmd.pkt').file.readAsString();
for (const name of [...pkt.matchAll(/^\[([^\]]+)\]/gm)].map(m => m[1] + '.map')) {
    if (!maps.containsFile(name)) continue;
    const theater = maps.openFile(name).readAsString().match(/^Theater=(.+)$/m)?.[1].trim();
    if (theater) result.maps.push({ name, theater });
}
for (const [edition, t] of [['ra2', base], ['yr', tree]] as const) {
    const member = resolveMember(t, 'pips.shp'), shp = new ShpFile(member.file);
    result.pips[edition] = { source: member.source, frames: shp.images.map((f, i) => ({ i, width: f.width, height: f.height })) };
}
writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.families).map(([k,v]: any) => [k, Object.fromEntries(Object.entries(v).map(([t,ms]: any) => [t, ms.filter(m => !m.same).map(m => m.resolved)]))])), null, 2));
console.log(result.pips);
