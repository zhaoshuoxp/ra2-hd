// M0.2 bounded browser diagnostics. Observers never change simulation or action payloads.
import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { issueDefenseSequence } from './defense-sequence.mjs';
import { issueStabilityDefense } from './stability-defense.mjs';
import { issueFrontlineDefense } from './frontline-defense.mjs';
import { runAircraftScenario } from './aircraft-sequence.mjs';

const mode = process.env.M02_MODE ?? 'profile';
const kind = process.env.M02_BROWSER ?? 'chromium';
const output = process.env.M02_OUTPUT ?? '.artifacts/m0-2/profile-1';
const detailed = process.env.M02_LIGHT !== '1';
const speed = mode === 'stress' ? 6 : 3;
const units = mode === 'stress' ? 0 : 10;
const duration = Number(process.env.M02_DURATION_MS ?? (mode === 'stability' ? 600000 : 60000));
fs.mkdirSync(output, { recursive: true });
const result = {
    source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }),
    harnessSha256: createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),
    fixture: { mode, speed, units, map: 'MP01T4.map', seed: 1700000000000, viewport: [1280, 960], dpr: 1,
        human: 'Americans', bots: '3 Normal Libya, team 1, starts 1/2/3', credits: 10000,
        duration, warmupMs: mode === 'stress' ? 3000 : 20000, detailed, shadowQuality: 3,
        defense: process.env.M02_DEFENSE ?? 'original-eight-pillboxes' },
    errors: [], console: [], external: [], requests: [], websockets: [], workers: [], samples: [], actions: [],
};
const browser = kind === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: process.env.M02_HEADLESS === '1',
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'],
});
result.browser = { kind, version: browser.version(), headless: kind === 'webkit' || process.env.M02_HEADLESS === '1' };
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
await context.route('**/*', route => {
    const url = route.request().url();
    result.requests.push(url);
    if (!url.startsWith('http://127.0.0.1:4000/') && !/^(blob|data):/.test(url)) {
        result.external.push(url); return route.abort();
    }
    return route.continue();
});
await context.addInitScript(({ speed, units }) => {
    window.__m02Diagnostics = [];
    const record = (kind, e) => window.__m02Diagnostics.push({ kind, now: performance.now(),
        message: e.message, event: e.type, target: e.target?.tagName, source: e.target?.src,
        visibility: document.visibilityState, focus: document.hasFocus() });
    window.addEventListener('error', e => record('error-event', e), true);
    document.addEventListener('pointerlockerror', e => record('pointerlockerror', e));
    const nativeRequest = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function (...args) {
        const item = { kind: 'pointer-lock-request', now: performance.now(), connected: this.isConnected,
            sameDocument: this.ownerDocument === document, focus: document.hasFocus(), args };
        window.__m02Diagnostics.push(item);
        const promise = nativeRequest.apply(this, args);
        promise?.then(() => { item.resolved = true; }, e => { item.rejected = { name: e.name, message: e.message }; });
        return promise;
    };
    const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '0',
        _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: `${speed};10000;${units};1;1;0;1;0;;0;1;0;0`,
        _r_lastBots: JSON.stringify([null, ...[1, 2, 3].map(i => ({ d: 4, c: 5, co: i, s: i, t: 1 })), null, null, null, null]) };
    for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
}, { speed, units });
const page = await context.newPage();
page.on('pageerror', e => result.errors.push({ wallTime: Date.now(), text: e.stack }));
page.on('console', m => {
    const entry = { wallTime: Date.now(), type: m.type(), text: m.text(), location: m.location() };
    if (m.type() === 'error') for (const arg of m.args()) arg.evaluate(v => ({ type: v?.type,
        message: v?.message, name: v?.name, target: v?.target?.constructor?.name })).then(value => {
        (entry.arguments ??= []).push(value);
    }).catch(() => {});
    if (/Handled error|toId is not defined/.test(m.text())) page.evaluate(() => ({
        tick: window.__ra2debug?.game?.currentTick, now: performance.now(),
        deployed: window.__ra2debug?.localPlayer?.getOwnedObjects().some(o => o.name === 'GACNST'),
    })).then(value => { entry.stateAfterConsoleDelivery = value; }).catch(() => {});
    result.console.push(entry);
    fs.appendFileSync(`${output}/console.jsonl`, JSON.stringify(entry) + '\n');
});
page.on('websocket', s => result.websockets.push(s.url()));
page.on('worker', w => result.workers.push(w.url()));
function save() { fs.writeFileSync(`${output}/result.json`, JSON.stringify(result, null, 2)); }

