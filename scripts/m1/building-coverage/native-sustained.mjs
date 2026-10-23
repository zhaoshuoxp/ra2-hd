import assert from 'node:assert/strict';
import path from 'node:path';

export async function validateSustainedSovietYuri(page, report, out) {
    report.sustained = { boundary: 'Bounded 120-second match with native AI controlling both economies; no victory claim', samples: [] };
    await page.evaluate(() => {
        window.coverageMatchEvents = { fired: 0, produced: 0 };
        window.__ra2debug.game.events.subscribe(e => {
            if (e.type === 2) window.coverageMatchEvents.fired++;
            if (e.type === 44) window.coverageMatchEvents.produced++;
        });
    });
    for (let i = 0; i <= 12; i++) {
        const sample = await page.evaluate(() => {
            const d = window.__ra2debug;
            return { tick: d.game.currentTick, status: d.game.status, events: { ...window.coverageMatchEvents },
                players: d.game.getCombatants().map(p => ({ country: p.country.name, buildings: p.buildings.size,
                    credits: p.credits, units: p.getOwnedObjects().reduce((v, u) => (v[u.name] = (v[u.name] ?? 0) + 1, v), {}) })),
                hd: d.sovietUnitsHd, gl: d.renderer.renderer.getContext().getError() };
        });
        report.sustained.samples.push(sample);
        assert.equal(sample.gl, 0);
        if (i % 3 === 0) await page.screenshot({ path: path.join(out, `sustained-${i * 10}s.png`) });
        if (sample.status !== 1) break;
        if (i < 12) await page.waitForTimeout(10000);
    }
    const final = report.sustained.samples.at(-1);
    assert(final.players.some(p => p.country === 'YuriCountry'));
    assert(final.players.some(p => p.country === 'Africans'));
    for (const country of ['YuriCountry', 'Africans']) {
        assert(report.sustained.samples.some(s => s.players.some(p => p.country === country && p.buildings >= 4)), `${country} economy developed`);
    }
    assert(final.events.produced > 0);
    assert(final.events.fired > 0);
    report.sustained.status = 'PASS_BOUNDED_NATURAL_PRODUCTION_AND_COMBAT';
}
