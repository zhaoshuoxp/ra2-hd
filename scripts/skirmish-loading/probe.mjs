import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const density = Number(process.argv[4] ?? 4);
const repeat = process.argv.includes('--repeat');
const out = path.resolve(process.argv[3]);
const receipt = process.argv[2];
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const snow = process.argv.includes('--snow');
let cdp;
const session = await startSession(receipt, out, edition, snow, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = density !== 1;
        if (density !== 1) graphics.hdDensity.value = density;
    }, density);
}, async ({ page }) => {
    await page.evaluate(() => {
        const audit = window.__loadingAudit = { begin: 0, phases: [], progress: [], selections: [], requests: [], bitmaps: [], longTasks: [] };
        const elapsed = () => performance.now() - audit.begin;
        const wrap = (owner, name, label = name) => {
            const original = owner[name];
            owner[name] = function (...args) {
                const start = elapsed();
                const result = original.apply(this, args);
                const finish = () => audit.phases.push({ name: label, start, end: elapsed() });
                if (result?.then) return result.finally(finish);
                finish(); return result;
            };
        };
        const root = window.__ra2debug.mainMenuController.getCurrentScreen().rootController;
        const screen = [...root.screens.values()].find(s => s.gameLoader);
        wrap(screen, 'transferAndLoadMapFile', 'mapTransfer');
        wrap(screen.gameLoader, 'load', 'retailLoad');
        wrap(screen, 'loadUi', 'loadUi');
        const create = screen.loadingScreenApiFactory.create;
        screen.loadingScreenApiFactory.create = function (...args) {
            const api = create.apply(this, args), progress = api.onLoadProgress;
            api.onLoadProgress = function (percent) {
                audit.progress.push({ time: elapsed(), percent });
                return progress.call(this, percent);
            };
            return api;
        };
        for (const name of ['log', 'info']) {
            const original = console[name];
            console[name] = function (...args) {
                const message = args[0];
                if (typeof message === 'string' && /HD selection|HD budget|GameScreen.onGameStart/.test(message)) {
                    audit.selections.push({ time: elapsed(), message,
                        density: args[1]?.density, gpuBytes: args[1]?.gpuBytes });
                }
                return original.apply(this, args);
            };
        }
        const fetch = window.fetch;
        window.fetch = async function (...args) {
            const start = elapsed(), url = String(args[0]);
            const response = await fetch.apply(this, args);
            if (url.includes('/local-hd/')) audit.requests.push({ start, end: elapsed(), url, status: response.status });
            return response;
        };
        const bitmap = window.createImageBitmap;
        window.createImageBitmap = async function (...args) {
            const start = elapsed(), result = await bitmap.apply(this, args);
            audit.bitmaps.push({ start, end: elapsed(), width: result.width, height: result.height });
            return result;
        };
        audit.observer = new PerformanceObserver(list => {
            for (const item of list.getEntries()) audit.longTasks.push({ start: item.startTime - audit.begin, duration: item.duration });
        });
        audit.observer.observe({ type: 'longtask' });
        const start = window.__ra2debug.skirmishLobby.startGame;
        window.__ra2debug.skirmishLobby.startGame = function (...args) {
            audit.begin = performance.now();
            return start.apply(this, args);
        };
    });
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
    await cdp.send('Profiler.start');
});
async function capture(label = 'load') {
    const { profile } = await cdp.send('Profiler.stop');
    const audit = await session.page.evaluate(() => {
        const a = window.__loadingAudit;
        a.observer.disconnect();
        const { observer, ...data } = a;
        const d = window.__ra2debug;
        return { ...data, observedReady: performance.now() - a.begin,
            map: d.game.gameOpts.mapName, playerSide: d.localPlayer.country.side,
            cache: d.preparedHdCache && { ...d.preparedHdCache },
            allocations: d.sovietUnitsHd,
            eagerFamilies: Object.keys(d.worldView.sovietBuildingsHd),
            graphics: { hd: d.generalOptions.graphics.hdEnabled.value, density: d.generalOptions.graphics.hdDensity.value } };
    });
    const nodes = new Map(profile.nodes.map(node => [node.id, node]));
    const parent = new Map();
    for (const node of profile.nodes) for (const id of node.children ?? []) parent.set(id, node.id);
    const own = new Map(), inclusive = new Map();
    for (let i = 0; i < (profile.samples ?? []).length; i++) {
        let id = profile.samples[i], duration = profile.timeDeltas[i] / 1000;
        own.set(id, (own.get(id) ?? 0) + duration);
        while (id !== undefined) { inclusive.set(id, (inclusive.get(id) ?? 0) + duration); id = parent.get(id); }
    }
    const top = (times) => [...times].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([id, ms]) => ({
        ms: Math.round(ms), function: nodes.get(id).callFrame.functionName,
        url: nodes.get(id).callFrame.url, line: nodes.get(id).callFrame.lineNumber + 1,
        column: nodes.get(id).callFrame.columnNumber + 1,
    }));
    audit.cpuSelf = top(own); audit.cpuInclusive = top(inclusive);
    audit.profilerMs = (profile.endTime - profile.startTime) / 1000;
    await fs.writeFile(path.join(out, label + '-audit.json'), JSON.stringify(audit, null, 2) + '\n');
    await fs.writeFile(path.join(out, label + '.cpuprofile'), JSON.stringify(profile));
    console.log(JSON.stringify({ density, label, observedReady: audit.observedReady, phases: audit.phases,
        selections: audit.selections, requests: audit.requests.length, bitmaps: audit.bitmaps.length,
        cache: audit.cache, topCPU: audit.cpuSelf.slice(0, 8) }, null, 2));
}
let failure;
try {
    await capture(repeat ? 'first' : 'load');
    if (repeat) {
        await session.page.evaluate(async () => {
            clearInterval(window.__allied.timer);
            const screen = window.__ra2debug.gameScreen;
            window.__ra2debug.skirmishLobby = undefined;
            await screen.controller.goToScreenBlocking(0, { route: screen.returnTo });
        });
        await session.page.waitForFunction(() => !window.__ra2debug.game && window.__ra2debug.skirmishLobby);
        await session.page.evaluate(() => {
            const a = window.__loadingAudit;
            for (const name of ['phases', 'progress', 'selections', 'requests', 'bitmaps', 'longTasks']) a[name] = [];
            a.observer.observe({ type: 'longtask' });
        });
        await cdp.send('Profiler.start');
        await session.page.evaluate(() => {
            window.__loadingAudit.begin = performance.now();
            window.__ra2debug.skirmishLobby.startGame(1700000000001);
        });
        await session.page.waitForFunction(() => window.__ra2debug.game?.status === 1, undefined, { timeout: 90000 });
        await capture('second');
        await session.page.evaluate(() => window.__installAlliedFixtures());
    }
} catch (error) {
    failure = error;
    await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack,
        state: await session.page.evaluate(() => ({ game: window.__ra2debug.game?.status,
            lobby: !!window.__ra2debug.skirmishLobby,
            currentScreen: window.__ra2debug.mainMenuController?.getCurrentScreen()?.constructor.name })) }, null, 2));
    throw error;
} finally {
    if (failure) await session.app.close();
    else await session.close();
}