function readState() {
    const d = window.__ra2debug, g = window.__m01RunGame ?? d.game;
    return { now: performance.now(), tick: g.currentTick, status: g.status, end: window.__m02End,
        failure: window.__m01Failure, attempts: window.__offlineAttempts, diagnostics: window.__m02Diagnostics,
        deployed: g.getNonNeutralPlayers()[0]?.getOwnedObjects().some(o => o.name === 'GACNST'),
        players: g.getNonNeutralPlayers().map(p => ({ name: p.name, ai: p.isAi, defeated: p.defeated,
            credits: p.credits, built: p.getUnitsBuilt(), kills: p.getUnitsKilled(), lost: p.getUnitsLost(),
            objects: p.getOwnedObjects().map(o => ({ id: o.id, name: o.name, tile: [o.tile.rx, o.tile.ry],
                health: o.healthTrait?.health, deployed: o.deployerTrait?.isDeployed(), moving: o.isMoving, firing: o.isFiring })) })),
        humanSequence: window.__m01HumanSequence };
}

function startObservers(detailed) {
    const d = window.__ra2debug, p = window.__m02 = { frames: [], spans: [], inputs: [], commands: [], responses: [],
        longTasks: [], start: performance.now(), startTick: d.game.currentTick, restores: [], active: true };
    const wrap = (obj, key, label) => {
        const original = obj[key];
        obj[key] = function (...args) {
            const start = performance.now(), tick = d.game.currentTick;
            try { return original.apply(this, args); }
            finally { p.spans.push({ label, start, end: performance.now(), tick }); }
        };
        p.restores.push(() => { obj[key] = original; });
    };
    if (detailed) {
        wrap(d.game, 'update', 'simulation'); wrap(d.renderer, 'update', 'update'); wrap(d.renderer, 'render', 'render');
        const q = d.actionsApi.actionQueue, push = q.push;
        q.push = function (...actions) {
            for (const action of actions) {
            const item = { enqueue: performance.now(), tick: d.game.currentTick, type: action.actionType, order: action.orderType,
                inputIndex: p.currentInput, scripted: p.scripted ?? false };
            p.commands.push(item);
            const process = action.process;
            action.process = function (...args) {
                item.apply = performance.now(); item.applyTick = d.game.currentTick;
                return process.apply(this, args);
            };
            }
            return push.apply(this, actions);
        };
        p.restores.push(() => { q.push = push; });
        const receive = e => {
            p.currentInput = p.inputs.length;
            p.inputs.push({ type: e.type, key: e.key, button: e.button, receipt: performance.now(), tick: d.game.currentTick });
            queueMicrotask(() => { p.currentInput = undefined; });
        };
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup']) {
            document.addEventListener(type, receive, true);
            p.restores.push(() => document.removeEventListener(type, receive, true));
        }
        if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
            const observer = new PerformanceObserver(list => {
                for (const e of list.getEntries()) p.longTasks.push({ start: e.startTime, duration: e.duration });
            });
            observer.observe({ type: 'longtask', buffered: false }); p.restores.push(() => observer.disconnect());
        }
    }
    let last;
    const sample = raf => {
        if (!p.active) return;
        const now = performance.now();
        if (last !== undefined) p.frames.push({ start: last, end: now, interval: now - last, raf, tick: d.game.currentTick, hidden: document.hidden });
        last = now;
        if (p.watch) {
            const w = p.watch, r = d.renderableManager.getRenderableByGameObject(w.unit);
            const position = r?.getPosition().toArray();
            if (position && !w.visual && position.some((v, i) => Math.abs(v - w.before[i]) > 0.001)) {
                w.visual = now; p.responses.push({ issued: w.issued, firstObservedRenderablePositionChange: now,
                    tick: d.game.currentTick, unit: w.unit.id, endpoint: 'rAF observation of renderable position; not display presentation' });
            }
        }
        requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
}

