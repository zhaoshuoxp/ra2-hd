import assert from 'node:assert/strict';
export async function validateTechCatalog(page, report, edition) {
    report.techCatalog = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const Production = d.localPlayer.production.constructor;
        const all = d.localPlayer.production.allAvailableObjects;
        return g.rules.getMultiplayerCountries().map(country => {
            const mcv = g.rules.general.baseUnit.map(name => g.rules.getObject(name, 7)).find(r => r.owner.includes(country.name));
            if (!mcv) throw new Error(`No base unit for ${country.name}`);
            const building = r => ({ name: r.name, rules: r, factoryTrait: r.factory ? { type: r.factory } : undefined });
            const buildings = [building(g.rules.getObject(mcv.deploysInto, 2))];
            const player = { country, buildings: new Set(buildings), isAi: false, getOwnedObjects: () => buildings };
            const production = new Production(player, 10, { superWeapons: true }, g.rules, all);
            for (let pass = 0; pass < 20; pass++) {
                const newlyAvailable = production.getAvailableObjects().filter(r => r.type === 2 && !buildings.some(b => b.name === r.name));
                if (!newlyAvailable.length) break;
                for (const rules of newlyAvailable) {
                    const next = building(rules); buildings.push(next); player.buildings.add(next);
                }
            }
            const available = production.getAvailableObjects().map(r => r.name);
            const stolen = all.filter(r => r.requiresStolenAlliedTech || r.requiresStolenSovietTech || r.requiresStolenThirdTech).map(r => r.name);
            return { country: country.name, side: country.side, available, stolen, buildings: buildings.map(b => b.name) };
        });
    });
    const unique = { British: 'SNIPE', Germans: 'TNKD', Alliance: 'BEAG', French: 'GTGCAN', Americans: 'AMRADR', Russians: 'TTNK', Confederation: 'TERROR', Africans: 'DTRUCK', Arabs: 'DESO' };
    for (const entry of report.techCatalog) {
        for (const [country, name] of Object.entries(unique)) assert.equal(entry.available.includes(name), entry.country === country, `${edition}/${entry.country}: country restriction for ${name}`);
        assert(entry.stolen.every(name => !entry.available.includes(name)), `${entry.country}: stolen technology must not be granted by ordinary tech`);
        if (edition === 'ra2') assert(['GGI', 'BFRT', 'BORIS', 'SCHP', 'SMIN', 'YAPOWR'].every(name => !entry.available.includes(name)));
        else {
            const required = entry.side === 0 ? ['GGI', 'BFRT', 'ROBO', 'GAROBO'] : entry.side === 1 ? ['BORIS', 'SCHP', 'NAINDP'] : ['INIT', 'YURI', 'YURIPR', 'VIRUS', 'SMIN', 'TELE', 'MIND', 'CAOS', 'DISK', 'BSUB', 'YAPPET', 'YAGNTC'];
            assert(required.every(name => entry.available.includes(name)), `${entry.country}: missing ${required.filter(name => !entry.available.includes(name)).join(',')}`);
            assert.equal(entry.available.includes('BFRT'), entry.side === 0, `${entry.country}: Allied technology isolation`);
            assert.equal(entry.available.includes('BORIS'), entry.side === 1, `${entry.country}: Soviet technology isolation`);
            assert.equal(entry.available.includes('MIND'), entry.side === 4, `${entry.country}: Yuri technology isolation`);
        }
    }
    report.techCatalogScope = 'Production eligibility iterated from each original country MCV/construction yard through reachable ordinary buildings; country exclusives, edition/faction separation and stolen-tech restrictions. This is not per-unit behavior or all-country full matches.';
}
