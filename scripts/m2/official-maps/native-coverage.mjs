// Inspect original placements through an isolated packaged validation application.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';
import { validateNativeStates } from './native-states.mjs';
import { validateNativeBridge } from './native-bridge.mjs';
import { validateNativeDecals } from './native-decals.mjs';
import { validateNativeAnimations } from './native-animations.mjs';
import { validateNativeTerrainObjects } from './native-terrain-objects.mjs';
import { validateNativeResources } from './native-resources.mjs';
import { validateNativeOverlayObjects } from './native-overlay-objects.mjs';
import { validateNativeWalls } from './native-walls.mjs';
import { validateUrbanTrees } from '../../m2-4/native-urban-tree-objects.mjs';
import { validateUrbanFactionWalls, validateLateUrbanFactionWall } from '../../m2-4/native-urban-faction-walls.mjs';
import { validateNativeTechnology } from './native-technology.mjs';
import { validateNativeTechnologyService } from './native-technology-service.mjs';
import { validateLinkedBuildingCycle } from './native-linked-building-cycle.mjs';
import { validateNativeNeutralVehicles } from './native-neutral-vehicles.mjs';
import { installNativeObjectBindings } from './native-object-bindings.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const theater = process.argv.find(arg => arg.startsWith('--theater='))?.slice(10) ?? 'TEMPERATE';
assert(['TEMPERATE', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT'].includes(theater));
const baseline = theater === 'TEMPERATE'
    ? JSON.parse(await fs.readFile('.local/environment-packs/environment-m2-2-complete-v10/manifest.json'))
    : { families: {} };
const contract = JSON.parse(await fs.readFile(theater === 'TEMPERATE'
    ? 'desktop/environment-hd-contract.json' : `desktop/environment-${theater.toLowerCase()}-hd-contract.json`));
const manifestRoot = path.join('.local/environment-packs', contract.selectedPack.revision);
const manifest = JSON.parse(await fs.readFile(path.join(manifestRoot, 'manifest.json')));
const requestedFamilies = process.argv.find(arg => arg.startsWith('--families='))?.slice(11).split(',');
const decalNames = process.argv.find(arg => arg.startsWith('--decal-names='))?.split('=')[1].split(',');
assert(!decalNames || process.argv.includes('--decals') && decalNames.every(name =>
    /^(BURNT|CRATER)\d\d$/.test(name) && requestedFamilies?.includes(contract.identities[edition]?.[name])),
    'Scoped decals must belong to the explicitly requested complete families');
const voxelOnly = process.argv.includes('--voxel-only');
assert(!voxelOnly || !requestedFamilies && process.argv.some(arg => arg.startsWith('--voxel-actions=')),
    'Voxel-only checks require explicit actor names and no SHP family claim');
const newFamilies = voxelOnly ? [] : requestedFamilies ?? Object.keys(manifest.families).filter(id => !baseline.families[id]);
const requestedTerrainGroups = process.argv.find(arg => arg.startsWith('--terrain-groups='))?.slice(17).split(',');
const requestedTerrainMembers = process.argv.find(arg => arg.startsWith('--terrain-members='))?.slice(18).split(',');
const captureRequestedOnly = process.argv.includes('--capture-requested-only');
assert(!captureRequestedOnly || requestedTerrainGroups?.length,
    'Focused terrain captures require explicit requested groups');
assert(!requestedTerrainMembers || captureRequestedOnly && requestedTerrainMembers.length <= 16
    && new Set(requestedTerrainMembers).size === requestedTerrainMembers.length
    && requestedTerrainMembers.every(name => /^[a-z0-9_-]+\.(urb|sno|ubn|des|tem)$/.test(name)),
    'Explicit terrain captures require unique native member names and selected groups');
const captureReferenceFile = process.argv.find(arg => arg.startsWith('--capture-reference='))?.slice(20);
const captureObjectNames = process.argv.find(arg => arg.startsWith('--capture-object-names='))?.slice(23).split(',');
assert(!captureObjectNames || captureObjectNames.length <= 8 && new Set(captureObjectNames).size === captureObjectNames.length);
const captureObjectsOnly = process.argv.includes('--capture-objects-only');
const captureTerrainOnly = process.argv.includes('--capture-terrain-only');
const captureCentralTiles = process.argv.includes('--capture-central-tiles');
assert(!captureTerrainOnly || captureRequestedOnly && !captureObjectsOnly,
    'Terrain-only captures require explicit requested groups');
const originalTerrain = process.argv.includes('--original-terrain');
assert(!originalTerrain || !requestedTerrainGroups, 'Original terrain cannot claim authored terrain groups');
const nextOriginalTerrain = process.argv.includes('--next-original-terrain');
assert(!nextOriginalTerrain || process.argv.some(arg => arg.startsWith('--next-map=')),
    'Original next-map terrain requires an explicit map switch');
const voxelLifecycle = process.argv.includes('--neutral-voxel-lifecycle');
assert(!voxelLifecycle || ['SNOW', 'NEWURBAN'].includes(theater) && process.argv.includes('--release') &&
    process.argv.some(arg => arg.startsWith('--next-map=')),
    'Neutral voxel lifecycle requires a verified paired-placement theater, Original reset and a map change');
assert(!captureObjectsOnly || captureObjectNames?.length, 'Object-only captures require explicit names');
const stateNames = process.argv.find(arg => arg.startsWith('--state-names='))?.slice(14).split(',');
assert(!stateNames || process.argv.includes('--states') && stateNames.every(name =>
    newFamilies.includes(contract.identities[edition]?.[name])), 'Scoped state names must be selected families');
const linkedMembers = process.argv.find(arg => arg.startsWith('--linked-building-members='))?.slice(26).split(',');
const cycleMembers = process.argv.find(arg => arg.startsWith('--linked-building-cycles='))?.split('=')[1].split(',');
const cycleSourcePath = process.argv.find(arg => arg.startsWith('--linked-building-cycle-source='))?.split('=')[1];
const technologyCycleMembers = process.argv.find(arg => arg.startsWith('--technology-linked-cycles='))?.split('=')[1].split(',');
assert(!technologyCycleMembers || process.argv.includes('--technology-actions') && cycleSourcePath
    && new Set(technologyCycleMembers).size === technologyCycleMembers.length,
    'Captured technology cycles require explicit unique source members and the pinned source guide');
assert(newFamilies.every(id => manifest.families[id]), 'Requested family must be selected');
assert(!linkedMembers || linkedMembers.every(name => newFamilies.some(id =>
    manifest.families[id].members.some(member => member.member === name))),
    'Linked animation names must match the selected theater members');
const session = await startSession(receipt, output, edition, false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
}, async ({ page, report }) => {
    report.lobbyFixture = await page.evaluate(() => ({ maxSlots: window.__ra2debug.skirmishLobby.gameOpts.maxSlots,
        aiPlayers: window.__ra2debug.skirmishLobby.gameOpts.aiPlayers }));
    assert(report.lobbyFixture.aiPlayers.some(Boolean), 'Fixture requires a bot in a supported native slot');
});
const { page, app, report, close } = session;
let failure;
try {
    const renderPreset = process.argv.find(arg => arg.startsWith('--render-resolution='))?.split('=')[1];
    if (renderPreset) {
        assert.equal(renderPreset, '1080p');
        await page.evaluate(async () => {
            const graphics = window.__ra2debug.generalOptions.graphics;
            graphics.renderResolution.value = '720p';
            await new Promise(resolve => setTimeout(resolve, 100));
            graphics.renderResolution.value = '1080p';
        });
        await page.waitForFunction(() => window.__ra2debug.renderer.renderer.domElement.height === 1080);
        report.outputFixture = { preset: renderPreset,
            policy: 'Reapply the existing UI output preset after startup; unchanged logical camera, display scale and source pixels.' };
    }
    report.disclosure = 'Complete copied application, unchanged native selected map and rules. Map reveal and suspended bot AI are controlled fixtures inherited from the native session helper. Actual render bindings, allocation and lifecycle evidence do not establish natural-match or user visual acceptance.';
    report.requestedFamilies = newFamilies;
    report.captureScope = captureRequestedOnly ? 'requested-terrain-groups-and-native-families' : 'all-new-prefix-groups';
    report.theater = theater;
    report.selectedEnvironmentRevision = contract.selectedPack.revision;
    await installNativeObjectBindings(page);
    report.terrain = await page.evaluate(() => window.__ra2debug.terrainHd);
    report.environment = await page.evaluate(() => window.__ra2debug.environmentHd);
    if (process.argv.includes('--source-scoped-library')) {
        report.sourceScope = await page.evaluate(names => {
            const d = window.__ra2debug;
            return { sourceSha256: d.game.officialSkirmishSourceSha256,
                adaptation: d.game.officialVisualAdaptations,
                placements: d.game.getWorld().getAllObjects().filter(o => o.isBuilding() && names.includes(o.name))
                    .map(o => {
                        const r = d.renderableManager.getRenderableByGameObject(o);
                        return { name: o.name, paletteType: r?.objectArt?.paletteType,
                            customPaletteName: r?.objectArt?.customPaletteName,
                            hd: r?.mainObj?.builder?.hdOverride?.identity };
                    }) };
        }, ['CACITY01', 'CACITY02', 'CACITY03', 'CACITY04']);
        const scopedMaps = [...new Set(newFamilies.flatMap(id =>
            contract.families[id].sourceScope?.officialMapSha256s ?? []))];
        assert.equal(scopedMaps.length, 1, 'Source-scoped validation requires one exact approved map');
        assert.equal(report.sourceScope.sourceSha256, scopedMaps[0]);
        assert.equal(report.sourceScope.adaptation.status, 'APPLIED_SOURCE_PINNED_ORIGINAL_LIBRARY_PALETTE');
        assert.equal(report.sourceScope.adaptation.members.length, 4);
        assert.equal(new Set(report.sourceScope.placements.map(o => o.name)).size, 4);
        assert(report.sourceScope.placements.every(o => o.hd && o.paletteType === 5 && o.customPaletteName === 'lib'));
    }
    assert.equal(report.terrain.density, originalTerrain ? 1 : density);
    if (originalTerrain) {
        assert.equal(report.terrain.worldChargeBytes, 0);
        assert.equal(report.terrain.placedBindings.length, 0);
        report.originalTerrainDisclosure = 'Original terrain is intentional while accepted object families are integrated; no terrain coverage is claimed.';
    }
    assert.equal(report.environment.density, density);
    if (requestedTerrainGroups) {
        report.requestedTerrainGroups = requestedTerrainGroups;
        for (const id of requestedTerrainGroups) {
            assert(report.terrain.groups.some(group => group.id === id && group.status === 'PUBLISHED'),
                `Requested terrain group must publish: ${id}`);
            assert(report.terrain.placedBindings.some(binding => binding.group === id),
                `Requested terrain group must have an actual placement: ${id}`);
        }
    }
    report.newEncounteredFamilies = Object.entries(report.environment.families)
        .filter(([id, value]) => newFamilies.includes(id) && value.reason !== 'not-selected')
        .map(([id, value]) => ({ id, ...value }));
    assert(report.newEncounteredFamilies.length > 0 || voxelOnly
        || process.argv.some(arg => arg.startsWith('--faction-wall-actions=')),
        'Map must encounter complete SHP families or separately asserted native wall/vehicle bindings');
    assert(report.newEncounteredFamilies.every(value => value.status === 'PUBLISHED_COMPLETE_FAMILY'),
        'Every new encountered family must publish completely within the unchanged budget');
    report.placed = await page.evaluate(() => window.__ra2debug.game.getWorld().getAllObjects()
        .filter(object => object.tile).map(window.__m23Binding));
    report.newNativeBindings = report.placed.filter(object => newFamilies.includes(contract.identities[edition]?.[object.name]) && object.hd);
    for (const object of report.newNativeBindings.filter(object => object.type === 2)) {
        const family = manifest.families[contract.identities[edition][object.name]];
        assert(family.members.some(member => member.member === object.mainMember),
            `Selected building source must belong to its complete family: ${object.name}`);
        const members = object.sourceMembers.map(name => family.members.find(member => member.member === name)).filter(Boolean);
        assert.deepEqual(members.map(member => member.member).sort(), family.members.map(member => member.member).sort());
        const identities = [];
        for (const member of members) {
            const metadata = JSON.parse(await fs.readFile(path.join(manifestRoot, member.path)));
            identities.push(`${member.sha256}/${metadata.source.sha256}/${theater}/tiles/${density}`);
        }
        assert.equal(object.hd, 'environment-aggregate/' + identities.join('|'));
    }
    if (linkedMembers) {
        assert(linkedMembers.length > 0 && new Set(linkedMembers).size === linkedMembers.length);
        if (cycleMembers) {
            const target = report.newNativeBindings.find(object => object.sourceMembers.some(member => cycleMembers.includes(member)));
            assert(target, 'Full-cycle observation requires an original placed building');
            await page.evaluate(tile => {
                const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
            }, target.tile);
            await page.waitForTimeout(120);
        }
        const sample = () => page.evaluate(names => {
            const d = window.__ra2debug;
            const members = [];
            for (const object of d.game.getWorld().getAllObjects().filter(object => names.includes(object.name))) {
                const r = d.renderableManager.getRenderableByGameObject(object);
                for (const list of r?.animObjects?.values() ?? []) for (const anim of list) {
                    const source = [...r.aggregatedImageData.imageIndexes].find(([, offset]) => offset === anim.builder.frameOffset)?.[0];
                    members.push({ name: object.name, id: object.id, member: source?.filename,
                        frame: anim.builder.getFrame(), hd: anim.builder.hdOverride?.identity });
                }
            }
            return { tick: d.game.currentTick, members };
        }, report.newNativeBindings.map(object => object.name));
        const before = await sample();
        await page.waitForTimeout(550);
        const after = await sample();
        report.linkedBuildingMembers = { requested: linkedMembers, before, after,
            status: 'OBSERVED_BINDINGS_PHASE_VALIDATION_PENDING' };
        assert(after.tick > before.tick);
        if (cycleMembers) assert(cycleMembers.length > 0 && new Set(cycleMembers).size === cycleMembers.length
            && cycleMembers.every(member => linkedMembers.includes(member)));
        for (const name of linkedMembers) {
            const members = before.members.filter(member => member.member === name);
            assert(members.length > 0, `Original linked building animation must be active: ${name}`);
            const family = newFamilies.find(id => manifest.families[id].members.some(member => member.member === name));
            assert(family, `Linked member must belong to a requested complete family: ${name}`);
            const member = manifest.families[family].members.find(member => member.member === name);
            const metadata = JSON.parse(await fs.readFile(path.join(manifestRoot, member.path)));
            const expected = `${member.sha256}/${metadata.source.sha256}/${theater}/tiles/${density}`;
            const includesExpected = value => value?.startsWith('environment-aggregate/')
                && value.slice('environment-aggregate/'.length).split('|').includes(expected);
            assert(members.every(member => includesExpected(member.hd)));
            if (cycleMembers?.includes(name)) {
                assert(cycleSourcePath, 'Full cycles require exact original source/art declarations');
                const bytes = await fs.readFile(cycleSourcePath);
                const sha256 = createHash('sha256').update(bytes).digest('hex');
                assert.equal(sha256, contract.preparedSourceSha256);
                const source = JSON.parse(bytes).sources.find(source => source.member === name);
                assert.equal(source.sha256, metadata.source.sha256);
                const ranges = source.bindings.map(binding => ({
                    loopStart: Number(binding.nativeArt.LoopStart ?? 0),
                    loopEnd: Math.max(Number(binding.nativeArt.LoopStart ?? 0),
                        Number(binding.nativeArt.LoopEnd ?? Number(binding.nativeArt.End ?? metadata.logical.frames.length - 1) + 1) - 1) }));
                assert(ranges.every(range => JSON.stringify(range) === JSON.stringify(ranges[0])));
                report.linkedBuildingCycleSource = { path: cycleSourcePath, sha256,
                    loopEndSemantics: 'Original Art LoopEnd is an exclusive boundary in unchanged AnimProps.init.' };
                const powered = source.bindings.every(binding => /^(yes|true|1)$/i.test(binding.nativeRules.Powered ?? 'no'));
                await validateLinkedBuildingCycle(session, name, metadata.logical.frames.length,
                    { ...ranges[0], allowNativePoweredIdle: powered });
            } else {
                assert(after.members.some(member => member.member === name && includesExpected(member.hd)
                    && before.members.some(previous => previous.id === member.id && previous.member === name
                        && previous.frame !== member.frame)), `Native linked animation must advance: ${name}`);
            }
        }
        report.linkedBuildingMembers = { requested: linkedMembers, before, after,
            status: 'PASS_EXACT_SOURCE_PINNED_LINKED_BUILDING_ANIMATION_BINDINGS_AND_PHASES' };
    }
    assert(!cycleMembers || linkedMembers, 'Cycle observation requires exact linked-member validation');
    if (process.argv.includes('--decals')) {
        const expectedBindings = {};
        for (const [name, id] of Object.entries(contract.identities[edition])) {
            if (!/^(BURNT|CRATER)\d\d$/.test(name)) continue;
            const member = manifest.families[id].members[0];
            const bytes = await fs.readFile(path.join(manifestRoot, member.path));
            const metadata = JSON.parse(bytes);
            expectedBindings[name] = `${createHash('sha256').update(bytes).digest('hex')}/${metadata.source.sha256}/${theater}/tiles/${density}`;
        }
        await validateNativeDecals(session, expectedBindings, decalNames);
    }
    assert(report.newNativeBindings.length > 0 || report.newNativeDecals?.cases.some(sample =>
        newFamilies.includes(contract.identities[edition]?.[sample.name]))
        || process.argv.some(arg => arg.startsWith('--faction-wall-actions=')) || voxelOnly,
    'Actual native placements, requested decals or separately asserted faction wall bindings are required');
    if (process.argv.includes('--states')) {
        const names = Object.entries(contract.identities[edition]).filter(([name, family]) => (!stateNames || stateNames.includes(name)) && newFamilies.includes(family)
            && report.environment.families[family]?.status === 'PUBLISHED_COMPLETE_FAMILY').map(([name]) => name);
        const frameCounts = {};
        for (const name of names) {
            const member = manifest.families[contract.identities[edition][name]].members[0];
            const metadata = JSON.parse(await fs.readFile(path.join(manifestRoot, member.path)));
            frameCounts[name] = metadata.logical.frames.length;
        }
        const damagedLinkedCycles = {}, poweredLinkedCycles = {};
        if (cycleMembers) {
            const source = JSON.parse(await fs.readFile(cycleSourcePath));
            for (const member of cycleMembers) {
                const original = source.sources.find(value => value.member === member);
                for (const name of names) {
                    const powered = original.bindings.filter(binding => binding.id === name
                        && binding.edition === edition && /^(yes|true|1)$/i.test(binding.nativeRules.Powered ?? 'no'));
                    if (powered.length) {
                        const ranges = powered.map(binding => ({ member,
                            frameCount: original.totalFrames / (original.hasShadow ? 2 : 1),
                            loopStart: Number(binding.nativeArt.LoopStart ?? 0),
                            loopEnd: Number(binding.nativeArt.LoopEnd) - 1 }));
                        assert(ranges.every(range => JSON.stringify(range) === JSON.stringify(ranges[0])));
                        (poweredLinkedCycles[name] ??= []).push(ranges[0]);
                    }
                    const bindings = original.bindings.filter(binding => binding.id === name
                        && binding.edition === edition && binding.damagedNativeArt);
                    if (!bindings.length) continue;
                    const ranges = bindings.map(binding => ({ member,
                        frameCount: original.totalFrames / (original.hasShadow ? 2 : 1),
                        loopStart: Number(binding.damagedNativeArt.LoopStart ?? binding.damagedNativeArt.Start ?? 0),
                        loopEnd: Number(binding.damagedNativeArt.LoopEnd) - 1 }));
                    assert(ranges.every(range => JSON.stringify(range) === JSON.stringify(ranges[0])));
                    (damagedLinkedCycles[name] ??= []).push(ranges[0]);
                }
            }
        }
        await validateNativeStates(session, names, frameCounts, false, { damagedLinkedCycles, poweredLinkedCycles,
            recordEachActor: process.argv.includes('--record-each-actor') });
    }
    if (process.argv.includes('--bridge-actions')) await validateNativeBridge(session);
    if (process.argv.includes('--technology-actions')) {
        const names = process.argv.find(arg => arg.startsWith('--technology-names='))?.slice(19).split(',');
        const requested = names ?? stateNames ?? ['CAOILD', 'CAHOSP', 'CAAIRP', 'CAOUTP'];
        assert(requested.every(name => newFamilies.includes(contract.identities[edition]?.[name])),
            'Technology actions require selected complete families in the current theater');
        const linkedCycles = {};
        if (technologyCycleMembers) {
            const bytes = await fs.readFile(cycleSourcePath);
            const sha256 = createHash('sha256').update(bytes).digest('hex');
            assert.equal(sha256, contract.preparedSourceSha256);
            const source = JSON.parse(bytes);
            for (const member of technologyCycleMembers) {
                const original = source.sources.find(value => value.member === member);
                assert(original && !original.hasShadow && original.bindings.every(binding => binding.role === 'ACTIVE'));
                const names = requested.filter(name => original.bindings.some(binding => binding.id === name));
                assert.equal(names.length, 1, 'Each captured linked member must belong to one requested technology building');
                const family = contract.identities[edition][names[0]];
                const declaration = manifest.families[family].members.find(value => value.member === member);
                assert(declaration && contract.sources[member].sha256 === original.sha256);
                (linkedCycles[names[0]] ??= []).push({ member, frameCount: original.totalFrames });
            }
            report.technologyLinkedCycleSource = { path: cycleSourcePath, sha256,
                policy: 'Normal/damaged loop ranges are read from the actual captured animation Art INI; no overrides.' };
        }
        await validateNativeTechnology(session, requested, { linkedCycles });
    }
    if (process.argv.includes('--technology-service')) {
        assert.equal(theater, 'SNOW');
        await validateNativeTechnologyService(session);
    }
    const snowBridgeKinds = process.argv.find(arg => arg.startsWith('--snow-bridge-actions='))?.split('=')[1].split(',');
    const bridgeKinds = process.argv.find(arg => arg.startsWith('--bridge-kinds='))?.split('=')[1].split(',');
    assert(!snowBridgeKinds || !bridgeKinds, 'Use one bridge suite selector');
    if (snowBridgeKinds || bridgeKinds) {
        if (snowBridgeKinds) assert.equal(theater, 'SNOW');
        const kinds = bridgeKinds ?? snowBridgeKinds;
        assert(new Set(kinds).size === kinds.length);
        report.nativeBridges = [];
        for (const kind of kinds) {
            await validateNativeBridge(session, kind);
            assert(report.newNativeBridge.status.startsWith('PASS_NATIVE_'), 'Requested native bridge must exist and pass');
            report.nativeBridges.push(report.newNativeBridge);
        }
        if (theater === 'SNOW') report.snowNativeBridges = report.nativeBridges;
    }
    if (process.argv.includes('--animations')) await validateNativeAnimations(session);
    if (process.argv.includes('--terrain-object-actions')) await validateNativeTerrainObjects(session);
    const propActions = process.argv.find(arg => arg.startsWith('--urban-prop-actions='));
    if (propActions) {
        assert(['URBAN', 'NEWURBAN'].includes(theater));
        const expected = {};
        const originals = report.newNativeBindings.filter(object => object.type === 6
            && /^(TIBTRE0[23]|LT_(SGN|GEN|EUR)\d\d|TRFF\d\d|SIGN\d\d|POLE\d\d|HDSTN01)$/.test(object.name));
        for (const name of new Set(originals.map(object => object.name))) {
            const family = contract.identities[edition][name];
            const [member] = manifest.families[family].members;
            const metadata = JSON.parse(await fs.readFile(path.join(manifestRoot, member.path)));
            expected[name] = `${member.sha256}/${metadata.source.sha256}/${theater}/tiles/${density}`;
        }
        assert(Object.keys(expected).length > 0);
        await validateUrbanTrees(session, expected, propActions.split('=')[1].split(',').filter(Boolean), 'urbanNativeProps');
    }
    const treeActionNames = process.argv.find(arg => arg.startsWith('--urban-tree-actions='))?.split('=')[1].split(',');
    if (treeActionNames) {
        assert(['URBAN', 'NEWURBAN', 'DESERT'].includes(theater));
        const expected = {};
        for (const name of new Set(report.newNativeBindings.filter(object => object.type === 6 && /^TREE\d\d$/.test(object.name)).map(object => object.name))) {
            const family = contract.identities[edition][name];
            const [member] = manifest.families[family].members;
            const metadata = JSON.parse(await fs.readFile(path.join(manifestRoot, member.path)));
            expected[name] = `${member.sha256}/${metadata.source.sha256}/${theater}/tiles/${density}`;
        }
        await validateUrbanTrees(session, expected, treeActionNames);
    }
    if (process.argv.includes('--resource-actions')) await validateNativeResources(session);
    if (process.argv.includes('--overlay-object-actions')) {
        assert(['SNOW', 'URBAN'].includes(theater));
        const expectedBindings = {};
        for (const [name, id] of Object.entries(contract.identities[edition])) {
            if (!newFamilies.includes(id) || !/^(SROCK\d\d|TROCK\d\d|W?CRATE)$/.test(name)) continue;
            const [member] = manifest.families[id].members;
            const metadata = JSON.parse(await fs.readFile(path.join(manifestRoot, member.path)));
            expectedBindings[name] = `${member.sha256}/${metadata.source.sha256}/${theater}/tiles/${density}`;
        }
        assert.equal(Object.keys(expectedBindings).length, theater === 'URBAN' ? 7 : 12);
        await validateNativeOverlayObjects(session, expectedBindings);
    }
    const invisibleOverlay = process.argv.find(arg => arg.startsWith('--invisible-system-overlay='))?.split('=')[1];
    if (invisibleOverlay) {
        assert(theater === 'URBAN' && invisibleOverlay === 'RUBBLE_OVERLAY');
        report.invisibleSystemOverlay = await page.evaluate(name => {
            const d = window.__ra2debug;
            return d.game.getWorld().getAllObjects().filter(object => object.name === name && object.isOverlay())
                .map(object => {
                    const renderable = d.renderableManager.getRenderableByGameObject(object);
                    return { name, id: object.id, tile: [object.tile.rx, object.tile.ry],
                        isRubble: object.rules.isRubble, invisible: renderable?.isInvisible,
                        mainSprite: !!renderable?.mainRenderable, batched: d.mapRenderable.overlayLayer.hasObject(object) };
                });
        }, invisibleOverlay);
        assert(report.invisibleSystemOverlay.length > 0);
        assert(report.invisibleSystemOverlay.every(row => row.isRubble && row.invisible && !row.mainSprite && !row.batched));
    }
    const wallName = process.argv.find(arg => arg.startsWith('--wall-actions='))?.slice(15);
    if (wallName) {
        assert(wallName === 'CAFNCP' && theater === 'TEMPERATE'
            || ['CAKRMW', 'GASAND'].includes(wallName) && theater === 'SNOW'
            || wallName === 'GASAND' && theater === 'URBAN');
        const family = contract.identities[edition][wallName];
        assert(newFamilies.includes(family));
        const [member] = manifest.families[family].members;
        const metadata = JSON.parse(await fs.readFile(path.join(manifestRoot, member.path)));
        assert.equal(metadata.logical.frames.length, wallName === 'CAFNCP' || wallName === 'GASAND' && theater === 'URBAN' ? 32 : 48);
        await validateNativeWalls(session, wallName,
            `${member.sha256}/${metadata.source.sha256}/${theater}/tiles/${density}`);
    }
    const factionWalls = process.argv.find(arg => arg.startsWith('--faction-wall-actions='))?.split('=')[1].split(',');
    if (factionWalls) {
        assert.equal(theater, 'URBAN');
        await validateUrbanFactionWalls(session, density, factionWalls);
    }
    const lateFactionWall = process.argv.find(arg => arg.startsWith('--late-faction-wall='))?.split('=')[1];
    if (lateFactionWall) {
        assert.equal(theater, 'URBAN');
        await validateLateUrbanFactionWall(session, density, lateFactionWall);
    }
    const lifecycleWallNames = [...(factionWalls ?? []), ...(lateFactionWall ? [lateFactionWall] : [])];
    let route = [];
    const seen = new Set();
    const groupPrefix = theater === 'TEMPERATE' ? 'm2-3-' : `m2-4-${theater.toLowerCase()}-`;
    const candidates = report.terrain.placedBindings.filter(binding => !voxelOnly && !captureObjectsOnly && (
        captureRequestedOnly ? requestedTerrainGroups.includes(binding.group) : binding.group.startsWith(groupPrefix)));
    const memberGroups = new Set();
    if (requestedTerrainMembers) {
        report.requestedTerrainMembers = requestedTerrainMembers;
        for (const name of requestedTerrainMembers) {
            const binding = candidates.find(binding => binding.member === name);
            assert(binding, `Requested terrain member must have an actual selected-group placement: ${name}`);
            memberGroups.add(binding.group);
        }
    }
    if (captureCentralTiles && candidates.length) {
        const center = [0, 1].map(axis => candidates.reduce((sum, binding) => sum + binding.tile[axis], 0) / candidates.length);
        const distance = binding => (binding.tile[0] - center[0]) ** 2 + (binding.tile[1] - center[1]) ** 2;
        candidates.sort((a, b) => distance(a) - distance(b));
        report.capturePlacementPolicy = 'Closest actual requested-group placement to their shared centroid; no source or camera scale edits';
    }
    for (const binding of candidates) {
        if (seen.has(binding.group) || memberGroups.has(binding.group)) continue;
        seen.add(binding.group); route.push({ name: binding.group, tile: binding.tile });
    }
    for (const name of requestedTerrainMembers ?? []) {
        const binding = candidates.find(binding => binding.member === name);
        route.push({ name: `${binding.group}-${name}`, tile: binding.tile });
    }
    const names = new Set();
    if (captureObjectNames) assert(captureObjectNames.every(name => report.newNativeBindings.some(object => object.name === name)),
        'Every requested capture object must have an actual native placement');
    for (const object of report.newNativeBindings) {
        if (captureTerrainOnly) break;
        if (names.has(object.name)) continue;
        if (captureObjectNames ? !captureObjectNames.includes(object.name) : names.size >= 4) continue;
        names.add(object.name); route.push({ name: object.name, tile: object.tile });
    }
    if (process.argv.includes('--capture-bridge-kinds-only')) {
        assert(report.nativeBridges?.length, 'Bridge captures require successful native bridge actions');
        route = report.nativeBridges.map(sample => ({ name: `${sample.kind}-bridge-context`,
            tile: sample.standing.pieces[Math.floor(sample.standing.pieces.length / 2)].tile }));
        report.captureScope = `new-${theater.toLowerCase()}-bridge-kinds`;
    }
    if (captureReferenceFile) {
        const reference = JSON.parse(await fs.readFile(captureReferenceFile, 'utf8'));
        if (reference.schema === 'm2-4-source-pinned-camera-route-v1') {
            assert.equal(reference.status, 'PREPARED_NATIVE_CAMERA_ROUTE_ONLY');
            const bytes = await fs.readFile(reference.sourceReport);
            assert.equal(createHash('sha256').update(bytes).digest('hex'), reference.sourceReportSha256);
            const source = JSON.parse(bytes);
            assert.equal(source.status, 'PASS_SELECTED_NATIVE_CASES');
            assert.equal(source.selectedMap, report.selectedMap);
            assert.equal(source.edition, report.edition);
            for (const sample of reference.captureRoute) {
                const placed = [...source.terrain.placedBindings.map(binding => ({ name: binding.group, tile: binding.tile })),
                    ...source.newNativeBindings];
                assert(placed.some(binding => binding.name === sample.name &&
                    binding.tile[0] === sample.tile[0] && binding.tile[1] === sample.tile[1]),
                'Camera-only recapture must use a verified unchanged original placement');
            }
        } else assert.equal(reference.status, 'PASS_SELECTED_NATIVE_CASES');
        assert.equal(reference.selectedMap, report.selectedMap);
        assert.equal(reference.edition, report.edition);
        route = reference.captureRoute;
        assert(route.length > 0 && route.every(sample => typeof sample.name === 'string'
            && sample.tile.length >= 2 && sample.tile.every(Number.isFinite)));
        report.captureReference = captureReferenceFile;
    }
    report.captureRoute = route;
    for (const [i, sample] of route.entries()) {
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, sample.tile);
        await page.waitForTimeout(150);
        const png = await page.evaluate(() => {
            const d = window.__ra2debug; d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        });
        await fs.writeFile(path.join(output, `${String(i).padStart(2, '0')}-${sample.name}-framebuffer.png`), Buffer.from(png, 'base64'));
    }
    const voxelNames = process.argv.find(arg => arg.startsWith('--voxel-actions='))?.split('=')[1].split(',');
    if (voxelNames) {
        const declarations = contract.vxl ?? JSON.parse(await fs.readFile(
            'desktop/environment-snow-hd-contract.json', 'utf8')).vxl;
        assert(voxelNames.every(name => declarations[name]?.theaters.includes(theater)),
            'Neutral voxel actions require verified theater availability');
        await validateNativeNeutralVehicles(session, voxelNames, declarations, density);
    }
    report.combinedWorldAllocation = await page.evaluate(() => {
        const d = window.__ra2debug, w = d.worldView;
        const terrain = d.terrainHd.worldChargeBytes, environment = d.environmentHd.worldChargeBytes;
        const baseline = (w.conscriptHd?.report.gpuBytes ?? 0) + (w.powerPlantHd?.report.gpuBytes ?? 0)
            + (w.napowrHd?.report.gpuBytes ?? 0) + [...(w.rhinoHd?.parts.values() ?? [])].reduce((sum, part) =>
                sum + part.bitmap.width * part.bitmap.height * 5 + part.palette.image.data.byteLength, 0);
        const eager = Object.entries(w.sovietBuildingsHd ?? {}).filter(([name]) => !d.sovietUnitsHd.families[name])
            .reduce((sum, [, family]) => sum + family.report.gpuBytes, 0);
        const demand = d.sovietUnitsHd.gpuBytes;
        return { terrain, environment, baseline, eager, demand,
            total: terrain + environment + baseline + eager + demand, limit: d.terrainHd.budget };
    });
    assert.equal(report.combinedWorldAllocation.limit, (density === 2 ? 512 : 1280) * 1024 * 1024);
    assert(report.combinedWorldAllocation.total <= report.combinedWorldAllocation.limit);
    report.graphics = await page.evaluate(() => {
        const d = window.__ra2debug, r = d.renderer.renderer;
        return { output: [r.domElement.width, r.domElement.height], glError: r.getContext().getError(),
            textures: r.info.memory.textures, prepared: { ...d.preparedHdCache } };
    });
    assert.equal(report.graphics.glError, 0);
    report.processMemory = await app.evaluate(({ app }) => app.getAppMetrics().map(process => ({ type: process.type, memory: process.memory })));
    report.userVisualAcceptance = false;
    if (process.argv.includes('--release')) {
        if (voxelOnly) report.newNativeNeutralVehicles.lifecycle = { before: await page.evaluate(() => {
            const demand = window.__m24OldActorDemand = window.__ra2debug.worldView.sovietUnitsHd;
            return { families: [...demand.families.keys()], gpuBytes: demand.report.gpuBytes };
        }) };
        if (lifecycleWallNames.length) {
            report.factionWallLifecycle = { before: await page.evaluate(names => {
                const d = window.__ra2debug, view = d.worldView;
                window.__m24OldWallDemand = view.sovietUnitsHd;
                window.__m24OldWallAllocations = names.map(name => ({ name, allocation: view.sovietBuildingsHd[name] }));
                return window.__m24OldWallAllocations.map(({ name, allocation }) =>
                    ({ name, overrides: allocation?.overrides.size ?? 0, gpuBytes: allocation?.report.gpuBytes ?? 0 }));
            }, lifecycleWallNames) };
            assert(report.factionWallLifecycle.before.every(row => row.overrides > 0 && row.gpuBytes > 0));
        }
        if (voxelLifecycle) {
            for (const name of ['WINI', 'TRUCKB']) {
                await page.evaluate(name => {
                    const d = window.__ra2debug;
                    const object = d.game.getWorld().getAllObjects().find(o => o.name === name && o.isSpawned);
                    if (!object) throw Error('Missing original neutral voxel placement');
                    window.__m24NeutralLifecycleObject = object;
                    d.worldInteraction.minimapHandler.panToTile(object.tile);
                }, name);
                await page.waitForFunction(() => window.__ra2debug.renderableManager
                    .getRenderableByGameObject(window.__m24NeutralLifecycleObject)?.unitVxlHd?.active);
            }
            report.neutralVoxelLifecycle = { before: await page.evaluate(() => {
                const loaded = window.__m24OldNeutralHd = window.__ra2debug.worldView.sovietUnitsHd;
                return { gpuBytes: loaded.report.gpuBytes, families: ['WINI', 'TRUCKB'].map(name => ({
                    name, loaded: loaded.families.has(name), report: loaded.report.families[name] })) };
            }) };
            assert(report.neutralVoxelLifecycle.before.families.every(f => f.loaded && f.report.density === density));
        }
        await page.evaluate(() => {
            const d = window.__ra2debug; clearInterval(window.__allied.timer);
            window.__m23OldGame = d.game; window.__m23OldEnvironment = d.environmentHd;
            window.__m23OldTerrain = d.terrainHd; d.generalOptions.graphics.hdEnabled.value = false;
        });
        await page.evaluate(async () => { await window.r.reset; });
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
            && window.__ra2debug.game !== window.__m23OldGame, undefined, { timeout: 90000 });
        report.release = await page.evaluate(() => ({ environment: window.__m23OldEnvironment,
            terrain: window.__m23OldTerrain, currentEnvironment: window.__ra2debug.environmentHd,
            currentTerrain: window.__ra2debug.terrainHd }));
        assert(report.release.environment.disposed && report.release.environment.worldChargeBytes === 0);
        assert(report.release.terrain.disposed && report.release.terrain.worldChargeBytes === 0);
        assert.equal(report.release.currentEnvironment.worldChargeBytes, 0);
        if (voxelOnly) {
            const released = report.newNativeNeutralVehicles.lifecycle.released = await page.evaluate(() => ({
                oldFamilies: window.__m24OldActorDemand.families.size,
                oldGpuBytes: window.__m24OldActorDemand.report.gpuBytes,
                originalGpuBytes: window.__ra2debug.worldView.sovietUnitsHd?.report.gpuBytes ?? 0 }));
            assert.deepEqual(released, { oldFamilies: 0, oldGpuBytes: 0, originalGpuBytes: 0 });
        }
        if (lifecycleWallNames.length) {
            report.factionWallLifecycle.released = await page.evaluate(() => ({
                oldDemandFamilies: window.__m24OldWallDemand.families.size,
                oldDemandGpuBytes: window.__m24OldWallDemand.report.gpuBytes,
                oldWallOverrides: window.__m24OldWallAllocations.map(({ name, allocation }) =>
                    ({ name, overrides: allocation?.overrides.size ?? 0 })),
                originalDemandGpuBytes: window.__ra2debug.worldView.sovietUnitsHd?.report.gpuBytes ?? 0,
            }));
            const released = report.factionWallLifecycle.released;
            assert(released.oldDemandFamilies === 0 && released.oldDemandGpuBytes === 0
                && released.originalDemandGpuBytes === 0 && released.oldWallOverrides.every(row => row.overrides === 0));
            report.factionWallLifecycle.status = 'PASS_WALL_ALLOCATIONS_RELEASED_AND_ORIGINAL_REENTRY';
        }
        if (voxelLifecycle) {
            report.neutralVoxelLifecycle.released = await page.evaluate(() => ({
                oldFamilies: window.__m24OldNeutralHd.families.size,
                oldGpuBytes: window.__m24OldNeutralHd.report.gpuBytes,
                originalGpuBytes: window.__ra2debug.worldView.sovietUnitsHd?.report.gpuBytes ?? 0 }));
            assert.deepEqual(report.neutralVoxelLifecycle.released,
                { oldFamilies: 0, oldGpuBytes: 0, originalGpuBytes: 0 });
        }
        await page.evaluate(() => window.__installAlliedFixtures());
    }
    const nextMap = process.argv.find(arg => arg.startsWith('--next-map='))?.slice(11);
    if (nextMap) {
        assert(/^[a-z0-9_-]+\.map$/i.test(nextMap));
        await page.evaluate(({ edition, nextMap, density }) => {
            const d = window.__ra2debug; clearInterval(window.__allied.timer);
            window.__m24OldGame = d.game; window.__m24OldEnvironment = d.environmentHd;
            window.__m24OldTerrain = d.terrainHd;
            d.generalOptions.graphics.hdEnabled.value = true;
            d.generalOptions.graphics.hdDensity.value = density;
            const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
            localStorage.setItem(`_edition:${edition}:_r_lastMap`, nextMap);
            localStorage.setItem(`_edition:${edition}:_r_lastBots`, JSON.stringify(bots));
            d.gameScreen.controller.goToScreen(0, { route: { screenType: 1, params: undefined } });
        }, { edition, nextMap, density });
        await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 60000 });
        assert.equal(await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName.toLowerCase()), nextMap.toLowerCase());
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000001));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
            && window.__ra2debug.game !== window.__m24OldGame, undefined, { timeout: 90000 });
        report.crossTheater = await page.evaluate(() => ({ environment: window.__m24OldEnvironment,
            terrain: window.__m24OldTerrain, currentEnvironment: window.__ra2debug.environmentHd,
            currentTerrain: window.__ra2debug.terrainHd, options: window.__ra2debug.game.gameOpts,
            glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
        assert(report.crossTheater.environment.disposed && report.crossTheater.environment.worldChargeBytes === 0);
        assert(report.crossTheater.terrain.disposed && report.crossTheater.terrain.worldChargeBytes === 0);
        assert.equal(report.crossTheater.currentEnvironment.density, density);
        assert.equal(report.crossTheater.currentTerrain.density, nextOriginalTerrain ? 1 : density);
        if (nextOriginalTerrain) {
            assert.equal(report.crossTheater.currentTerrain.worldChargeBytes, 0);
            assert.equal(report.crossTheater.currentTerrain.placedBindings.length, 0);
            report.crossTheater.originalTerrainDisclosure = 'The target retains Original terrain; selected HD object families load independently.';
        }
        assert.equal(report.crossTheater.glError, 0);
        if (voxelOnly) {
            const excluded = await page.evaluate(() => ['JEEP', 'YCAB', 'BCAB', 'AMBU', 'FTRK', 'CIVP']
                .filter(name => name in (window.__ra2debug.sovietUnitsHd?.families ?? {})));
            assert.deepEqual(excluded, []);
            report.newNativeNeutralVehicles.lifecycle.nextTheaterExcluded = true;
        }
        if (voxelLifecycle) {
            report.neutralVoxelLifecycle.nextTheater = await page.evaluate(() => ({
                admitted: ['WINI', 'TRUCKB'].filter(name => name in (window.__ra2debug.sovietUnitsHd?.families ?? {})),
                oldFamilies: window.__m24OldNeutralHd.families.size,
                oldGpuBytes: window.__m24OldNeutralHd.report.gpuBytes }));
            assert.deepEqual(report.neutralVoxelLifecycle.nextTheater,
                { admitted: [], oldFamilies: 0, oldGpuBytes: 0 });
            report.neutralVoxelLifecycle.status = 'PASS_NATIVE_COMPLETE_NEUTRAL_VOXEL_RELEASE_ORIGINAL_REENTRY_AND_OTHER_THEATER_EXCLUSION';
        }
        await page.evaluate(() => window.__installAlliedFixtures());
    }
    assert.equal(report.errors.length, 0);
} catch (error) { failure = error; }
// Preserve the primary failure and completed observations even if teardown has
// already removed the WorldView expected by the shared session finalizer.
if (failure) {
    report.status = 'FAIL'; report.failure = failure.stack ?? String(failure);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
try { await close(failure); }
catch (error) {
    report.status = 'FAIL'; report.finalizationFailure = error.stack ?? String(error);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    throw failure ?? error;
}
if (failure) throw failure;
console.log(JSON.stringify({ output, families: report.newEncounteredFamilies.length,
    newNativeBindings: report.newNativeBindings.length, allocation: report.combinedWorldAllocation }));
