import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

class TanyaPilot extends NativeCampaignPilot {
    async installObserver() {
        await this.page.evaluate(() => {
            if (window.__tanyaFeedback) return;
            const g = window.__ra2debug.game, original = g.update;
            const audit = window.__tanyaFeedback = { samples: [], changes: [], maxLive: 0 };
            let previous;
            g.update = function(...values) {
                const result = original.apply(this, values);
                const tanya = [...new Set(g.campaign.houses.values())].flatMap(player => player.getOwnedObjects())
                    .filter(unit => unit.name === 'TANY' && !unit.isDestroyed)
                    .map(unit => ({ id: unit.id, owner: unit.owner.name, spawned: unit.isSpawned,
                        country: unit.owner.country.name, limbo: !!unit.limboData, health: unit.healthTrait.health,
                        tile: [unit.tile.rx, unit.tile.ry] }));
                audit.maxLive = Math.max(audit.maxLive, tanya.length);
                const identity = JSON.stringify(tanya.map(({ id, owner, spawned }) => ({ id, owner, spawned })));
                if (identity !== previous) {
                    audit.changes.push({ tick: g.currentTick, tanya }); previous = identity;
                }
                if (g.currentTick % 90 === 0) audit.samples.push({ tick: g.currentTick, tanya });
                return result;
            };
        });
    }
    async replayOrdinaryInputs(...args) {
        await this.installObserver();
        return super.replayOrdinaryInputs(...args);
    }
}

const pilot = new TanyaPilot(process.argv[2], 'sov03umd.map');
let failure;
try {
    await pilot.open();
    assert(pilot.report.launch.semanticsVersion >= 47);
    await pilot.installObserver();
    const support = async () => {
        if (!process.argv.includes('--trainer-case')) return;
        await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            if (g.campaign.inputLocked) return;
            d.trainer.setEnabled(true);
            const targets = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned
                && !unit.isDestroyed && !unit.isCrashing && unit.healthTrait.getHitPoints() > 0
                && (unit.owner === g.localPlayer || unit.owner.campaignController === g.localPlayer));
            if (!d.trainer.send({ type: 'reveal' }) || targets.length
                && !d.trainer.send({ type: 'protect', targets })) throw Error('Supported trainer command rejected');
        });
    };
    if (process.argv.includes('--trainer-case')) pilot.report.trainerDiagnostic =
        'Supported reveal and protection of owned forces, matching the reported invulnerability/map-reveal configuration. '
        + 'Original source trigger conditions, teams, movie and result are unchanged; this is a modified-play regression.';
    await support();
    await pilot.commands.step(1, { defend: false });
    const beacon = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const target = g.world.getAllObjects().find(unit => unit.name === 'NAPSYB' && !unit.isDestroyed
            && !shroud.isShrouded(unit.tile, unit.tileElevation));
        return target && { id: target.id, tile: [target.tile.rx, target.tile.ry] };
    });
    if (beacon) {
        pilot.report.visibleSourceBeacon = beacon;
        await pilot.commands.order(['BORIS'], 2, beacon.id);
        for (let i = 0; i < 720; i++) {
            await support();
            await pilot.commands.step(15, { defend: false });
            const done = await pilot.page.evaluate(id => !window.__ra2debug.game.world.getAllObjects()
                .some(unit => unit.id === id && !unit.isDestroyed), beacon.id);
            if (done) break;
        }
    }
    await pilot.commands.step(2700, { defend: false });
    pilot.report.tanya = await pilot.page.evaluate(() => ({ ...window.__tanyaFeedback,
        trace: window.__ra2debug.game.campaign.trace.filter(row => [4, 7, 10, 100, 117].includes(row.opcode)) }));
    assert(pilot.report.tanya.changes.some(row => row.tanya.length), 'The original Tanya sequence must actually run');
    assert(pilot.report.tanya.changes.some(row => row.tanya.some(unit => /Russian|Soviet/i.test(unit.owner+' '+unit.country))),
        'The source post-movie Soviet Tanya reinforcement must actually arrive');
    assert.equal(pilot.report.tanya.maxLive, 1, 'At most one original Tanya may survive the source movie handoff');
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-single-tanya-after-source-movie.png') });
    pilot.report.status = process.argv.includes('--trainer-case')
        ? 'PASS_SUPPORTED_TRAINER_ORIGINAL_TANYA_SOURCE_MOVIE_HANDOFF_WITHOUT_DUPLICATION'
        : 'PASS_FRESH47_ORIGINAL_ORDINARY_REPLAY_TANYA_SOURCE_MOVIE_HANDOFF_WITHOUT_DUPLICATION';
} catch (error) { failure = error; }
await pilot.finish(failure);