try {
    await page.goto('http://127.0.0.1:4000/');
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__m01RunGame = d.game;
        d.game.onEnd.subscribe(() => { window.__m02End = { tick: d.game.currentTick, now: performance.now() }; });
        d.generalOptions.graphics.shadows.value = 3;
    });
    await page.waitForTimeout(mode === 'stress' ? 3000 : 20000);
    result.environment = await page.evaluate(() => {
        const d = window.__ra2debug, c = d.worldScene.camera, renderer = d.renderer.renderer,
            gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { userAgent: navigator.userAgent, dpr: devicePixelRatio, screen: [screen.width, screen.height],
            hidden: document.hidden, graphics: d.generalOptions.graphics.serialize(), speedMultiplier: d.game.speed.value,
            viewport: d.worldScene.viewport, canvas: [renderer.domElement.width, renderer.domElement.height],
            camera: { type: c.type, zoom: c.zoom, left: c.left, right: c.right, top: c.top, bottom: c.bottom, rotation: c.rotation.toArray() },
            shadowSize: d.worldScene.directionalLight.shadow.mapSize.toArray(),
            gl: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
            gpuTimerExtension: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') };
    });
    result.initial = await page.evaluate(readState);
    await page.screenshot({ path: `${output}/initial.png` });
    if (mode === 'stress' || mode === 'aircraft') {
        result.scenarioStartedAt = Date.now();
        try { result.aircraft = await runAircraftScenario(page, output); }
        catch (e) { result.scenarioError = e.stack; }
        result.scenarioElapsedMs = Date.now() - result.scenarioStartedAt;
        result.final = await page.evaluate(readState);
    } else {
        await page.evaluate(startObservers, detailed);
        await page.evaluate(() => {
            window.__ra2debug.helpers.selectOwnedUnitByName('AMCV');
            window.__m02.scripted = true;
            window.__ra2debug.helpers.deploySelectedUnits();
            window.__m02.scripted = false;
        });
        const started = Date.now();
        let nextMove = 5000, attackIssued = false;
        while (Date.now() - started < duration) {
            if (mode !== 'outcome') await page.evaluate(process.env.M02_DEFENSE === 'frontline' ? issueFrontlineDefense :
                process.env.M02_DEFENSE === 'reinforced' ? issueStabilityDefense : issueDefenseSequence);
            const elapsed = Date.now() - started;
            if (mode === 'profile' && elapsed >= nextMove && elapsed < 40000) {
                const point = await page.evaluate(() => {
                    const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(o => o.name === 'MTNK');
                    if (!u) return;
                    return d.helpers.getOwnedUnitClickPointById(u.id);
                });
                if (point) {
                    await page.mouse.click(point.x, point.y);
                    await page.evaluate(() => {
                        const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(o => o.name === 'MTNK');
                        const r = d.renderableManager.getRenderableByGameObject(u);
                        window.__m02.watch = { unit: u, before: r.getPosition().toArray(), issued: performance.now() };
                    });
                    await page.mouse.click(point.x + (nextMove % 40000 === 5000 ? 80 : -60), point.y + 35);
                    result.actions.push({ action: 'DOM select and ground click', elapsed });
                }
                nextMove += 20000;
            }
            if (mode === 'profile' && elapsed >= 40000 && !attackIssued) {
                const attack = await page.evaluate(() => {
                    const d = window.__ra2debug, u = d.localPlayer.getOwnedObjects().find(o => o.name === 'MTNK');
                    if (!u) return null;
                    window.__m02.scripted = true;
                    d.actionsApi.orderUnits([u.id], 3, u.tile.rx + 3, u.tile.ry);
                    window.__m02.scripted = false;
                    return { action: 'Normal ForceAttack ground command', tick: d.game.currentTick, unit: u.id,
                        target: [u.tile.rx + 3, u.tile.ry] };
                });
                result.actions.push(attack); attackIssued = true;
            }
            const state = await page.evaluate(readState);
            state.elapsedMs = Date.now() - started;
            result.samples.push(state); save();
            if (state.end || state.failure || result.errors.length) break;
            if (result.samples.length > 3 && state.tick === result.samples.at(-3).tick) { result.stall = true; break; }
            await page.waitForTimeout(Math.min(2000, Math.max(0, duration - (Date.now() - started))));
        }
        result.final = await page.evaluate(readState);
        result.final.elapsedMs = Date.now() - started;
        result.measurement = await page.evaluate(() => {
            const p = window.__m02; p.active = false; p.restores.forEach(f => f());
            const { restores, watch, ...data } = p; return data;
        });
        console.log(JSON.stringify({ mode, elapsedMs: result.final.elapsedMs, tick: result.final.tick,
            defeated: result.final.players.map(p => p.defeated), errors: result.errors.length, end: result.final.end }));
    }
    await page.screenshot({ path: `${output}/final.png` });
    if (result.final?.end) { await page.waitForTimeout(7000); result.outcomeText = await page.locator('body').innerText(); }
} catch (e) {
    result.harnessError = e.stack;
    result.failureState = await page.evaluate(readState).catch(() => null);
    console.error(e);
} finally {
    save(); await browser.close();
}
