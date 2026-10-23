export async function validateTrainerPowers(page, report) {
    report.trainer.powerLifecycle = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, t = d.trainer, f = window.trainerFixture;
        g.speed.value = g.desiredSpeed.value = Number.EPSILON;
        const trait = g.traits.getAll().find(trait => typeof trait.hasActiveEffect === 'function');
        const powers = p.superWeaponsTrait.getAll().slice().sort((a, b) => (a.rules.type === 10 ? 1 : 0) - (b.rules.type === 10 ? 1 : 0));
        const target = g.map.tiles.getAll().find(tile => g.map.isWithinBounds(tile) && g.map.getTileZone(tile) !== 2 &&
            Math.hypot(tile.rx - f.base.tile.rx, tile.ry - f.base.tile.ry) > 40 &&
            !g.getWorld().getAllObjects().some(o => o.isTechno() && Math.hypot(o.tile.rx - tile.rx, o.tile.ry - tile.ry) < 14));
        if (!target) throw Error('No isolated power target tile');
        if (!t.send({ type: 'effect', effect: 'power', enabled: true, value: 100000 }) || !t.send({ type: 'effect', effect: 'recharge', enabled: true })) throw Error('Power setup rejected');
        f.step();
        const results = [];
        for (const power of powers) {
            const row = { name: power.name, type: power.rules.type, activations: [] };
            for (let repeat = 0; repeat < 2; repeat++) {
                if (power.status !== 2) { t.send({ type: 'ready' }); f.step(); }
                if (power.status !== 2) throw Error(`Owned power was not eligible: ${power.name}`);
                const tile = power.rules.type === 10 ? f.base.tile : target;
                d.actionsApi.activateSuperWeapon(power.rules.type, tile, power.rules.type === 3 ? target : undefined);
                for (const action of d.actionQueue.dequeueAll()) { action.player = p; action.process(); }
                const began = trait.hasActiveEffect(power.rules.type, p);
                if (!began) throw Error(`Native activation did not create effect: ${power.name}`);
                const start = g.currentTick;
                f.step();
                if (trait.hasActiveEffect(power.rules.type, p) && power.status === 2) throw Error(`Recharged before active effect cleanup: ${power.name}`);
                let ticks = 0;
                while (trait.hasActiveEffect(power.rules.type, p) && ticks++ < 2400) f.step();
                if (trait.hasActiveEffect(power.rules.type, p)) throw Error(`Power effect exceeded bounded lifecycle: ${power.name}`);
                f.step();
                let blackoutTicks = 0;
                if (power.status !== 2 && power.rules.isPowered && p.powerTrait.getBlackoutDuration() > 0) {
                    while (p.powerTrait.getBlackoutDuration() > 0 && blackoutTicks++ < 10000) f.step();
                    f.step();
                }
                row.activations.push({ effectStarted: began, cleanupTicks: g.currentTick - start, blackoutTicks, readyAfterCleanup: power.status === 2 });
                if (power.status !== 2) throw Error(`Recharge did not resume after cleanup: ${power.name}`);
            }
            results.push(row);
        }
        t.send({ type: 'reset' }); f.step(); g.speed.value = g.desiredSpeed.value = 6;
        return results;
    });
}
