import assert from 'node:assert/strict';
export async function validateBattle(page, report) {
    report.battle = { samples: [] };
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.battleEvents = { produced: {}, attacks: 0, destroyed: 0 };
        const g = d.game;
        window.battleSnapshot = () => ({ tick: g.currentTick, status: g.status,
            players: g.playerList.getAll().filter(p => !p.isNeutral && (!p.isObserver || p.defeated)).map(p => ({ name: p.name, country: p.country.name,
                defeated: p.defeated, credits: p.credits, buildings: p.buildings.size,
                units: p.getOwnedObjects().reduce((a, o) => { a[o.name] = (a[o.name] ?? 0) + 1; return a; }, {}) })), produced: window.battleEvents.produced });
        d.game.events.subscribe(event => {
            const counts = window.battleEvents;
            if (event.type === 44) {
                const name = event.target.name;
                counts.produced[name] = (counts.produced[name] ?? 0) + 1;
            }
            if (event.type === 31) window.battleFinal = window.battleSnapshot();
        });
    });
    const started = Date.now();
    while (Date.now() - started < Number(process.env.RA2_BATTLE_TIMEOUT_MS ?? 240000)) {
        const sample = await page.evaluate(() => {
            return window.battleFinal ?? window.battleSnapshot();
        });
        report.battle.samples.push(sample); console.log('BATTLE', JSON.stringify(sample));
        if (sample.players.some(p => p.defeated) || sample.status !== 1) break;
        await page.waitForTimeout(10000);
    }
    const final = report.battle.samples.at(-1);
    assert(final.players.some(p => p.defeated), 'The skirmish must resolve through normal gameplay');
    await page.locator('.score-table').waitFor({ timeout: 20000 });
    report.battle.scoreScreen = true;
    const pacing = report.pacing?.samples.at(-1);
    if (pacing?.country === 'YuriCountry' && pacing.pacing.maxCapitalShips !== undefined) {
        const counts = report.battle.samples.map(s => s.players.find(p => p.country === 'YuriCountry')?.units.BSUB ?? 0);
        report.battle.maxYuriBoomers = Math.max(...counts);
        assert(report.battle.maxYuriBoomers <= pacing.pacing.maxCapitalShips, 'Yuri must respect the capital-ship difficulty limit');
    }
    if (report.autoplay) {
        for (const player of final.players) {
            assert(report.battle.samples.some(s => s.players.some(p => p.name === player.name && p.buildings >= 4)), `${player.country} must develop an active economy and production base`);
        }
    }
    report.battle.status = report.autoplay ? 'PASS_AI_VS_AI_MATCH' : 'PASS_AI_VS_PASSIVE_STARTING_FORCE';
    await page.getByRole('button', { name: /^(Continue|继续)$/, exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby && !document.querySelector('.score-table'));
    await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    report.battle.reentry = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        units: window.__ra2debug.localPlayer.getOwnedObjects().map(u => u.name),
        mcv: window.__ra2debug.localPlayer.getOwnedObjects().some(u => window.__ra2debug.game.rules.general.baseUnit.includes(u.name)) }));
    assert(report.battle.reentry.mcv, 'A new match must start with its original MCV after the score screen');
}
