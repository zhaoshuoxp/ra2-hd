import assert from 'node:assert/strict';
export async function validatePacing(page, report) {
    report.pacing = { samples: [], setup: 'Ordinary enemy economy and army; no supplied units, credits or technology' };
    await page.evaluate(() => {
        const g = window.__ra2debug.game, owner = g.getCombatants().find(p => p !== window.__ra2debug.localPlayer);
        const bot = g.botManager.bots.get(owner).innerBot, factory = bot.strategy.attackFactory;
        const original = factory.maybeCreateMissions.bind(factory);
        window.pacingTrace = { waves: [], maxConcurrent: 0 };
        factory.maybeCreateMissions = (...args) => {
            const before = factory.lastAttackAt; original(...args);
            const missions = bot.missionController.getMissions().filter(m => m.getUniqueName().startsWith('attack_'));
            window.pacingTrace.maxConcurrent = Math.max(window.pacingTrace.maxConcurrent, missions.length);
            if (factory.lastAttackAt !== before) window.pacingTrace.waves.push({ tick: g.currentTick, units: missions.at(-1)?.requestedUnitCount });
        };
        window.pacingSample = () => ({ tick: g.currentTick, country: owner.country.name, difficulty: owner.aiDifficulty,
            pacing: g.botManager.gameApi.getPlayerData(owner.name).aiPacing, trace: window.pacingTrace,
            buildings: owner.buildings.size, credits: owner.credits,
            units: owner.getOwnedObjects().reduce((a,u) => (a[u.name] = (a[u.name] ?? 0) + 1,a), {}) });
    });
    const start = Date.now();
    while (Date.now() - start < 360000) {
        const sample = await page.evaluate(() => window.pacingSample());
        report.pacing.samples.push(sample);
        assert(sample.trace.waves.every(w => w.tick >= sample.pacing.firstAttack), 'No offensive wave before the preparation time');
        assert(sample.trace.maxConcurrent <= sample.pacing.maxAttacks, 'Active waves must stay within difficulty limit');
        if (sample.trace.waves.length && sample.tick >= sample.trace.waves[0].tick + 600) break;
        await page.waitForTimeout(5000);
    }
    const final = report.pacing.samples.at(-1);
    assert(final.trace.waves.length, 'The AI must still build and attack after its preparation time');
    assert(final.buildings >= 4, 'Difficulty tuning must preserve a working economy');
    report.pacing.status = 'PASS_NATIVE_DIFFICULTY_PACING';
    console.log('PACING', JSON.stringify(final));
}
