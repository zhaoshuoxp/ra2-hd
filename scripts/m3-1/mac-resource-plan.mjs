import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { validateProfile } from '../../desktop/profile.mjs';
import { registerHdResources, expectedHdAvailabilityKeys, sovietBatchRevisions,
    unitIdentities, powerPlantFamilyPaths } from '../../desktop/hd-profile.mjs';
import { registerCampaignTerrainResources } from '../../desktop/terrain-profile.mjs';
import { validateCampaignResources, registerCampaignEnvironmentResources } from '../../desktop/campaign-profile.mjs';
import { registerMusicResources } from '../../desktop/music-profile.mjs';
import { registerMovieResources } from '../../desktop/movie-profile.mjs';
import { registerHdMovieResources } from '../../desktop/hd-movie-profile.mjs';
import { registerCampaignEnvironmentAliases } from '../../desktop/campaign-environment-aliases.mjs';
import buildingCoverage from '../../desktop/soviet-building-coverage.json' with { type: 'json' };
import alliedCoverage from '../../desktop/allied-building-coverage.json' with { type: 'json' };
import yuriCoverage from '../../desktop/yuri-building-coverage.json' with { type: 'json' };
import yuriUnits from '../../desktop/yuri-unit-contracts.json' with { type: 'json' };
import preparedContract from '../../desktop/prepared-hd-contract.json' with { type: 'json' };
import terrainContract from '../../desktop/terrain-hd-contract.json' with { type: 'json' };
import terrainTheaters from '../../desktop/terrain-theater-hd-contracts.json' with { type: 'json' };
import urbanEnvironment from '../../desktop/environment-urban-hd-contract.json' with { type: 'json' };

