import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState, stepWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3], difficulty = process.argv[4];
assert(['easy', 'normal', 'hard'].includes(difficulty));
const requirements = JSON.parse(await fs.readFile(path.resolve('../project-history/yr-campaign-implementation-20261104/Requirements45', mission.replace('.map', '.json'))));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, difficulty, errors: [], failedResources: [], skippedMedia: [],
    scope: 'Fresh original source initialization at the selected difficulty. Native house handicaps, source money and difficulty filters are compared with the pinned source requirements. Player Skip controls shorten media for this parameter inspection; complete media playback and difficulty-specific mission stages require their own evidence.' };
let app, page, skipper, skipping = false;
try {
    ({ app, page } = await campaignSession(out, report, { edition: 'yr', density: 0 }));
    skipper = setInterval(async () => {
        if (skipping) return;
        skipping = true;
        try {
            const holder = page.locator('[data-campaign-media]');
            if (await holder.count()) {
                const ready = await holder.locator('video').evaluate(video => video.readyState >= 2).catch(() => false);
                if (ready) {
                    const name = await holder.getAttribute('data-campaign-media');
                    await holder.locator('button').click({ timeout: 1500 });
                    report.skippedMedia.push({ name, control: 'Normal player Skip button after a decoded frame is ready' });
                }
            }
        } catch { /* A media holder may finish while the next normal frame is inspected. */ }
        finally { skipping = false; }
    }, 200);
    await page.evaluate(({ mission, difficulty }) => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        screen.difficulty = difficulty;
        return screen.launchPrepared(mission);
    }, { mission, difficulty });
    await waitWorld(page, mission);
    report.initial = await worldState(page);
    report.parameters = await page.evaluate(() => {
        const g = window.__ra2debug.game, c = g.campaign, definition = c.definition;
        return { launch: c.launch, tick: g.currentTick, houses: [...c.houses].map(([name, owner]) => ({
            name, controlled: definition.houses.get(name).playerControl, credits: owner.credits,
            handicap: owner.handicap, aiDifficulty: owner.aiDifficulty, techLevel: owner.campaignTechLevel,
            originalActors: owner.getOwnedObjects(true).filter(unit => !unit.isDestroyed && unit.isTechno())
                .map(unit => ({ id: unit.id, name: unit.name, type: unit.type, health: unit.healthTrait.health,
                    tile: unit.tile && [unit.tile.rx, unit.tile.ry], veteranLevel: unit.veteranLevel })) })),
            filteredTriggers: [...definition.triggers.values()].filter(trigger =>
                new Set(Object.values(trigger.difficulties)).size > 1).map(trigger => ({ id: trigger.id, difficulties: trigger.difficulties })),
            aiTriggers: [...definition.aiTriggers.values()].map(trigger => ({ id: trigger.id, difficulties: trigger.difficulties })) };
    });
    const actual = report.parameters, expected = requirements.difficulties[difficulty];
    assert.equal(actual.launch.edition, 'yr'); assert.equal(actual.launch.mission, mission);
    assert.equal(actual.launch.difficulty, difficulty); assert.equal(actual.launch.semanticsVersion, 45);
    assert.equal(actual.launch.sourceSha256, requirements.sourceSha256);
    for (const house of actual.houses) {
        assert.deepEqual(house.handicap, house.controlled ? expected.human : expected.ai);
        const source = requirements.houses.find(row => row.id === house.name);
        assert(source, 'A native house must have its original source identity');
        assert.equal(house.techLevel, source.techLevel);
        assert.equal(house.credits, house.controlled ? expected.startingCredits[house.name] : source.credits);
    }
    assert.deepEqual(actual.filteredTriggers.filter(trigger => trigger.difficulties[difficulty]).map(trigger => trigger.id),
        expected.admittedFilteredTriggers);
    assert.deepEqual(actual.aiTriggers.filter(trigger => trigger.difficulties[difficulty]).map(trigger => trigger.id),
        expected.admittedAiTriggers);
    report.progress = await stepWorld(page, 15);
    report.after = await worldState(page);
    report.initialTriggerTrace = await page.evaluate(() => window.__ra2debug.game.campaign.trace);
    const filtered = new Map(actual.filteredTriggers.map(trigger => [trigger.id, trigger]));
    assert(!report.initialTriggerTrace.some(event => filtered.has(event.key)
        && !filtered.get(event.key).difficulties[difficulty]), 'Ineligible source difficulty triggers must not fire');
    assert(!report.progress.failure, report.progress.failure); assert.notEqual(report.progress.result, 'defeat');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_FRESH_ORIGINAL_DIFFICULTY_HANDICAPS_CREDITS_FILTERS_AND_INITIAL_SOURCE_TURNS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    clearInterval(skipper);
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, mission, difficulty, error: report.error, out }));
