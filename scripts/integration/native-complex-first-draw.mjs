import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output, mode = 'baseline', density = '4'] = process.argv.slice(2);
const applyGraphics = async ({ page }) => page.evaluate(density => {
    const graphics = window.__ra2debug.generalOptions.graphics;
    graphics.hdEnabled.value = true; graphics.hdDensity.value = Number(density);
}, density);
const session = await startSession(receipt, output, 'yr', false, applyGraphics, applyGraphics);
const { page, report, close } = session;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, fixtures = window.__allied;
        for (const name of ['YACNST', 'NAREFN', 'YAPOWR', 'YAWEAP', 'YATECH']) fixtures.building(name);
        d.trainer.setEnabled(true);
        d.trainer.send({ type: 'effect', effect: 'technology', enabled: true }); d.trainer.setNumber('seconds', 1);
        d.trainer.send({ type: 'effect', effect: 'construction', enabled: true });
        d.trainer.send({ type: 'effect', effect: 'production', enabled: true, value: 1 });
        d.trainer.send({ type: 'credits', mode: 'set', value: 100000 });
        window.__firstProduction = { frames: [], intervals: [], jobs: [], last: performance.now() };
        const render = d.renderer.render.bind(d.renderer);
        d.renderer.render = () => {
            render();
            const state = window.__firstProduction, at = performance.now();
            if (state.current) {
                state.intervals.push({ name: state.current, ms: at - state.last });
                for (const object of d.localPlayer.getOwnedObjects().filter(o => o.name === state.current)) {
                    const r = d.renderableManager.getRenderableByGameObject(object);
                    if (!r?.get3DObject()) continue;
                    const sprites = [r.mainObj, r.bib, r.shpRenderable, ...[...(r.animObjects?.values() ?? [])].flat()]
                        .filter(s => s && typeof s.get3DObject === 'function' && s.builder);
                    state.frames.push({ name: object.name, id: object.id, tick: d.game.currentTick, at,
                        buildStatus: object.buildStatus, vxl: !!r.unitVxlHd?.active,
                        sprites: sprites.map(s => ({ hd: !!s.builder.hdOverride,
                            visible: s.get3DObject()?.visible, frame: s.builder.getFrame() })) });
                }
            }
            state.last = at;
        };
    });
    await page.waitForTimeout(5000);
    report.production = [];
    for (const [name, type] of [['NAMISL', 2], ['NAINDP', 2], ['DISK', 7]]) {
        await page.evaluate(name => {
            const state = window.__firstProduction; state.current = name; state.last = performance.now();
        }, name);
        if (mode.includes('visible')) {
            await page.evaluate(name => {
                const d = window.__ra2debug, model = d.gameScreen.sidebarModel;
                const tab = model.tabs.find(tab => tab.items.some(item => item.target.rules.name === name));
                if (!tab) throw Error('No sidebar item ' + name);
                model.selectTab(tab.id);
            }, name);
            await page.waitForTimeout(100);
            await page.evaluate(name => {
                const d = window.__ra2debug, model = d.gameScreen.sidebarModel;
                const index = model.activeTab.items.findIndex(item => item.target.rules.name === name);
                d.gameScreen.hud.sidebarCard.scrollToOffset(Math.floor(index / 2) * 2);
            }, name);
            await page.waitForTimeout(100);
            const point = await page.evaluate(name => {
                const card = window.__ra2debug.gameScreen.hud.sidebarCard;
                const index = card.publishedItems.findIndex(item => item.target.rules.name === name);
                if (index < 0) throw Error('Target not published on visible page ' + name);

                window.__firstProduction.sidebar = { name, items: card.publishedItems.map(item => ({ name: item.target.rules.name, disabled: item.disabled, type: item.target.type })), leases: [...(card.previewLeases?.keys() ?? [])], hover: card.hoverSlotIndex, focus: !!card.releaseFocus, modelFocus: typeof card.props.sidebarModel.focusArtwork };
                return window.__ra2debug.helpers.getSidebarTechnoClickPointByName(name);
            }, name);
            await page.mouse.move(point.x, point.y);
            // Fixed pointer dwell; no wait for HD readiness or change to native ticks.
            await page.waitForTimeout(600);
        }
        await page.evaluate(({ name, type }) => {
            const d = window.__ra2debug, state = window.__firstProduction, rule = d.game.rules.getObject(name, type);
            if (!d.localPlayer.production.isAvailableForProduction(rule)) throw Error('Unavailable ' + name);
            const queue = d.localPlayer.production.getQueueForObject(rule);
            state.current = name;
            state.jobs.push({ name, queue: queue.type, start: performance.now(), sidebar: state.sidebar, hover: d.gameScreen.hud.sidebarCard.hoverSlotIndex, focus: !!d.gameScreen.hud.sidebarCard.releaseFocus, loading: Object.entries(d.sovietUnitsHd.families).filter(([, f]) => f.status === 'LOADING_COMPLETE_FAMILY').map(([name]) => name), allocation: structuredClone(d.sovietUnitsHd.families[name]) });
            d.actionsApi.queueForProduction(queue.type, type, name, 1);
        }, { name, type });
        if (type === 2) {
            await page.waitForFunction(() => {
                const d = window.__ra2debug, state = window.__firstProduction;
                return d.localPlayer.production.getQueue(state.jobs.at(-1).queue).status === 3;
            }, undefined, { timeout: 45000 });
            // Place as soon as the native queue is ready, without waiting for HD.
            await page.evaluate(name => {
                const d = window.__ra2debug, worker = d.game.getConstructionWorker(d.localPlayer);
                const center = window.__allied.center;
                const tile = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
                    && worker.canPlaceAt(name, t, { normalizedTile: true }))
                    .sort((a, b) => Math.hypot(a.rx - center.rx, a.ry - center.ry)
                        - Math.hypot(b.rx - center.rx, b.ry - center.ry))[0];
                if (!tile) throw Error('No legal tile ' + name);
                d.actionsApi.placeBuilding(name, tile.rx, tile.ry);
            }, name);
        }
        await page.waitForFunction(name => window.__firstProduction.frames.some(f => f.name === name),
            name, { timeout: 45000 });
        await page.waitForTimeout(1800);
        if (type === 2) await page.waitForFunction(name => window.__ra2debug.localPlayer.getOwnedObjects()
            .some(o => o.name === name && o.buildStatus === 1), name, { timeout: 30000 });
        const data = await page.evaluate(name => {
            const state = window.__firstProduction, frames = state.frames.filter(f => f.name === name);
            const intervals = state.intervals.filter(f => f.name === name).map(f => f.ms);
            return { name, job: state.jobs.find(job => job.name === name), first: frames[0], frames, maxFrameMs: Math.max(...intervals),
                slowFrames: intervals.filter(ms => ms > 50), allocation: window.__ra2debug.sovietUnitsHd.families[name] };
        }, name);
        report.production.push(data);
    }
    // Screenshots stay outside production timing intervals.
    await page.screenshot({ path: session.out + '/production-complete.png' });
    report.preparation = await page.evaluate(() => window.__ra2debug.sovietUnitsHd.preparation);
    await fs.writeFile(session.out + '/production-data.json', JSON.stringify(report.production, null, 2));
    if (!mode.startsWith('baseline')) for (const p of report.production) {
        assert(p.name === 'DISK' ? p.first.vxl : p.first.sprites.filter(s => s.visible).every(s => s.hd),
            p.name + ' must be HD at first draw');
    }
} catch (error) {
    failure = error;
    report.failureState = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { tick: d.game.currentTick, status: d.game.status, credits: d.localPlayer.credits,
            queues: d.localPlayer.production.getAllQueues().map(q => ({ type: q.type, status: q.status,
                items: q.getAll().map(i => ({ name: i.rules.name, progress: i.progress, quantity: i.quantity })) })),
            owned: d.localPlayer.getOwnedObjects().map(o => ({ name: o.name, spawned: o.isSpawned,
                buildStatus: o.buildStatus, tile: o.tile && [o.tile.rx, o.tile.ry] })) };
    }).catch(() => undefined);
} finally {
    const { profile } = await cdp.send('Profiler.stop');
    await fs.writeFile(session.out + '/cpu-profile.json', JSON.stringify(profile));
    await close(failure);
}
if (failure) throw failure;
console.log(JSON.stringify(report.production.map(p => ({ name: p.name, first: p.first,
    maxFrameMs: p.maxFrameMs, slow: p.slowFrames }))));
