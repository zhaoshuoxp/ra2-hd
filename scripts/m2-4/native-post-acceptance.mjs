import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [target, output] = process.argv.slice(2);
const root = path.resolve(output);
await fs.mkdir(root, { recursive: false });
const report = { status: 'RUNNING', cases: [], disclosure: 'Actual Mac Electron keyboard and pointer events, not direct order API calls. Legal actors and clock phases are controlled fixtures. Original map/rules are unchanged. Physical hardware input and Windows are not executed.' };
const save = () => fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n');

async function hover(page, { id, tile }) {
    const point = await page.evaluate(({ id, tile }) => {
        const d = window.__ra2debug, f = window.__allied;
        const actor = id ? d.game.getWorld().getAllObjects().find(o => o.id === id) : f.tank;
        const r = d.renderableManager.getRenderableByGameObject(actor), p = r.getPosition().clone();
        if (tile) p.set((tile[0] + 0.5) * 256, tile[2] * 128 * Math.sqrt(2 / 3), (tile[1] + 0.5) * 256);
        p.project(d.worldScene.camera);
        const v = d.worldScene.viewport, canvas = d.renderer.getCanvas(), rect = canvas.getBoundingClientRect();
        return { x: rect.x + (v.x + (p.x + 1) * v.width / 2) * rect.width / d.renderer.width,
            y: rect.y + (v.y + (1 - p.y) * v.height / 2) * rect.height / d.renderer.height };
    }, { id, tile });
    for (const dy of id ? [-12, 0, 15, 35, 55] : [0]) {
        await page.mouse.move(point.x, point.y + dy);
        await page.waitForTimeout(100);
        const found = await page.evaluate(({ id, tile }) => {
            const h = window.__ra2debug.worldInteraction.getCurrentHover();
            return id ? h?.gameObject?.id === id : h?.tile?.rx === tile[0] && h?.tile?.ry === tile[1];
        }, { id, tile });
        if (found) return { x: point.x, y: point.y + dy };
    }
    throw Error('Actual pointer did not hover requested native target: ' + JSON.stringify({ id, tile, point }));
}