export async function macResourcePlan(directory, campaignDirectory) {
    const events = [], previousUi = process.env.RA2_UI_RESOURCE_ROOT;
    let hd;
    process.env.RA2_UI_RESOURCE_ROOT = directory;
    try { hd = await registerHdResources(directory, event => events.push(event), { deferPageHashes: true }); }
    finally {
        if (previousUi === undefined) delete process.env.RA2_UI_RESOURCE_ROOT;
        else process.env.RA2_UI_RESOURCE_ROOT = previousUi;
    }
    const profile = await validateProfile(directory), campaign = await validateCampaignResources(campaignDirectory);
    assert(await registerMusicResources(profile, event => events.push(event)), 'Prepared original music is required in complete Mac deliveries');
    assert(await registerMusicResources(profile, event => events.push(event), 'yr'), 'Prepared original YR music is required in complete Mac deliveries');
    assert.equal(profile.selections.get('/local-assets/yr/manifest.json')?.files.length, 7);
    assert.deepEqual(Object.keys(hd.availability).sort(), expectedHdAvailabilityKeys());
    for (const [name, value] of Object.entries(hd.availability)) {
        if (name === 'sovietUnits') assert(value.startsWith('22 of 24') && value.includes('7 of 7 YR additions'));
        else assert.equal(value.startsWith('HD available'), !['unit-sqd', 'unit-yuripr'].includes(name), `${name}: ${value}`);
    }
    for (const registered of [hd, campaign, await registerCampaignTerrainResources(directory, event => events.push(event))]) {
        for (const [route, file] of registered.routes) profile.routes.set(route, file);
        for (const [route, selection] of registered.selections) profile.selections.set(route, selection);
    }
    await registerMovieResources(profile, event => events.push(event), campaignDirectory);
    await registerHdMovieResources(profile, event => events.push(event));
    // A packaging snapshot may restore pointers required by the frozen runtime.
    // Never write these overrides into the canonical source resource directory.
    const metadataOverrides = [];
    for (const [theater, contract] of [['TEMPERATE', terrainContract], ...Object.entries(terrainTheaters)]) {
        const name = theater === 'TEMPERATE' ? '' : '-' + theater.toLowerCase(), file = `terrain${name}-selection.json`;
        const current = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
        if (current.revision === contract.revision && current.sha256 === contract.sha256) continue;
        const prefix = `terrain-packs/${contract.revision}`, bytes = await fs.readFile(path.join(directory, prefix, 'manifest.json'));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), contract.sha256);
        const manifest = JSON.parse(bytes);
        assert.equal(manifest.schema, 'tmp-terrain-hd-v1'); assert.equal(manifest.theater, theater);
        assert.equal(manifest.revision, contract.revision);
        for (const group of manifest.groups) for (const variant of group.variants) {
            assert(/^[a-z0-9-]+\.rgba$/.test(variant.file) && [2, 4].includes(variant.density));
            const source = path.join(directory, prefix, variant.file);
            assert.equal(await fs.realpath(source), source);
            assert.equal((await fs.stat(source)).size, variant.size[0] * variant.size[1] * 4);
            profile.routes.set(`/local-terrain/${contract.revision}/${variant.file}`, source);
        }
        profile.selections.set(`/local-terrain${theater === 'TEMPERATE' ? '' : '/' + theater.toLowerCase()}/selection.json`, manifest);
        metadataOverrides.push({ file, value: contract, canonicalValue: current,
            reason: 'Restore the frozen runtime contract in the independent package only' });
    }
    await registerCampaignEnvironmentResources(profile, event => events.push(event));
    await registerCampaignEnvironmentAliases(profile, event => events.push(event));
    assert(events.some(event => event.type === 'campaign-environment-registered'));
    const files = new Set(), campaignFiles = new Set();
    for (const file of profile.hdMovieFiles ?? []) files.add(path.relative(directory, file));
    files.add('music/ra2/manifest.json');
    files.add('music/yr/manifest.json');
    for (const route of campaign.selections.keys()) {
        if (/^\/local-campaign\/(ra2|yr)\/[a-z0-9]+\/manifest\.json$/.test(route)) {
            campaignFiles.add(route.slice('/local-campaign/'.length));
        }
    }
    for (const file of profile.routes.values()) {
        const relative = path.relative(directory, file), campaignRelative = path.relative(campaignDirectory, file);
        if (campaignRelative && !campaignRelative.startsWith('..') && !path.isAbsolute(campaignRelative)) campaignFiles.add(campaignRelative);
        else {
            assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
            files.add(relative);
        }
    }
    const ui = profile.selections.get('/local-ui/selection.json');
    assert(ui?.revision && !ui.reviewOnly && ui.assets.length <= 512);
    files.add('ui-selection.json'); files.add(`ui-packs/${ui.revision}/manifest.json`);
    for (const [route, selected] of profile.selections) {
        const match = /^\/local-(terrain|environment)(?:\/(snow|urban|newurban|desert|lunar))?\/selection\.json$/.exec(route);
        if (!match) continue;
        const [, kind, theater] = match, pointerFile = `${kind}${theater ? '-' + theater : ''}-selection.json`;
        const pointer = metadataOverrides.find(override => override.file === pointerFile)?.value
            ?? JSON.parse(await fs.readFile(path.join(directory, pointerFile), 'utf8'));
        assert.equal(pointer.revision, selected.revision, `Preserve selected ${kind}/${theater ?? 'temperate'}`);
        files.add(pointerFile); files.add(`${kind}-packs/${pointer.revision}/manifest.json`);
    }
    const prepared = events.find(event => event.type === 'prepared-hd-registered');
    assert(prepared && prepared.index === preparedContract.sha256 && prepared.members > 0 && prepared.pages > 0);
    files.add(preparedContract.indexPath); files.add(`prepared-hd/proofs/${preparedContract.sha256}.json`);
    for (const file of ['ra2-core-manifest.json', 'yr-core-manifest.json', 'upstream-support/manifest.json',
        ...Object.values(powerPlantFamilyPaths), ...Object.entries(sovietBatchRevisions)
            .map(([name, revision]) => `hd-packs/soviet-${name}-authored/${revision}/family.json`)]) files.add(file);
    for (const entry of [...Object.values(buildingCoverage), ...Object.values(alliedCoverage), ...Object.values(yuriCoverage)]) {
        files.add(entry.familyPath);
        const family = JSON.parse(await fs.readFile(path.join(directory, entry.familyPath), 'utf8'));
        for (const binding of Object.values(family.turrets ?? {})) {
            files.add(binding.path + 'manifest.json');
            const manifest = JSON.parse(await fs.readFile(path.join(directory, binding.path, 'manifest.json'), 'utf8'));
            for (const frame of manifest.headings) for (const role of ['base', 'mask']) files.add(binding.path + frame[role]);
        }
    }
    for (const entry of [...Object.values(unitIdentities), ...Object.values(yuriUnits.shp)]) files.add(entry.familyPath);
    const layers = [...profile.selections].filter(([route]) => /^\/local-(terrain|environment)(?:\/\w+)?\/selection\.json$/.test(route))
        .sort(([left], [right]) => left.localeCompare(right));
    assert.equal(layers.length, 12);
    const urban = profile.selections.get('/local-terrain/urban/selection.json');
    assert.equal(urban.theater, 'URBAN');
    assert.equal(urban.revision, terrainTheaters.URBAN.revision);
    const memorial = profile.selections.get('/local-environment/urban/selection.json').families['campaign-sov01-memorial'];
    assert.equal(memorial.familyHash, urbanEnvironment.families['campaign-sov01-memorial'].familyHash);
    assert.deepEqual(memorial.members.map(member => member.member).sort(),
        [...urbanEnvironment.families['campaign-sov01-memorial'].members].sort());
    return { files: [...files].sort(), campaignFiles: [...campaignFiles].sort(), availability: hd.availability,
        routeCount: profile.routes.size, selectionCount: profile.selections.size, uiRevision: ui.revision,
        prepared, urbanRevision: urban.revision, layers: layers.map(([route, selection]) => ({ route, revision: selection.revision })),
        campaignExtension: profile.selections.get('/local-environment/urban/selection.json').campaignExtension,
        metadataOverrides, events };
}

if (process.argv[1] === import.meta.filename) {
    const output = path.resolve(process.argv[2]);
    const plan = await macResourcePlan(path.resolve('../ra2-hd/.local'), path.resolve('.local/campaign'));
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ files: plan.files.length, campaignFiles: plan.campaignFiles.length,
        routes: plan.routeCount, layers: plan.layers.length, prepared: plan.prepared, urban: plan.urbanRevision }));
}
