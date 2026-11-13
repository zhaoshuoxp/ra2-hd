import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], samples: [], commands: [],
    scope: 'Intentional original Soviet 08 player-force failure: ordinary movement sends the original full-health initial force into the original opposing defenses. No resign, assigned result, source/rule/trigger/health/ownership or RNG edit. This is a failure test, not a story victory.' };
let app, page, labels;
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => { const original = console.error;
        window.__campaignGeometryAudit = [];
        console.error = function (...args) {
            if (String(args[0]).includes('Computed radius is NaN')) {
                const geometry = args.find(value => value?.attributes?.position), positions = geometry?.attributes.position.array;
                const objects = [], invalidSources = [];
                window.__ra2debug.worldScene.scene.traverse(object => {
                    if (object.geometry === geometry) objects.push({ name: object.name, parent: object.parent?.name,
                        grandparent: object.parent?.parent?.name, material: object.material?.type });
                    if (object.isBatchedMesh && (object.matrixWorld.elements.some(value => !Number.isFinite(value))
                        || Array.from(object.geometry.attributes.position.array).some(value => !Number.isFinite(value)))) {
                        const parents = []; for (let parent = object; parent; parent = parent.parent) parents.push(parent.name);
                        const owners = [];
                        for (const [unit, renderable] of window.__ra2debug.renderableManager.renderablesByGameObject) {
                            let found = false; renderable.get3DObject()?.traverse(child => { if (child === object) found = true; });
                            if (found) owners.push({ id: unit.id, name: unit.name, position: unit.position.worldPosition,
                                animation: renderable.anim?.name, frame: renderable.mainRenderable?.builder?.frameNo });
                        }
                        invalidSources.push({ parents, owners, matrix: object.matrixWorld.toArray(),
                            positions: Array.from(object.geometry.attributes.position.array).slice(0, 24) });
                    }
                });
                window.__campaignGeometryAudit.push({ tick: window.__ra2debug.game?.currentTick,
                    stack: new Error('Native non-finite geometry').stack,
                    objects, invalidSources, positionCount: positions?.length, positions: positions && Array.from(positions).slice(0, 36) });
            }
            return original.apply(this, args);
        };
    });
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov08u.map'));
    await waitWorld(page, 'sov08u.map');
    await page.evaluate(() => {
        const d = window.__ra2debug, manager = d.renderableManager, original = manager.createTransientAnim;
        window.__campaignExplosionAudit = [];
        window.__campaignBallisticAudit = [];
        const createProjectile = d.game.createProjectile;
        d.game.createProjectile = function (...args) {
            const projectile = createProjectile.apply(this, args), update = projectile.update;
            if (projectile.rules.arcing) projectile.update = function (game) {
                const before = { position: this.position.worldPosition.clone(), aim: this.aimPoint?.clone(),
                    initial: this.initialSelfPosition?.clone(), speed: this.maxSpeed, weapon: this.fromWeapon.rules.name };
                const result = update.call(this, game);
                if (!Number.isFinite(this.position.worldPosition.y)) window.__campaignBallisticAudit.push({
                    tick: game.currentTick, before, after: this.position.worldPosition.clone() });
                return result;
            };
            return projectile;
        };
        d.game.events.subscribe(event => {
            if (event.target?.name === 'APOC' && event.target.isDestroyed) {
                const object = event.target, renderable = manager.getRenderableByGameObject(object);
                window.__campaignExplosionAudit.push({ tick: d.game.currentTick, kind: 'destroyed', id: object.id,
                    position: object.position.worldPosition.clone(), rendered: renderable?.withPosition.getPosition().clone(),
                    velocity: object.moveTrait.velocity.clone() });
            }
        });
        manager.createTransientAnim = function (...args) {
            const result = original.apply(this, args);
            if (args[0] === 'APOCEXP') window.__campaignExplosionAudit.push({ tick: d.game.currentTick,
                kind: 'explosion', position: result.getPosition().clone() });
            return result;
        };
    });
    const commands = new OrdinaryCampaignCommands(page, report);
    report.identity = await page.evaluate(() => { const g = window.__ra2debug.game;
        return { gameId: g.id, timestamp: g.startTimestamp, launch: g.campaign.launch, options: g.gameOpts }; });
    report.samples.push(await commands.inspect('original-full-health-force'));
    await commands.order(['APOC', 'HTNK', 'SMCV', 'E2', 'DESO'], 0, undefined, [100, 25]);
    let state;
    for (let i = 0; i < 140; i++) {
        await stepWorld(page, 120); state = await commands.inspect('original-defenses-' + i);
        report.samples.push(state); if (state.result) break;
    }
    assert.equal(state.result, 'defeat');
    report.final = state;
    report.geometryAudit = await page.evaluate(() => window.__campaignGeometryAudit);
    report.explosionAudit = await page.evaluate(() => window.__campaignExplosionAudit);
    report.ballisticAudit = await page.evaluate(() => window.__campaignBallisticAudit);
    report.failure = await page.evaluate(() => { const c = window.__ra2debug.game.campaign;
        return { state: c.machine.states.get('0C2152A0'), actions: c.trace.filter(action => action.opcode === 2),
            goalFired: ['0965C050', '08012920', '0C214B00'].map(id => c.machine.states.get(id).fired) };
    });
    assert(report.failure.state.fired > 0 && report.failure.actions.some(action => action.key === '0C2152A0'));
    assert(report.failure.goalFired.every(fired => fired === 0));
    await fs.writeFile(path.join(out, 'applied-command-journal.json'), JSON.stringify(await page.evaluate(() => window.__ra2debug.game.campaign.journal.commands)));
    await page.evaluate(() => { const m = window.__ra2debug.gameScreen.gameTurnMgr; m.setCampaignPaused(false); m.doGameTurn(performance.now()); });
    await page.waitForSelector('[data-campaign-result=defeat][data-score-phase=complete]', { timeout: 120000 });
    await page.screenshot({ path: path.join(out, 'native-original-soviet08-source-failure.png') });
    report.score = await page.locator('body').innerText();
    await page.getByRole('button', { name: labels['hd:campaignretrymission'], exact: true }).click();
    if (process.argv.includes('--unavailable')) {
        await page.waitForSelector('[data-campaign-missions][data-campaign-ready=true]');
        assert.equal(await page.locator('[data-campaign-mission="sov08u.map"]').getAttribute('data-playable'), 'false');
        report.retry = { unavailableReturn: true };
    } else {
        await page.waitForSelector('[data-campaign-media=s08_f00e] video');
        await page.locator('[data-campaign-media=s08_f00e] button').click();
        await waitWorld(page, 'sov08u.map', report.identity.gameId);
        report.retry = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
            id: window.__ra2debug.game.id, commands: window.__ra2debug.game.campaign.journal.commands.length,
            launch: window.__ra2debug.game.campaign.launch, result: window.__ra2debug.game.campaign.result }));
        assert(report.retry.tick < 20 && !report.retry.result); assert.equal(report.retry.launch.difficulty, 'normal');
        assert.equal(report.retry.commands, 0); assert.notEqual(report.retry.id, report.identity.gameId);
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_SOVIET08_PLAYER_FORCE_FAILURE_AND_RETURN';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
