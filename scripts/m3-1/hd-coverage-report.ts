import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ShpFile } from '../../src/data/ShpFile';
import { unitHdFamiliesForEdition } from '../../src/engine/renderable/builder/unitHdFamilies';
import { vxlUnitFamilies, vxlUnitAvailableInTheater } from '../../src/engine/renderable/unitVxl/identities';
import { isAlliedBuildingHdFamily } from '../../src/engine/renderable/builder/alliedBuildingHdFamilies';
import { isSovietBuildingHdFamily } from '../../src/engine/renderable/builder/sovietBuildingHdFamilies';

const root = path.resolve(import.meta.dirname, '../..'), base = path.resolve(process.argv[2]);
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({ path: path.relative(root, file), bytes: fs.statSync(file).size, sha256: sha(fs.readFileSync(file)) });
const nativeFile = path.join(base, 'native-complete/report.json'), native = read(nativeFile), inventory = read(path.join(base, 'inventory.json'));
assert.equal(native.status, 'PASS_NATIVE_DIAGNOSTIC_HD_COVERAGE_INSPECTION_WITH_EXPLICIT_GAPS');
assert.deepEqual(native.errors, []); assert.deepEqual(native.failedResources, []);
assert(native.rows.every((row: any) => row.type > 0 && !row.resolutionError && (row.member || row.invisible)));
assert.equal(sha(fs.readFileSync(path.join(base, 'native-complete/harness.mjs'))), native.harnessSha256);
const resources = path.join(native.app, 'Contents/Resources/GameResources');
process.env.RA2_TEST_RESOURCE_ROOT = resources;
const { retailMember } = await import('../test-support/resources');
const contractFile = 'desktop/environment-urban-hd-contract.json', contract = read(contractFile);
assert.equal(sha(fs.readFileSync(contractFile)), sha(fs.readFileSync(path.join(native.app, 'Contents/Resources/app', contractFile))));
const pointerFile = path.join(resources, 'environment-urban-selection.json'), pointer = read(pointerFile);
const packDir = path.join(resources, 'environment-packs', pointer.revision), packFile = path.join(packDir, 'manifest.json');
assert.equal(sha(fs.readFileSync(packFile)), pointer.sha256);
const pack = read(packFile), units = unitHdFamiliesForEdition('ra2');
const urban = { theater: 'URBAN', contract, pack, packDir, contractFile, pointerFile };
const catalogs = [urban, ...[
    ['TEMPERATE', 'environment-hd-contract.json', 'environment-selection.json'],
    ['SNOW', 'environment-snow-hd-contract.json', 'environment-snow-selection.json'],
    ['NEWURBAN', 'environment-newurban-hd-contract.json', 'environment-newurban-selection.json'],
    ['DESERT', 'environment-desert-hd-contract.json', 'environment-desert-selection.json'],
].map(([theater, contractName, pointerName]) => {
    const contractFile = path.join('desktop', contractName), pointerFile = path.join(resources, pointerName);
    assert.equal(sha(fs.readFileSync(contractFile)), sha(fs.readFileSync(path.join(native.app, 'Contents/Resources/app', contractFile))));
    const pointer = read(pointerFile), packDir = path.join(resources, 'environment-packs', pointer.revision);
    const packFile = path.join(packDir, 'manifest.json');
    assert.equal(sha(fs.readFileSync(packFile)), pointer.sha256);
    return { theater, contract: read(contractFile), pack: read(packFile), packDir, contractFile, pointerFile };
})];
const english = read('public/res/locale/retail-ra2-en-US.json').labels;
const original = new Map<string, any>();
function member(name: string, edition: 'ra2' | 'yr' = 'ra2') {
    const key = edition + ':' + name;
    if (!original.has(key)) {
        try { const found = retailMember(edition, name); original.set(key, { ...found, error: undefined }); }
        catch (error) { original.set(key, { error: String(error) }); }
    }
    return original.get(key);
}
const verifiedFamilies = new Map<string, any>();
function verifyFamily(id: string, catalog = urban) {
    const key = catalog.theater + ':' + id;
    if (verifiedFamilies.has(key)) return verifiedFamilies.get(key);
    const family = catalog.contract.families[id], binding = catalog.pack.families[id];
    const result: any = { id, theater: catalog.theater, editions: family.editions, sourceMatched: true, palettesMatched: true,
        selected: !!binding, assetsVerified: true, members: [], issues: [] };
    if (!binding) { result.assetsVerified = false; result.issues.push('Family is not in the installed pack'); }
    for (const name of family.members) {
        const expected = family.sourceOverrides?.[name] ?? catalog.contract.sources[name], found = member(name);
        const matches = !found.error && found.sha256 === expected.sha256;
        result.sourceMatched &&= matches;
        if (matches) {
            found.file.stream.seek(0);
            const shp = new ShpFile(found.file);
            assert.deepEqual([shp.width, shp.height], expected.canvas);
            assert.equal(shp.numImages, expected.totalFrames);
        }
        const palettes = [expected.palette, ...Object.values(expected.framePalettes ?? {})] as any[];
        const paletteChecks = palettes.map(palette => {
            const edition = palette.archive?.startsWith('ra2md.') ? 'yr' : 'ra2';
            const actual = member(palette.member, edition).sha256 ?? null;
            return { member: palette.member, edition, expected: palette.sha256, actual, matches: actual === palette.sha256 };
        });
        result.palettesMatched &&= paletteChecks.every(check => check.matches);
        const selected = binding?.members.find((item: any) => item.member === name);
        const item: any = { member: name, sourceMatched: matches, sourceSha256: found.sha256 ?? null, paletteChecks, pages: [], densities: [] };
        if (selected) {
            const manifestFile = path.join(catalog.packDir, selected.path), bytes = fs.readFileSync(manifestFile), hd = JSON.parse(bytes.toString());
            assert.equal(sha(bytes), selected.sha256); assert.equal(hd.source.sha256, expected.sha256);
            assert.deepEqual(hd.logical.canvas, expected.canvas);
            assert.equal(hd.logical.frames.length, expected.bodyFrames);
            item.manifest = pin(manifestFile);
            for (const variant of hd.variants) {
                item.densities.push(variant.density);
                assert.deepEqual(variant.frames.map((frame: any) => frame.nativeFrame), hd.logical.frames.map((frame: any) => frame.nativeFrame));
                assert(variant.frames.every((frame: any) => variant.pages.some((page: any) => page.id === frame.page)));
                for (const page of variant.pages) for (const role of ['base', 'data']) {
                    const pageFile = path.join(path.dirname(manifestFile), String(variant.density), page.id, role + '.png');
                    const bytes = fs.readFileSync(pageFile);
                    assert.equal(bytes.length, page[role + 'Bytes']); assert.equal(sha(bytes), page[role + 'Sha256']);
                    item.pages.push({ density: variant.density, page: page.id, role, sha256: sha(bytes), bytes: bytes.length });
                }
            }
            assert.deepEqual(item.densities.sort(), [2, 4]);
        } else result.assetsVerified = false;
        result.members.push(item);
    }
    result.reusableSourceAndFiles = result.sourceMatched && result.palettesMatched && result.assetsVerified;
    verifiedFamilies.set(key, result); return result;
}
function instanceHd(instance: any) {
    return instance.vxlBound || instance.rhinoBound || instance.parts.some((part: any) => part.gpuHd)
        || instance.batch?.gpuHd;
}
const typeNames: Record<number, string> = { 1: 'aircraft', 2: 'building', 3: 'infantry', 4: 'overlay', 5: 'smudge', 6: 'scenery', 7: 'vehicle' };
const rows = native.rows.map((row: any) => {
    const placed = row.placements.length, count = row.instances.length;
    const visible = row.instances.filter((instance: any) => !instance.invisibleOverlay);
    const hdCount = visible.filter(instanceHd).length;
    const relatedFamilies = Object.entries(contract.families).filter(([, family]: any) => family.identities.includes(row.name))
        .map(([id]) => verifyFamily(id));
    let compatible = relatedFamilies.find((family: any) => family.reusableSourceAndFiles);
    const crossTheaterCandidates: any[] = [];
    if (!compatible) for (const catalog of catalogs.slice(1)) {
        for (const [id, family] of Object.entries(catalog.contract.families) as any) {
            if (!family.identities.includes(row.name)) continue;
            const candidate = verifyFamily(id, catalog);
            const descriptor = family.sourceOverrides?.[row.member] ?? catalog.contract.sources[row.member];
            const runtimePalette = row.type === 3 ? 'uniturb.pal' : row.type === 4 ? 'isourb.pal' : null;
            const runtimeSourceMatched = family.members.includes(row.member) && descriptor?.sha256 === member(row.member).sha256;
            const runtimePaletteMatched = !!runtimePalette && descriptor?.palette.sha256 === member(runtimePalette).sha256;
            const checked = { ...candidate, runtimeSourceMatched, runtimePaletteMatched, runtimePalette };
            crossTheaterCandidates.push(checked);
            if (!compatible && candidate.reusableSourceAndFiles && runtimeSourceMatched && runtimePaletteMatched) compatible = checked;
        }
    }
    const registeredFamily = contract.identities.ra2[row.name] ?? null;
    const source = row.member ? member(row.member) : null;
    const demand = native.world.actors.families[row.name];
    const dedicated = row.name === 'E2' ? native.world.dedicated.conscript.density > 1
        : row.name === 'HTNK' ? native.world.dedicated.rhino?.status === 'READY'
        : row.name === 'NAPOWR' ? native.world.dedicated.napowr?.density > 1
        : row.name === 'GAPOWR' ? native.world.dedicated.powerPlant?.density > 1 : false;
    const worldController = row.preparedOverride || demand?.status === 'READY' || dedicated;
    const unit = units[row.name], voxel = vxlUnitFamilies[row.name];
    const declaredController = unit && (!unit.blockedReason) || voxel && (!voxel.edition || voxel.edition === 'ra2')
        && vxlUnitAvailableInTheater(voxel, 'URBAN') || isAlliedBuildingHdFamily(row.name)
        || isSovietBuildingHdFamily(row.name) || ['NAPOWR', 'GAPOWR', 'NACNST', 'E2', 'HTNK'].includes(row.name);
    let status: string, issue: string | null = null;
    if (row.invisible) status = 'EXCLUDED_ORIGINAL_INVISIBLE_LIGHT';
    else if (count && !visible.length) status = 'EXCLUDED_INVISIBLE_BRIDGE_PLACEHOLDER';
    else if (visible.length && hdCount === visible.length) status = 'HD_BOUND_NATIVE';
    else if (visible.length && hdCount) { status = 'PARTIAL_NATIVE_HD_BINDING'; issue = 'Some placed instances still use Original'; }
    else if (count) { status = 'ORIGINAL_NATIVE_CONFIRMED'; }
    else if (worldController) status = 'HD_PREPARED_NOT_SPAWNED';
    else if (declaredController) status = 'HD_CONTROLLER_AVAILABLE_NOT_SPAWNED';
    else status = 'ORIGINAL_EXPECTED_FROM_CURRENT_ROUTES';
    if (status.startsWith('ORIGINAL')) {
        issue = compatible ? compatible.theater !== 'URBAN' ? 'SOURCE_MATCHED_CROSS_THEATER_ASSETS_NOT_REGISTERED_FOR_URBAN_RA2'
            : !registeredFamily ? 'SOURCE_MATCHED_ASSETS_MISSING_RA2_REGISTRATION'
            : 'REGISTERED_ENVIRONMENT_REINFORCEMENT_NOT_IN_INITIAL_DEMAND' : 'NO_COMPATIBLE_CURRENT_URBAN_HD_FAMILY';
    }
    let nativeVisiblePixels: number | null = null;
    if (row.name === 'BRIDGEB1' && source && !source.error) {
        const image = new ShpFile(source.file).getImage(row.instances[0].parts[0].frame);
        nativeVisiblePixels = image.imageData.filter(Boolean).length;
    }
    return { name: row.name, label: english[row.uiName?.toLowerCase()] ?? row.ruleName ?? row.name, kind: typeNames[row.type] ?? 'unknown',
        placed, observed: count, visibleObserved: visible.length, hdObserved: hdCount, status, issue,
        referencedBy: [...new Set(row.references.map((ref: any) => ref.section))], placements: row.placements,
        source: source ? { member: row.member, sha256: source.sha256 ?? null, archive: source.source ?? null, error: source.error } : null,
        registeredEnvironmentFamily: registeredFamily, compatibleCandidate: compatible ? compatible.theater + ':' + compatible.id : null,
        compatibleCandidateTheater: compatible?.theater ?? null,
        candidates: relatedFamilies.map((family: any) => ({ id: family.id, reusableSourceAndFiles: family.reusableSourceAndFiles,
            sourceMatched: family.sourceMatched, palettesMatched: family.palettesMatched, assetsVerified: family.assetsVerified })),
        crossTheaterCandidates, preparedOverride: row.preparedOverride, actorFamilyStatus: demand?.status ?? null, nativeVisiblePixels };
});
const placedRows = rows.filter((row: any) => row.placed && !row.status.startsWith('EXCLUDED'));
const summary: any = {};
for (const kind of ['building', 'infantry', 'vehicle', 'scenery', 'overlay', 'aircraft']) {
    const items = placedRows.filter((row: any) => row.kind === kind);
    summary[kind] = { types: items.length, placements: items.reduce((sum: number, row: any) => sum + row.placed, 0),
        hdTypes: items.filter((row: any) => row.status === 'HD_BOUND_NATIVE').length,
        originalTypes: items.filter((row: any) => row.status.startsWith('ORIGINAL')).length,
        originalPlacements: items.filter((row: any) => row.status.startsWith('ORIGINAL')).reduce((sum: number, row: any) => sum + row.placed, 0) };
}
const gaps = rows.filter((row: any) => row.status.startsWith('ORIGINAL') || row.status.startsWith('PARTIAL'));
const result = { schemaVersion: 1, status: 'AUDIT_COMPLETE_REMAINING_HD_GAPS_CONFIRMED', runtimeSourceHead: native.runtimeSourceHead,
    acceptedR6DeliverySha256: read('docs/m3-1-feedback-r6.json').delivery.sha256, originalMap: inventory.map, summary,
    originalPlacedTypes: gaps.filter((row: any) => row.placed).length,
    originalPlacedObjects: gaps.reduce((sum: number, row: any) => sum + row.placed, 0),
    gapTypesIncludingDeclaredReinforcementsAndOverlays: gaps.length,
    sourceMatchedReuseCandidates: gaps.filter((row: any) => row.compatibleCandidate).map((row: any) => row.name),
    crossTheaterReuseCandidates: gaps.filter((row: any) => row.compatibleCandidateTheater && row.compatibleCandidateTheater !== 'URBAN').map((row: any) => row.name),
    missingCurrentFamily: gaps.filter((row: any) => !row.compatibleCandidate).map((row: any) => row.name),
    catalogs: catalogs.map(catalog => ({ theater: catalog.theater, contract: pin(catalog.contractFile), pointer: pin(catalog.pointerFile) })),
    sourceMatchedFamilies: [...verifiedFamilies.values()], openingAircraft: native.openingAircraft,
    terrain: { density: native.world.terrain.density, fallbackGroups: native.world.terrain.groups.filter((group: any) => group.status !== 'PUBLISHED') },
    native: { proof: pin(nativeFile), harness: pin(path.join(base, 'native-complete/harness.mjs')),
        mode: '4X diagnostic-only reveal; paused placement inspection and bounded opening aircraft observation',
        sourceScope: 'All original placements, task-force declarations, native overlays, implicit aircraft and separately labeled production candidates. Dynamic declarations are not all claimed spawned.',
        completeBattleReplay: 'NOT_RERUN_UNCHANGED_R6_RUNTIME', glError: native.world.glError },
    excluded: rows.filter((row: any) => row.status.startsWith('EXCLUDED')).map((row: any) => ({ name: row.name, placed: row.placed, observed: row.observed, status: row.status })),
    limitations: ['This audit checks world actors, scenery, overlays and their current bindings; it is not an exhaustive audit of weapon effects, particles, rubble transitions, UI or movies.',
        'Low-tech production candidates are an upper bound, not a claim that every prerequisite can be built in Soviet 01.',
        'Source-matched files still require RA2 admission, complete runtime loading, palette/state and visual validation before reuse can be accepted.',
        'The earlier observer omitted batch renderers. Its raw report is retained; this report uses the complete observer instead.'], rows };
