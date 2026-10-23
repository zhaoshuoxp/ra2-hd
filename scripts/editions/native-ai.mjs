import assert from 'node:assert/strict';
export async function validateAi(page, report) {
    report.ai = { samples: [] };
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.aiProduced = {};
        d.game.events.subscribe(event => {
            if (event.type === 44 && event.target.owner !== d.localPlayer) {
                const name = event.target.name;
                window.aiProduced[name] = (window.aiProduced[name] ?? 0) + 1;
            }
        });
    });
    const start = Date.now();
    while (Date.now() - start < (process.env.RA2_AI_TIMEOUT_MS ? Number(process.env.RA2_AI_TIMEOUT_MS) : 180000)) {
        const sample = await page.evaluate(() => {
            const d = window.__ra2debug, bot = d.game.getCombatants().find(p => p !== d.localPlayer);
            const objects = bot.getOwnedObjects();
            return { tick: d.game.currentTick, credits: bot.credits, country: bot.country.name,
                objects: objects.reduce((a, o) => { a[o.name] = (a[o.name] ?? 0) + 1; return a; }, {}),
                queue: bot.production.getQueue(0).getAll().map(i => ({ name: i.rules.name, progress: i.progress })),
                queueStatus: bot.production.getQueue(0).status,
                available: bot.production.getAvailableObjects().map(r => r.name),
                power: bot.powerTrait.debugGetState(),
                produced: window.aiProduced,
                messages: d.game.botManager.bots.get(bot)?.innerBot?._debugMessages?.slice(-5),
                slaves: objects.filter(o => o.slaveMinerTrait).reduce((n, o) => n + o.slaveMinerTrait.getSlaves().length, 0) };
        });
        report.ai.samples.push(sample);
        console.log('AI', JSON.stringify(sample));
        if (['YAPOWR', 'YAREFN', 'YABRCK', 'YAWEAP'].every(name => sample.objects[name]) && sample.slaves >= 5 && sample.produced.INIT && sample.produced.LTNK) break;
        await page.waitForTimeout(5000);
    }
    const final = report.ai.samples.at(-1);
    assert.equal(final.country, 'YuriCountry');
    for (const name of ['YAPOWR', 'YAREFN', 'YABRCK', 'YAWEAP']) assert(final.objects[name], `Yuri AI must build ${name}`);
    assert(final.slaves >= 5, 'Yuri AI must run its native economy');
    assert(final.produced.INIT && final.produced.LTNK, 'Yuri AI must produce infantry and armor beyond its starting force');
    report.ai.status = 'PASS_ECONOMY_AND_PRODUCTION_ONLY';
}
