import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { IniFile } from '../../src/data/IniFile';
import { MapFile } from '../../src/data/MapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { BridgeOverlayTypes } from '../../src/game/map/BridgeOverlayTypes';
import catalog from '../../src/offline/officialSkirmishCatalog.json';
import { retailTreeFor, retailMember, resourceRoot, sha256 } from '../test-support/resources';

const output = process.argv[2]; assert(output && !fs.existsSync(output));
const rows: any[] = [];
const contracts = new Map<string, any>();
for (const theater of ['TEMPERATE', 'SNOW', 'URBAN', 'DESERT', 'NEWURBAN']) {
    const suffix = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase();
    contracts.set(theater, JSON.parse(fs.readFileSync(`desktop/environment${suffix}-hd-contract.json`, 'utf8')));
}
function observe(edition: 'ra2' | 'yr', id: string, bytes: Uint8Array, sourceHash: string, campaign: boolean) {
    assert.equal(sha256(bytes), sourceHash);
    const text = Buffer.from(bytes).toString(), ini = new IniFile(text), map = new MapFile();
    // This read-only dependency audit parses the original overlay packs only.
    // Trigger execution and playability are covered by their native evidence.
    IniFile.prototype.fromString.call(map, text);
    const section = ini.getSection('Map')!, size = section.getNumberArray('Size');
    map.fullSize = { x: size[0], y: size[1], width: size[2], height: size[3] }; map.readOverlays();
    const theater = section.getString('Theater').toUpperCase(), contract = contracts.get(theater);
    const rules = new IniFile(retailMember(edition, edition === 'ra2' ? 'rules.ini' : 'rulesmd.ini').file);
    const names = new Map(rules.getSection('OverlayTypes')!.entries);
    for (const [key, value] of ini.getSection('OverlayTypes')?.entries ?? []) names.set(key, value);
    const pieces = map.overlays.filter(o => BridgeOverlayTypes.isBridge(o.id)).map(o => {
        const identity = String(names.get(String(o.id))).toUpperCase();
        const root = contract?.identities?.[edition]?.[identity], family = contract?.families?.[root];
        const scope = family?.sourceScope;
        const campaignMatch = scope?.campaignSources?.some(s => campaign && s.mission === id && s.sha256 === sourceHash);
        const officialMatch = !campaign && scope?.officialMapSha256s?.includes(sourceHash);
        const qualified = family && (!scope || campaignMatch || officialMatch);
        return { identity, tile: [o.rx, o.ry], value: o.value,
            axis: BridgeOverlayTypes.isXBridge(o.id) ? 'X' : 'Y',
            family: root ?? null, sourceScope: scope ?? null, qualified: !!qualified,
            expectedRoute: qualified ? 'SOURCE_QUALIFIED_HD' : 'ORIGINAL_OR_DIFFERENT_MATCHED_FAMILY',
            flattenedDeckRegressionPath: root === 'campaign-all08-low-concrete-bridge-v49' && !!qualified };
    });
    rows.push({ edition, id, campaign, sourceHash, theater, pieces });
}
for (const entry of catalog.maps) {
    const tree = retailTreeFor(entry.edition as 'ra2' | 'yr'), owner = tree.find(c => c.path === entry.source.archive)!;
    assert(owner);
    const source = entry.source as any;
    let file;
    if (source.memberId !== undefined) {
        const member = owner.mix.getEntries().find(e => e.hash === source.memberId)!; assert(member);
        const mix = owner.mix as any;
        file = VirtualFile.factory(mix.stream, source.member, mix.dataStart + member.offset, member.length);
    } else file = owner.mix.openFile(source.member);
    observe(entry.edition as 'ra2' | 'yr', entry.runtimeName, file.getBytes(), source.sha256, false);
}
for (const stem of fs.readdirSync(path.join(resourceRoot, 'campaign/ra2'))) {
    const directory = path.join(resourceRoot, 'campaign/ra2', stem), manifestPath = path.join(directory, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const source = manifest.files.find(f => f.name === manifest.mission); assert(source);
    observe('ra2', manifest.mission, fs.readFileSync(path.join(directory, source.name)), source.sha256, true);
}
const affected = rows.filter(r => r.pieces.some(p => p.flattenedDeckRegressionPath));
assert.deepEqual(affected.map(r => r.id), ['all08u.map']);
const result = { status: 'PASS_HASH_PINNED_BRIDGE_BINDING_AUDIT', maps: rows.length,
    mapsWithBridges: rows.filter(r => r.pieces.length).length,
    flattenedDeckRegressionMaps: affected.map(r => r.id), rows,
    qualification: 'Original overlay/reference audit and source-scope routing only. Native samples are recorded separately. This does not certify every map contact visually or extend campaign-only artwork to mismatched sources.' };
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: result.status, maps: result.maps, mapsWithBridges: result.mapsWithBridges,
    affected: result.flattenedDeckRegressionMaps }));