fs.writeFileSync(path.join(base, 'coverage.json'), JSON.stringify(result, null, 2) + '\n');
const csv = [['identity', 'label', 'kind', 'placed', 'observed', 'hd_observed', 'status', 'issue', 'compatible_family', 'reference_scopes', 'source_placements', 'native_locations', 'source_member', 'source_sha256'],
    ...rows.map((row: any) => [row.name, row.label, row.kind, row.placed, row.observed, row.hdObserved, row.status, row.issue ?? '', row.compatibleCandidate ?? '',
        row.referencedBy.join(';'), row.placements.map((p: any) => `${p.section}:${p.key}:${p.house ?? 'neutral'}@${p.tile.join(',')}`).join(';'),
        native.rows.find((r: any) => r.name === row.name).instances.map((p: any) => `${p.id}:${p.house ?? 'neutral'}@${p.tile.join(',')}`).join(';'),
        row.source?.member ?? '', row.source?.sha256 ?? ''])]
    .map(values => values.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
fs.writeFileSync('docs/m3-1-hd-coverage-audit.csv', csv);
const gapTable = gaps.map((row: any) => `| ${row.name} | ${row.label} | ${row.kind} | ${row.placed || (row.kind === 'overlay' ? `${row.observed} native overlay` : 'declared')} | ${row.issue} |`).join('\n');
const markdown = `# Soviet 01 remaining HD coverage audit

The user accepted the R6 map/arrow corrections before requesting this audit. The accepted runtime remains \`${native.runtimeSourceHead}\`; its Desktop ZIP and all game resources are unchanged. This audit found real remaining Original fallbacks. It makes no new authored-art, runtime-fix or complete-HD claim.

The source contains 161 structures (36 intentionally invisible lights), 78 vehicles/ships, 60 infantry and 746 scenery placements. All 29 task-force definitions, implicit paradrop aircraft and native overlays are included; low-tech production candidates are listed separately in the CSV. The native inspection uses the accepted extracted app and an isolated diagnostic reveal, not a new mission-completion attempt.

| Placed category | Visible placements | HD types | Original types | Original placements |
|---|---:|---:|---:|---:|
${Object.entries(summary).filter(([, value]: any) => value.placements).map(([kind, value]: any) => `| ${kind} | ${value.placements} | ${value.hdTypes} | ${value.originalTypes} | ${value.originalPlacements} |`).join('\n')}

## Remaining gaps

| Identity | Original English label | Kind | Placed count / scope | Cause |
|---|---|---|---:|---|
${gapTable}

Existing source-matched 2X/4X assets can support ${result.sourceMatchedReuseCandidates.length} gap identities: ${result.sourceMatchedReuseCandidates.join(', ')}. Every required member, palette, installed manifest and page hash was checked. These assets are candidates for reuse; registration and native state/visual validation are still required. The RA2 identity map omits most of these families because their declarations are currently YR-only. CIVBBP is registered for RA2 but not included in the initial environment demand, so a task-force-only arrival has no prepared override.

CIV1 and CIV3 have source/palette-matched candidates in other installed theater catalogs. The unit palette bytes are identical to URBAN; their selected 2X/4X pages also pass hashes. They still lack a compatible URBAN route. Other-theater wooden bridges use different native source and palette hashes, so they are not counted as reusable URBAN assets.

No source-compatible family was found in the current catalogs for ${result.missingCurrentFamily.join(', ')}. Pentagon C/D and the opening memorial/animated flag bind HD; Pentagon A/B remain Original. Eleven civilian road-vehicle types (plus the Soviet MCV) bind HD. The cargo plane appears naturally during the bounded opening observation and has no registered HD family. The single original wooden high-bridge piece is listed separately from the already-HD concrete bridge and invisible low-bridge placeholders. Its current source frame contains 3,939 nonzero pixels. TMP terrain publishes at 4X with no fallback group.

The native report covers both per-object and batched sprite materials, including trees, walls and ore. A null per-object sprite is not classified as Original when its batch binds HD. No memory/budget fallback was reported among the families that actually loaded; missing registrations never enter that list, which is why a loader summary alone would miss these gaps.

Detailed rows and locations: \`docs/m3-1-hd-coverage-audit.csv\`. Machine evidence: \`.artifacts/m3-1/hd-coverage-20261024/coverage.json\` and \`native-complete/report.json\`. Screenshots are embedded in the accompanying audit review. This is an audit only: no art was generated, no rule/map/runtime/resource was edited, no ZIP replaced, and main was not merged.
`;
fs.writeFileSync('docs/m3-1-hd-coverage-audit.md', markdown);
console.log(JSON.stringify({ status: result.status, summary, gaps: gaps.map((row: any) => ({ name: row.name, placed: row.placed, cause: row.issue })),
    reusable: result.sourceMatchedReuseCandidates.length, missingCurrentFamily: result.missingCurrentFamily }));