for (const [edition, density] of [['ra2', 2], ['yr', 4]]) {
    const selectedEdition = process.argv.find(arg => arg.startsWith('--edition='))?.slice(10);
    if (selectedEdition && edition !== selectedEdition) continue;
    process.argv = process.argv.filter(arg => arg !== '--4k');
    if (density === 4) process.argv.push('--4k');
    const row = { edition, density, status: 'RUNNING' };
    report.cases.push(row); await save();
    const s = await startSession(target, path.join(root, `${edition}-${density}x`), edition, false, async ({ page }) => {
        await page.evaluate(density => {
            const g = window.__ra2debug.generalOptions.graphics;
            g.hdEnabled.value = true; g.hdDensity.value = density;
        }, density);
    });
    const { page, out } = s;
    try {
        row.fixture = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, g = d.game;
            f.tank = f.spawn('MTNK', 7); f.actor = f.tank;
            const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType && t.z === f.tank.tile.z
                && Math.hypot(t.rx - f.tank.tile.rx, t.ry - f.tank.tile.ry) >= 6
                && Math.hypot(t.rx - f.tank.tile.rx, t.ry - f.tank.tile.ry) <= 8
                && g.map.terrain.getPassableSpeed(t, f.tank.rules.speedType, false, false) > 0
                && !g.map.getObjectsOnTile(t).length).sort((a, b) => a.rx - b.rx)[0];
            if (!tile) throw Error('No nearby clear attack-move destination');
            f.destination = tile; f.orders = [];
            d.worldInteraction.defaultActionHandler.onOrder.subscribe(order => f.orders.push({ type: order.orderType,
                tile: [order.target.tile.rx, order.target.tile.ry], object: order.target.obj?.id,
                selection: d.worldInteraction.unitSelectionHandler.getSelectedUnits().map(o => o.id), tick: g.currentTick }));
            d.worldInteraction.unitSelectionHandler.selectSingleUnit(f.tank);
            return { tank: f.tank.id, start: [f.tank.tile.rx, f.tank.tile.ry], destination: [tile.rx, tile.ry, tile.z],
                aCommand: d.worldInteraction.keyboardHandler.keyBinds.getCommandType({ keyCode: 65 }), tick: g.currentTick };
        });
        assert.equal(row.fixture.aCommand, 'AttackMove');
        await hover(page, { tile: row.fixture.destination });
        await page.keyboard.press('a');
        row.armed = await page.evaluate(() => ({ active: !!window.__ra2debug.worldInteraction.currentMode,
            cursor: window.__ra2debug.worldInteraction.pointer.pointerType,
            selected: window.__ra2debug.worldInteraction.unitSelectionHandler.getSelectedUnits().map(o => o.id) }));
        assert(row.armed.active); assert.deepEqual(row.armed.selected, [row.fixture.tank]);
        await page.mouse.click((await hover(page, { tile: row.fixture.destination })).x,
            (await hover(page, { tile: row.fixture.destination })).y);
        await page.waitForFunction(() => window.__allied.orders.some(o => o.type === 4), undefined, { timeout: 3000 });
        await page.waitForFunction(start => {
            const u = window.__allied.tank;
            return u.tile.rx !== start[0] || u.tile.ry !== start[1];
        }, row.fixture.start, { timeout: 12000 });
        row.movement = await page.evaluate(() => ({ orders: window.__allied.orders,
            native: window.__allied.sample(window.__allied.tank),
            attackMoveTask: window.__allied.tank.unitOrderTrait.getTasks().some(t => t.isAttackMove),
            active: !!window.__ra2debug.worldInteraction.currentMode }));
        assert.equal(row.movement.orders.at(-1).type, 4); assert(row.movement.attackMoveTask); assert(!row.movement.active);
        if (process.argv.includes('--along-path')) {
            row.alongPath = await page.evaluate(() => {
                const f = window.__allied;
                f.pathEnemy = f.spawn('E1', 3, f.destination, f.enemy);
                return { id: f.pathEnemy.id, health: f.pathEnemy.healthTrait.health, moving: f.tank.isMoving,
                    attackMoveTask: f.tank.unitOrderTrait.getTasks().some(t => t.isAttackMove),
                    lastOrder: f.orders.at(-1), startTick: window.__ra2debug.game.currentTick };
            });
            assert(row.alongPath.moving && row.alongPath.attackMoveTask, 'The new enemy must appear during the active movement task');
            await page.waitForFunction(health => window.__allied.pathEnemy.isDestroyed || window.__allied.pathEnemy.healthTrait.health < health,
                row.alongPath.health, { timeout: 15000 });
            row.alongPath.result = await page.evaluate(() => ({ health: window.__allied.pathEnemy.healthTrait.health,
                destroyed: window.__allied.pathEnemy.isDestroyed, lastOrder: window.__allied.orders.at(-1),
                tick: window.__ra2debug.game.currentTick }));
            assert.equal(row.alongPath.result.lastOrder.type, 4);
            assert.equal(row.alongPath.result.lastOrder.object, undefined);
            if (process.argv.includes('--along-path-only')) {
                row.status = 'PASS_NATIVE_MOVING_ATTACK_MOVE_ENEMY_ACQUISITION'; await save();
                console.log(`${edition}/${density}X: PASS native enemy acquisition during attack movement`);
                continue;
            }
        }
        await page.screenshot({ path: path.join(out, 'a-ground-movement.png') });
        await page.keyboard.press('s');
        row.enemy = await page.evaluate(() => {
            const f = window.__allied;
            f.victim = f.spawn('E1', 3, f.tank.tile, f.enemy);
            return { id: f.victim.id, health: f.victim.healthTrait.health };
        });
        await page.keyboard.press('a');
        const enemyPoint = await hover(page, { id: row.enemy.id });
        await page.mouse.click(enemyPoint.x, enemyPoint.y);
        await page.waitForFunction(id => window.__allied.orders.some(o => o.type === 4 && o.object === id), row.enemy.id);
        await page.waitForFunction(health => window.__allied.victim.isDestroyed || window.__allied.victim.healthTrait.health < health,
            row.enemy.health, { timeout: 15000 });
        row.enemyResult = await page.evaluate(() => ({ orders: window.__allied.orders, destroyed: window.__allied.victim.isDestroyed,
            health: window.__allied.victim.healthTrait.health, tick: window.__ra2debug.game.currentTick }));
        await page.screenshot({ path: path.join(out, 'a-enemy-damage.png') });
        row.building = await page.evaluate(() => {
            const f = window.__allied;
            f.victimBuilding = f.building('CAFARM01', f.tank.tile, f.enemy);
            return { id: f.victimBuilding.id, health: f.victimBuilding.healthTrait.health };
        });
        await page.keyboard.press('s'); await page.keyboard.press('a');
        const buildingPoint = await hover(page, { id: row.building.id });
        await page.mouse.click(buildingPoint.x, buildingPoint.y);
        await page.waitForFunction(id => window.__allied.orders.some(o => o.type === 4 && o.object === id), row.building.id);
        await page.waitForFunction(health => window.__allied.victimBuilding.healthTrait.health < health, row.building.health, { timeout: 15000 });
        row.buildingResult = await page.evaluate(() => ({ health: window.__allied.victimBuilding.healthTrait.health,
            orders: window.__allied.orders, tick: window.__ra2debug.game.currentTick }));
        await page.screenshot({ path: path.join(out, 'a-building-damage.png') });
        await page.keyboard.press('s');
        await page.keyboard.press('a'); await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => !!window.__ra2debug.worldInteraction.currentMode), false);
        await page.keyboard.press('a'); await page.mouse.click(enemyPoint.x, enemyPoint.y, { button: 'right' });
        assert.equal(await page.evaluate(() => !!window.__ra2debug.worldInteraction.currentMode), false);
        await page.evaluate(() => window.__ra2debug.worldInteraction.unitSelectionHandler.selectSingleUnit(window.__allied.tank));
        const forceTile = await page.evaluate(() => {
            const d = window.__ra2debug, u = window.__allied.tank;
            const t = d.game.map.tiles.getAll().find(t => d.game.map.isWithinBounds(t) && t.z === u.tile.z
                && Math.hypot(t.rx - u.tile.rx, t.ry - u.tile.ry) >= 2
                && Math.hypot(t.rx - u.tile.rx, t.ry - u.tile.ry) <= 3 && !d.game.map.getObjectsOnTile(t).length);
            return [t.rx, t.ry, t.z];
        });
        const groundPoint = await hover(page, { tile: forceTile });
        await page.keyboard.down('Control'); await page.mouse.click(groundPoint.x, groundPoint.y); await page.keyboard.up('Control');
        await page.waitForFunction(() => window.__allied.orders.some(o => o.type === 3), undefined, { timeout: 4000 });
        await page.waitForFunction(() => window.__allied.tank.unitOrderTrait.getTasks().some(t => t.options?.force), undefined, { timeout: 4000 });
        row.forceAttack = await page.evaluate(() => ({ orders: window.__allied.orders, tasks: window.__allied.tank.unitOrderTrait.getTasks()
            .map(t => ({ force: t.options?.force, target: t.target?.tile && [t.target.tile.rx, t.target.tile.ry] })) }));
        await page.keyboard.press('s');
        row.sidebar = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            for (const name of ['GACNST', ...Array(6).fill('GAPOWR'), 'GACSPH', 'GAWEAT', 'CAAIRP']) f.building(name);
            d.gameScreen.hud.sidebarModel.activeTabId = 1;
            return { weapons: d.localPlayer.superWeaponsTrait.getAll().map(sw => sw.name) };
        });
        await page.waitForFunction(() => window.__ra2debug.gameScreen.hud.sidebarCard.publishedItems.length >= 3);
        await page.waitForTimeout(700);
        row.clocks = [];
        for (const phase of [0.15, 0.35, 0.6, 0.85]) {
            await page.evaluate(phase => {
                const d = window.__ra2debug, weapons = d.localPlayer.superWeaponsTrait.getAll();
                weapons.forEach((sw, i) => { sw.chargeTicks = i === 1 ? 0 : Math.round(sw.rechargeTicks * (1 - phase)); sw.status = i === 1 ? 2 : 0; });
                d.gameScreen.hud.sidebarModel.updateSuperWeapons();
            }, phase);
            await page.waitForTimeout(160);
            const state = await page.evaluate(() => {
                const d = window.__ra2debug, card = d.gameScreen.hud.sidebarCard;
                return { ui: d.uiArt.metrics(), slots: card.publishedItems.slice(0, 3).map((item, i) => {
                    const b = card.progressOverlays[i].builder, label = card.labelObjects[i];
                    return { name: item.target.rules.name, status: item.status, frame: b.getFrame(), hd: b.isHdActive,
                        opacity: b.overlay?.material.opacity, color: b.overlay?.material.color.getHex(), depthWrite: b.overlay?.material.depthWrite,
                        label: label.value, outline: label.props.outlineColor, outlineWidth: label.props.outlineWidth,
                        glyphRaster: [label.texture.image.width, label.texture.image.height] };
                }) };
            });
            assert(state.ui.reservedBytes <= state.ui.budget);
            for (const item of state.slots.filter(item => item.frame > 0)) {
                assert.equal(item.opacity, 0.5); assert.equal(item.color, 0); assert.equal(item.depthWrite, false);
            }
            for (const item of state.slots.filter(item => item.status === 4)) { assert(item.outlineWidth >= 1); assert(item.label); }
            row.clocks.push({ phase, ...state });
            const clip = await page.evaluate(() => {
                const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard, o = c.getUiObject().get3DObject();
                const p = o.getWorldPosition(o.position.clone()), rect = d.renderer.getCanvas().getBoundingClientRect();
                return { x: rect.x + p.x * rect.width / d.renderer.width, y: rect.y + p.y * rect.height / d.renderer.height,
                    width: (c.props.slotSize.width * 2 + 3) * rect.width / d.renderer.width,
                    height: (c.props.slotSize.height + 2) * 2 * rect.height / d.renderer.height };
            });
            await page.screenshot({ path: path.join(out, `clock-${phase}.png`), clip });
        }
        await page.evaluate(victory => {
            const d = window.__ra2debug, g = d.game;
            window.__oldWorld = { terrain: d.terrainHd, environment: d.environmentHd };
            const losers = victory ? g.getCombatants().filter(p => p !== d.localPlayer) : [d.localPlayer];
            for (const p of losers) for (const o of [...p.getOwnedObjects()]) g.destroyObject(o, undefined, true);
        }, edition === 'yr');
        await page.waitForSelector('[data-game-result-banner]', { timeout: 15000 });
        const captureResult = async label => {
            await page.waitForFunction(() => document.querySelector('[data-game-result-banner] canvas')?.dataset.resultState === 'ready');
            const data = await page.evaluate(() => {
                const b = document.querySelector('[data-game-result-banner]'), c = b.querySelector('canvas');
                return { data: { ...c.dataset }, hidden: c.hidden, size: [c.width, c.height], text: b.textContent,
                    ui: window.__ra2debug.uiArt.metrics() };
            });
            assert(!data.hidden); assert(data.ui.reservedBytes <= data.ui.budget);
            await page.locator('[data-game-result-banner] > div').screenshot({ path: path.join(out, label + '.png') }); return data;
        };
        row.result = await captureResult('result-hd');
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
        row.originalResult = await captureResult('result-original');
        assert.equal(row.originalResult.size[0], 872);
        await page.evaluate(() => {
            const d = window.__ra2debug, art = d.uiArt;
            window.__resultFiller = {};
            art.reserveSurface(window.__resultFiller, art.metrics().budget - art.metrics().reservedBytes - 200000, 0);
            d.generalOptions.graphics.hdEnabled.value = true;
            art.changed();
        });
        row.busyResult = await captureResult('result-busy-budget');
        assert.equal(row.busyResult.size[0], 872);
        await page.evaluate(() => { window.__ra2debug.uiArt.releaseSurface(window.__resultFiller); window.__ra2debug.uiArt.changed(); });
        row.restoredResult = await captureResult('result-restored');
        await page.waitForSelector('.score-scene', { timeout: 18000 });
        row.release = await page.evaluate(() => ({ resultCanvases: document.querySelectorAll('[data-game-result-banner]').length,
            ui: window.__ra2debug.uiArt.metrics(), terrainDisposed: window.__oldWorld.terrain.disposed,
            environmentDisposed: window.__oldWorld.environment.disposed,
            resultReservations: [...window.__ra2debug.uiArt.surfaces.keys()].filter(o => o.dataset?.uiArt === 'localized-result-banner').length }));
        assert.equal(row.release.resultCanvases, 0); assert(row.release.terrainDisposed && row.release.environmentDisposed);
        assert.equal(row.release.resultReservations, 0);
        row.status = 'PASS'; await save();
        console.log(`${edition}/${density}X: PASS A-key movement and target damage, Ctrl ground attack, neutral clock, ready outline, result HD/Original/budget and release`);
    } catch (error) {
        row.status = 'FAIL'; row.failure = error.stack;
        row.diagnostics = await page.evaluate(() => ({ text: document.body.innerText.slice(-2000),
            orders: window.__allied?.orders, sample: window.__allied?.tank && window.__allied.sample(window.__allied.tank),
            hover: window.__ra2debug.worldInteraction?.getCurrentHover()?.tile && [window.__ra2debug.worldInteraction.getCurrentHover().tile.rx, window.__ra2debug.worldInteraction.getCurrentHover().tile.ry] })).catch(() => undefined);
        await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
        await save(); throw error;
    } finally { await s.app.close(); }
}
report.status = 'PASS_NATIVE_MAC_TARGETED_CORRECTIONS'; await save();
