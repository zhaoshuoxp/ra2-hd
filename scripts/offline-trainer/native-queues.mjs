export async function validateTrainerQueues(page, report) {
    report.trainer.queues = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, t = d.trainer, f = window.trainerFixture, step = f.step;
        const enemy = g.getCombatants().find(x => x !== p), results = [];
        const check = (ok, msg) => { if (!ok) throw Error(msg); results.push(msg); };
        const flush = (owner = p) => { for (const action of d.actionQueue.dequeueAll()) { action.player = owner; action.process(); } };
        const set = (effect, enabled, value) => { check(t.send({ type: 'effect', effect, enabled, ...(value === undefined ? {} : { value }) }), `Accepted ${effect}`); step(); };
        const queue = p.production.getQueue(2);
        g.speed.value = g.desiredSpeed.value = Number.EPSILON;
        set('technology', true); set('power', true, 100000); set('production', true, 2);
        p.credits = enemy.credits = 100000;
        f.place('NAPOWR', enemy); f.place('NAHAND', enemy); step(100);
        d.actionsApi.queueForProduction(2, 3, 'E2', 1); flush(enemy);
        f.enqueue(2, 3, 'E2'); step(10);
        const item = queue.getFirst(), enemyItem = enemy.production.getQueue(2).getFirst();
        check(item?.creditsSpent > (enemyItem?.creditsSpent ?? Infinity), 'Simultaneous AI queue retains native slower rate');
        d.actionsApi.pauseProduction(2); flush(); const spent = item.creditsSpent; step(20);
        check(queue.status === 2 && item.creditsSpent === spent, 'Native pause holds accelerated queue');
        d.actionsApi.resumeProduction(2); flush(); step(); check(item.creditsSpent > spent, 'Native resume restores queue progress');
        d.actionsApi.pauseProduction(2); flush();
        const paid = item.creditsSpent, beforeCancel = p.credits;
        d.actionsApi.unqueueFromProduction(2, 3, 'E2', 1); flush(); check(p.credits === beforeCancel + paid, 'Partial native cancellation refunds exactly paid credits');
        const samples = [];
        for (const speed of [2, 4, 6, 8, 10]) {
            g.speed.value = g.desiredSpeed.value = speed;
            f.enqueue(2, 3, 'E2'); step(5); samples.push(queue.getFirst().creditsSpent);
            d.actionsApi.unqueueFromProduction(2, 3, 'E2', 1); flush();
        }
        check(samples.every(value => value === samples[0]), 'Five game speeds preserve production cost per simulation tick');
        g.speed.value = g.desiredSpeed.value = Number.EPSILON;
        f.enqueue(2, 3, 'E2'); p.credits = 0; step(5); check(queue.getFirst().creditsSpent === 0, 'Trainer does not produce without payment');
        p.credits = 100000; p.powerTrait.setBlackoutFor(20, g); step(5);
        check(queue.getFirst().creditsSpent > 0 && p.powerTrait.isLowPower(), 'Configured production cap coexists with native low power');
        d.actionsApi.unqueueFromProduction(2, 3, 'E2', 1); flush();
        p.powerTrait.setBlackoutFor(0, g);
        // A physically stalled delivered unit must keep the native factory occupied.
        set('production', true, 1);
        f.enqueue(2, 3, 'E2', 2);
        let delivered;
        for (let i = 0; i < 100 && !delivered; i++) { step(); delivered = f.barracks.factoryTrait.deliveringUnit; }
        check(!!delivered, 'Native factory starts delivery'); delivered.moveTrait.setDisabled(true);
        const firstId = delivered.id; step(30);
        check(f.barracks.factoryTrait.deliveringUnit?.id === firstId && queue.currentSize === 1, 'Stalled exit retains next queued unit without duplicate spawn');
        g.destroyObject(delivered); step(150);
        check(queue.currentSize === 0, 'Native removal of stalled outgoing unit unblocks the next queued delivery');
        f.enqueue(2, 3, 'E2'); step(3); const lossPaid = queue.getFirst().creditsSpent, lossCredits = p.credits;
        g.unspawnObject(f.barracks); check(queue.currentSize === 0 && p.credits === lossCredits + lossPaid, 'Factory loss removes invalid queue with native refund');
        f.barracks = f.place(p.country.side === 0 ? 'GAPILE' : p.country.side === 1 ? 'NAHAND' : 'YABRCK'); step(90);
        t.send({ type: 'reset' }); step(); g.speed.value = g.desiredSpeed.value = 6;
        return { checks: results, speedSamples: samples, scope: 'Native actions and simulation ticks; outgoing-unit movement disabled to fixture a stalled exit, then native destruction removes that blocker. The test does not claim movement automatically resumes after a disabled ExitFactoryTask.' };
    });
}
