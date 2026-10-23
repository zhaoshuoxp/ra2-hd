import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateTrainerFollowup(page, app, report, out) {
    const result = report.trainerFollowup = { buildings: [], pointer: {} };
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, t = d.trainer;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        g.speed.value = g.desiredSpeed.value = Number.EPSILON;
        const step = (n = 1) => {
            for (const action of d.actionQueue.dequeueAll()) { action.player = p; action.process(); }
            for (let i = 0; i < n; i++) g.update();
        };
        t.setEnabled(true);
        for (const effect of ['technology', 'construction', 'placement']) t.send({ type: 'effect', effect, enabled: true });
        t.send({ type: 'effect', effect: 'power', enabled: true, value: 100000 });
        t.send({ type: 'credits', mode: 'set', value: 2000000 }); t.send({ type: 'reveal' }); step();
        if (!p.getOwnedObjects().some(o => o.rules.constructionYard)) {
            const mcv = p.getOwnedObjects().find(o => g.rules.general.baseUnit.includes(o.name));
            d.actionsApi.orderUnits([mcv.id], 10); step(150);
        }
        window.followupStep = step;
    });
    const names = ['NAMISL', 'NAIRON', 'GACSPH', 'GAWEAT', ...(report.edition === 'yr' ? ['YAPPET', 'YAGNTC', 'NAINDP'] : [])];
    const snapshot = async name => {
        await page.evaluate(name => {
            const d = window.__ra2debug, m = d.gameScreen.sidebarModel, c = d.gameScreen.hud.sidebarCard;
            const tab = m.tabs.find(tab => tab.items.some(i => i.target.type === 0 && i.target.rules.name === name));
            m.selectTab(tab.id);
            const index = tab.items.findIndex(i => i.target.type === 0 && i.target.rules.name === name);
            if (index < c.pagingOffset || index >= c.pagingOffset + c.props.slots) c.scrollToOffset(Math.max(0, index - 4));
        }, name);
        await page.waitForTimeout(150);
        return page.evaluate(name => {
            const d = window.__ra2debug, m = d.gameScreen.sidebarModel, c = d.gameScreen.hud.sidebarCard;
            const index = m.activeTab.items.findIndex(i => i.target.type === 0 && i.target.rules.name === name);
            const i = m.activeTab.items[index], slot = index - c.pagingOffset, mask = c.progressOverlays[slot];
            return { disabled: i.disabled, status: i.status, maskVisible: mask.get3DObject().visible,
                maskFrame: mask.getFrame(), owned: [...d.localPlayer.buildings].filter(b => b.name === name).length,
                cameo: i.cameo, light: c.slotObjects[slot].builder.light, hd: c.slotObjects[slot].isHdArtwork };
        }, name);
    };
    for (const name of names) {
        const before = await snapshot(name); assert.equal(before.disabled, false, name); assert.equal(before.maskVisible, false, name);
        await page.screenshot({ path: path.join(out, `${name}-before.png`) });
        const placement = await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, p = d.localPlayer, rules = g.rules.getBuilding(name);
            const q = p.production.getQueueForObject(rules);
            d.actionsApi.queueForProduction(q.type, 2, name, 1); window.followupStep(5);
            if (q.status !== 3) throw Error(`Queue not ready: ${name}/${q.status}`);
            const cw = g.getConstructionWorker(p), tile = g.map.tiles.getAll().find(tile => cw.canPlaceAt(name, tile, { normalizedTile: true }));
            if (!tile) throw Error(`No footprint: ${name}`);
            d.actionsApi.placeBuilding(name, tile.rx, tile.ry); window.followupStep(180);
            const b = [...p.buildings].find(b => b.name === name);
            if (!b) throw Error(`Not built: ${name}`);
            d.actionsApi.queueForProduction(q.type, 2, name, 1); window.followupStep(5);
            return { id: b.id, buildLimit: rules.buildLimit, duplicateQueueEntries: q.find(rules).length };
        }, name);
        const built = await snapshot(name); assert.equal(built.disabled, true, name); assert.equal(built.owned, 1, name);
        assert.equal(placement.duplicateQueueEntries, 0, name); assert.equal(built.maskVisible, name !== 'NAINDP', name);
        assert.equal(built.maskFrame, name === 'NAINDP' ? 0 : 1, name);
        await page.screenshot({ path: path.join(out, `${name}-built-disabled.png`) });
        await page.evaluate(id => { const d = window.__ra2debug; const b = d.game.getWorld().getObjectById(id); d.game.destroyObject(b); window.followupStep(180); }, placement.id);
        const removed = await snapshot(name); assert.equal(removed.disabled, false, name); assert.equal(removed.maskVisible, false, name);
        result.buildings.push({ name, before, placement, built, removed });
    }
    // Exercise the real pointer-lock relative-motion handler with deterministic
    // movement events. Physical mouse feel remains a separate user review.
    await app.evaluate(({ app, BrowserWindow }) => {
        app.focus({ steal: true }); const w = BrowserWindow.getAllWindows()[0]; w.show(); w.focus();
    });
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.lock());
    await app.evaluate(({ BrowserWindow }) => {
        const wc = BrowserWindow.getAllWindows()[0].webContents;
        wc.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'left', clickCount: 1 });
        wc.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
    });
    await page.waitForTimeout(400);
    result.pointer.nativeFocus = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused());
    result.pointer.realLock = await page.evaluate(() => !!document.pointerLockElement);
    result.pointer.mode = result.pointer.realLock ? 'NATIVE_POINTER_LOCK' : 'CONTROLLED_LOCK_STATE_REAL_RELATIVE_MOTION_HANDLER';
    result.pointer.physicalMouseFeel = 'USER_REVIEW_REQUIRED';
    await page.evaluate(realLock => {
        const pointer = window.__ra2debug.gameScreen.pointer, lock = pointer.getPointerLock();
        const isActive = lock.isActive.bind(lock), unlock = pointer.unlock.bind(pointer);
        if (!realLock) lock.isActive = () => true;
        window.followupUnlocks = 0;
        pointer.unlock = (...args) => {
            window.followupUnlocks++;
            // Restore the real lock API before any native handoff in the fallback fixture.
            lock.isActive = isActive; return unlock(...args);
        };
    }, result.pointer.realLock);
    result.pointer.sweeps = await page.evaluate(async () => {
        const d = window.__ra2debug, pointer = d.gameScreen.pointer, viewport = d.gameScreen.viewport.value;
        const scale = viewport.scale ?? 1, rect = document.querySelector('.trainer-bar').getBoundingClientRect(), samples = [];
        for (let pass = 0; pass < 3; pass++) {
            const startX = Math.max(0, rect.left - 12), startY = rect.top + rect.height / 2;
            Object.assign(pointer.getPosition(), { x: (startX - (viewport.x ?? 0)) / scale, y: (startY - (viewport.y ?? 0)) / scale });
            for (let x = startX; x < rect.right + 16; x += 8) {
                const before = pointer.getPosition().x;
                document.dispatchEvent(new MouseEvent('mousemove', { movementX: 8, movementY: 0, bubbles: true }));
                await new Promise(requestAnimationFrame);
                samples.push({ delta: pointer.getPosition().x - before, expected: 8 / scale, locked: pointer.getPointerLock().isActive(), restoring: pointer.restoringPosition });
            }
        }
        return { samples, unlocks: window.followupUnlocks };
    });
    assert.equal(result.pointer.sweeps.unlocks, 0);
    assert(result.pointer.sweeps.samples.length > 100);
    for (const sample of result.pointer.sweeps.samples) { assert(sample.locked && !sample.restoring); assert(Math.abs(sample.delta - sample.expected) < .001); }
    await page.evaluate(() => {
        const d = window.__ra2debug, v = d.gameScreen.viewport.value, rect = document.querySelector('.trainer-bar button').getBoundingClientRect();
        Object.assign(d.gameScreen.pointer.getPosition(), { x: (rect.left + rect.width / 2 - (v.x ?? 0)) / v.scale, y: (rect.top + rect.height / 2 - (v.y ?? 0)) / v.scale });
    });
    await page.evaluate(() => {
        window.followupWorldEvents = [];
        const canvas = window.__ra2debug.gameScreen.pointer.canvas;
        for (const type of ['mousedown', 'mouseup', 'click'])
            canvas.addEventListener(type, () => window.followupWorldEvents.push(type));
    });
    await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
    assert.equal(await page.evaluate(() => window.followupUnlocks), 0);
    await page.mouse.down(); await page.mouse.up();
    await page.locator('.trainer-popover').waitFor();
    result.pointer.worldEvents = await page.evaluate(() => window.followupWorldEvents);
    assert.deepEqual(result.pointer.worldEvents, []);
    await page.waitForFunction(() => !window.__ra2debug.gameScreen.pointer.restoringPosition);
    result.pointer.clickUnlocks = await page.evaluate(() => window.followupUnlocks);
    assert.equal(result.pointer.clickUnlocks, 1);
    await page.screenshot({ path: path.join(out, 'toolbar-click-opens.png') });
    await page.locator('.trainer-panel-heading button').click();
    await page.waitForFunction(() => !document.querySelector('.trainer-popover'));
    result.pointer.inputReleased = await page.evaluate(() => window.__ra2debug.trainer.canUseKeys);
    assert(result.pointer.inputReleased);
    result.status = result.pointer.realLock ? 'PASS_CONSTRUCTION_ICONS_AND_NATIVE_LOCKED_HOVER' : 'PASS_CONSTRUCTION_ICONS_AND_CONTROLLED_HOVER_NATIVE_LOCK_UNVERIFIED';
    await fs.writeFile(path.join(out, 'followup.json'), JSON.stringify(result, null, 2));
}
