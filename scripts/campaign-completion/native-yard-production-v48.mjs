import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [output, edition = 'ra2', requested = '4'] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requested);
assert(['ra2', 'yr'].includes(edition)); assert([2, 4].includes(density));
const report = { status: 'RUNNING', edition, density, errors: [], failedResources: [], commands: [], samples: [],
    scope: edition === 'ra2'
        ? 'Original Soviet04 source world, ordinary paid submarine production and accelerated unmodified turns. Presentation camera only; no actor, health, objective, rules, trigger or RNG override.'
        : 'YR skirmish regression with disclosed legal power/refinery/shipyard fixtures and disabled bot updates from the existing fixture helper, followed by ordinary paid submarine production. Not a natural-match or campaign completion claim.' };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
    if (edition === 'ra2') {
        await fs.mkdir(out, { recursive: false });
        ({ app, page, labels } = await campaignSession(out, report, { density }));
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov04s.map'));
        await waitWorld(page, 'sov04s.map');
    } else {
        const receipt = out + '-runtime.json';
        await fs.writeFile(receipt, JSON.stringify({ build: path.resolve('desktop/main.mjs'), resources: path.resolve('.local') }));
        ({ app, page } = await startSession(receipt, out, edition, false,
            async ({ page }) => page.evaluate(density => {
                const graphics = window.__ra2debug.generalOptions.graphics;
                graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
            }, density),
            async ({ page }) => {
                const index = await page.evaluate(() => window.__ra2debug.skirmishLobby.formModel.availablePlayerCountries.indexOf('Russians'));
                assert(index >= 0);
                await page.locator('.country-select .select-value').first().click();
                await page.locator('.country-select .select-layer .option').nth(index).click();
            }));
        page.on('pageerror', error => report.errors.push(error.stack));
        page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.url(), response.status()]); });
        report.fixtures = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.gameScreen.gameTurnMgr.setPaused(true);
            const actors = ['NAPOWR', 'NAREFN', 'NAYARD'].map(name => f.building(name));
            return actors.map(actor => ({ name: actor.name, id: actor.id, tile: [actor.tile.rx, actor.tile.ry] }));
        });
    }
    report.before = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const yard = g.localPlayer.getOwnedObjects().find(o => o.name === 'NAYARD' && o.isSpawned);
        if (!yard) throw Error('Player shipyard absent');
        window.__productionYard = yard;
        d.worldInteraction.minimapHandler.panToTile(yard.tile); d.gameScreen.pointer.unlock(true);
        const trainer = d.trainer.session;
        return { tick: g.currentTick, credits: g.localPlayer.credits, mission: g.campaign?.launch,
            subs: g.localPlayer.getOwnedObjects().filter(o => o.name === 'SUB').map(o => o.id),
            trainerFresh: !!trainer && !trainer.pending && !trainer.enabledEffects.size && !trainer.protectedObjects.size,
            tile: [yard.tile.rx, yard.tile.ry] };
    });
    assert.equal(report.before.trainerFresh, true);
    await page.waitForFunction(() => window.__ra2debug.renderableManager.getRenderableByGameObject(window.__productionYard)
        ?.mainObj?.builder?.getHdPage?.(), undefined, { timeout: 60000 });
    report.binding = await page.evaluate(() => {
        const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__productionYard);
        const sample = model => {
            const b = model.builder, hd = b.getHdPage(), frame = b.getFrame();
            const rectangle = b.hdOverride.frames[frame + b.frameOffset].sampleRect;
            const logical = b.getSpriteGeometryOptions(frame).logicalSize;
            return { hd: hd.base === model.getShapeMesh().material.map,
                actualDensity: [rectangle.width / logical.width, rectangle.height / logical.height],
                depth: b.hdDepthOffset ?? b.depthOffset };
        };
        const set = r.setAnimation;
        window.__yardAnimationEvents = [];
        r.setAnimation = function (type, time) {
            window.__yardAnimationEvents.push({ tick: d.game.currentTick, type, time });
            return set.call(this, type, time);
        };
        window.__sampleProductionYard = () => ({ tick: d.game.currentTick, animation: r.currentAnimType,
            spawned: d.game.localPlayer.getOwnedObjects().filter(o => o.name === 'SUB' && !o.isDestroyed).map(o => o.id),
            parts: [...r.animObjects].flatMap(([type, models]) => models.map((model, index) => ({
                name: r.animArtProps.getByType(type)[index].name, visible: model.get3DObject().visible,
                frame: model.builder.getFrame(), ...sample(model) }))),
            credits: d.game.localPlayer.credits, failure: d.game.campaign?.failure });
        return { body: sample(r.mainObj), crane: sample(r.animObjects.get(0)[0]) };
    });
    for (const part of Object.values(report.binding)) { assert(part.hd); assert.deepEqual(part.actualDensity, [density, density]); }
    const commands = edition === 'ra2' ? new OrdinaryCampaignCommands(page, report) : undefined;
    if (commands) await commands.queue('SUB', 1);
    else await page.evaluate(() => {
        const d = window.__ra2debug, production = d.localPlayer.production, rules = d.game.rules.getObject('SUB', 7);
        if (!production.isAvailableForProduction(rules)) throw Error('Submarine production unavailable in the legal fixture');
        d.actionsApi.queueForProduction(production.getQueueForObject(rules).type, 7, 'SUB', 1);
    });
    let completedAt;
    for (let i = 0; i < 1800; i++) {
        // Observe every turn through delivery. Advancing thirty turns between
        // renders can miss the short native Delivering factory state entirely.
        const turns = completedAt === undefined ? 1 : 30;
        if (commands) await commands.step(turns, { defend: false, repair: false });
        else await page.evaluate(turns => {
            const d = window.__ra2debug, manager = d.gameScreen.gameTurnMgr;
            manager.setPaused(false);
            try { for (let i = 0; i < turns; i++) manager.doGameTurn(performance.now()); }
            finally { manager.setPaused(true); }
        }, turns);
        await page.waitForTimeout(completedAt === undefined ? 35 : 100);
        const sample = await page.evaluate(() => window.__sampleProductionYard()); report.samples.push(sample);
        assert(!sample.failure, sample.failure);
        if (sample.spawned.some(id => !report.before.subs.includes(id))) completedAt ??= i;
        if (i === 0 || sample.animation === 1 && !report.productionImage) {
            const file = sample.animation === 1 ? 'ordinary-production.png' : 'ordinary-idle.png';
            await page.screenshot({ path: path.join(out, file) });
            if (sample.animation === 1) report.productionImage = file;
        }
        if (completedAt !== undefined && i > completedAt + 45 && sample.animation === 0) break;
        if (i % 100 === 0) await save();
    }
    report.animationEvents = await page.evaluate(() => window.__yardAnimationEvents);
    report.after = await page.evaluate(() => window.__sampleProductionYard());
    assert(completedAt !== undefined, 'Ordinary paid production must create a new submarine');
    assert(Math.min(...report.samples.map(sample => sample.credits)) < report.before.credits); assert(report.productionImage);
    assert(report.animationEvents.some(event => event.type === 1)); assert.equal(report.after.animation, 0);
    const visibleCranes = report.samples.flatMap(sample => sample.parts.filter(part => part.visible && /^NAYARD_(A|D|S[123])$/.test(part.name)));
    assert(visibleCranes.some(part => part.name === 'NAYARD_D'));
    assert(visibleCranes.every(part => part.hd && part.depth >= 4));
    for (const part of visibleCranes) assert.deepEqual(part.actualDensity, [density, density]);
    if (edition === 'ra2') {
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-ready=true]');
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_PAID_SUBMARINE_PRODUCTION_HD_BOTH_AXIS_DENSITY_CRANE_ORDER_AND_IDLE_RETURN';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
