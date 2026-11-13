import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, worldState } from '../m3-2/native-session.mjs';
import { reexecuteSourcePrefix } from '../campaign-completion/replay-source.mjs';
import { waitForCampaignFullscreen } from '../campaign-completion/native-media-wait.mjs';

const out = path.resolve(process.argv[2]), checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], frames: [],
    scope: 'Native presentation observation of the original action127. The real ordinary-command journal replays from the original source seed, then its frozen intermediate world is compared with the previously captured checkpoint. No trigger, rule, source action, health, RNG or result is edited. This is presentation evidence, not a complete mission victory.' };
let session;
try {
    session = await campaignSession(out, report, { edition: checkpoint.identity.edition, density: 0 });
    const duration = 40, until = checkpoint.expected.mission.yr.chronoScreenUntil;
    const start = until - duration - 5, end = until + duration + 47;
    const source = { identity: { gameId: checkpoint.gameId, timestamp: checkpoint.timestamp, launch: checkpoint.options.campaign },
        difficulty: checkpoint.options.campaign.difficulty, appliedCommands: checkpoint.commands,
        samples: [{ label: 'before-original-chrono-screen', tick: start }] };
    report.prefix = await reexecuteSourcePrefix(session.page, source, 'before-original-chrono-screen');
    await session.page.evaluate(commands => {
        window.__ra2debug.gameScreen.gameTurnMgr.setPaused(true);
        window.__validationReplay = new Map();
        for (const command of commands) {
            const batch = window.__validationReplay.get(command.tick) ?? [];
            batch.push(command); window.__validationReplay.set(command.tick, batch);
        }
    }, checkpoint.commands.filter(command => command.tick >= start));
    const captured = new Set();
    for (let tick = start; tick <= end; tick++) {
        await waitForCampaignFullscreen(session.page);
        const frame = await session.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, gl = d.renderer.renderer.getContext();
            const before = JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() });
            d.renderer.update(0); d.renderer.render();
            const after = JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot() });
            const viewport = d.worldScene.viewport, canvas = d.renderer.getCanvas();
            const ratio = canvas.width / Number(canvas.dataset.logicalWidth);
            const pixel = new Uint8Array(4);
            gl.readPixels(Math.floor((viewport.x + viewport.width / 2) * ratio),
                Math.floor((Number(canvas.dataset.logicalHeight) - viewport.y - viewport.height / 2) * ratio),
                1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return { tick: g.currentTick, effect: g.campaign.yr.chronoScreenEffect(),
                renderer: d.worldScene.screenEffect.debugGetState(), pixel: [...pixel], glError: gl.getError(), unchanged: before === after };
        });
        assert.equal(frame.tick, tick); assert(frame.unchanged); assert.equal(frame.glError, 0);
        if (frame.effect) {
            assert(frame.renderer.gpuBytes > 0 && frame.renderer.gpuBytes <= frame.renderer.reservedBytes);
            const key = frame.effect.phase === 'hold' ? 'hold'
                : frame.effect.white >= .4 && frame.effect.white <= .6 ? frame.effect.phase + '-middle' : undefined;
            if (key && !captured.has(key)) {
                captured.add(key); const file = 'native-' + key + '.png';
                await session.page.screenshot({ path: path.join(out, file) }); report.frames.push({ ...frame, file });
                if (key === 'hold') assert(frame.pixel.slice(0, 3).every(value => value >= 250));
            }
        }
        if (tick === checkpoint.tick) {
            const state = await worldState(session.page);
            assert.deepEqual({ worldHash: state.hash, rng: state.rng, mission: state.mission, world: state.world,
                pendingCallbacks: state.pendingCallbacks }, checkpoint.expected);
            report.originalSavedWorldMatched = { tick, hash: state.hash, rng: state.rng };
        }
        if (tick === end) { report.completed = frame; break; }
        await session.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, manager = d.gameScreen.gameTurnMgr;
            for (const command of window.__validationReplay.get(g.currentTick) ?? []) {
                const action = d.actionFactory.create(command.type); action.unserialize(new Uint8Array(command.data));
                action.player = g.getPlayer(command.player); g.campaign.journal.record(g, action.player, [action]); action.process();
            }
            manager.setPaused(false); manager.setCampaignPaused(false);
            try { manager.doGameTurn(performance.now()); }
            finally { manager.setCampaignPaused(true); manager.setPaused(true); }
        });
    }
    assert.deepEqual([...captured].sort(), ['hold', 'in-middle', 'out-middle']);
    assert(report.originalSavedWorldMatched); assert.equal(report.completed.renderer.gpuBytes, 0);
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ORIGINAL_CHRONO_PHASES_RENDER_ALLOCATION_RELEASE_AND_SAVED_WORLD_PARITY';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await session?.app.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
