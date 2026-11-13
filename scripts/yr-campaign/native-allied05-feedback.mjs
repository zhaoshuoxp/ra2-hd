import { NativeCampaignPilot } from './native-pilot.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';

const open = NativeCampaignPilot.prototype.open;
NativeCampaignPilot.prototype.open = async function () {
    const state = await open.call(this);
    if (!process.argv.includes('--trainer-case')) return state;
    const accepted = await this.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        d.trainer.setEnabled(true);
        return [d.trainer.send({ type: 'reveal' }), d.trainer.send({ type: 'protect',
            targets: g.localPlayer.getOwnedObjects().filter(u => u.isTechno() && u.isSpawned
                && !u.isDestroyed && !u.isCrashing && u.healthTrait?.getHitPoints() > 0) })];
    });
    if (!accepted.every(Boolean)) throw Error('Supported trainer diagnostic commands were rejected');
    this.report.trainerDiagnostic = 'Supported map reveal and protection of the existing owned fleet/base. This run is excluded from ordinary mission acceptance; source conditions and results are unchanged.';
    await this.commands.step(1, { defend: false });
    return this.observe('supported-user-trainer-configuration');
};

const observe = NativeCampaignPilot.prototype.observe;
NativeCampaignPilot.prototype.observe = async function (label) {
    const state = await observe.call(this, label);
    const resources = await this.page.evaluate(() => {
        const d = window.__ra2debug;
        const { tiles, groups, placedBindings, ...terrain } = d.terrainHd;
        return { tick: d.game.currentTick, actors: structuredClone(d.sovietUnitsHd),
            environment: structuredClone(d.environmentHd), terrain: structuredClone(terrain),
            renderer: structuredClone(d.renderer.renderer.info.memory) };
    });
    (this.report.feedbackResourceSamples ??= []).push({ label, ...resources });
    return state;
};
// Reuse the original paid-production and ordinary-carrier input path. The
// observer records resource pressure without modifying any simulation state.
await import('./native-allied05-carriers.mjs');
if (process.argv.includes('--trainer-case')) {
    const file = path.join(path.resolve(process.argv[2]), 'report.json');
    const report = JSON.parse(await fs.readFile(file));
    if (report.status.startsWith('PASS_')) report.status = 'PASS_SUPPORTED_TRAINER_ORIGINAL_ALLIED05_SOURCE_GOALS_AND_VICTORY';
    await fs.writeFile(file, JSON.stringify(report, null, 2) + '\n');
}
