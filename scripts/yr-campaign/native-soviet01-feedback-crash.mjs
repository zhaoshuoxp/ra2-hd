import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov01umd.map');
let failure;
try {
    let state = await pilot.open();
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, first = g.world.getAllObjects().find(o => o.position);
        const proto = Object.getPrototypeOf(first.position), move = proto.moveToTileCoords;
        proto.moveToTileCoords = function (x, y, allowPlaceholder) {
            if (!allowPlaceholder && !g.map.tiles.getByMapCoords(Math.floor(x), Math.floor(y))) {
                const actor = g.world.getAllObjects().find(o => o.position === this);
                window.__sovietMissingCell = { tick: g.currentTick, x, y, tile: [Math.floor(x), Math.floor(y)],
                    actor: actor && { id: actor.id, name: actor.name, tile: [actor.tile.rx, actor.tile.ry],
                        owner: actor.owner?.name, zone: actor.zone, from: actor.fromObject?.name },
                    stack: new Error('Missing-cell movement observation').stack,
                    trace: g.campaign.trace.slice(-25) };
            }
            return move.call(this, x, y, allowPlaceholder);
        };
    });
    if (process.argv.includes('--trainer-case')) {
        const accepted = await pilot.page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            d.trainer.setEnabled(true);
            return [d.trainer.send({ type: 'reveal' }), d.trainer.send({ type: 'protect',
                targets: g.localPlayer.getOwnedObjects().filter(u => u.isTechno() && u.isSpawned && !u.isDestroyed) })];
        });
        assert(accepted.every(Boolean));
        pilot.report.trainerDiagnostic = 'Supported reveal and unit protection; excluded from ordinary mission acceptance.';
    }
    const yard = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const u = g.world.getAllObjects().find(u => u.name === 'NACNST' && ['Soviet2House', 'Russians'].includes(u.owner.name));
        return u && [u.tile.rx + 4, u.tile.ry + 4];
    });
    assert(yard);
    for (let i = 0; i < 80; i++) {
        if (!await pilot.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked) && i % 10 === 0)
            await pilot.commands.order(['BORIS', 'HTNK', 'HTK', 'SHK', 'E2', 'SENGINEER'], 4, undefined, yard);
        await pilot.commands.step(120, { defend: false });
        if (process.argv.includes('--airstrike-case') && i === 15) {
            const target = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, hero = g.localPlayer.getOwnedObjects().find(u => u.name === 'BORIS');
                const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                return g.world.getAllObjects().filter(u => u.isBuilding() && !u.isDestroyed
                    && !shroud.isShrouded(u.tile, u.tileElevation) && Math.hypot(u.tile.rx - hero.tile.rx, u.tile.ry - hero.tile.ry) < 12
                    && !['NACNST', 'CATIME01', 'CATIME02', 'CALAB'].includes(u.name))
                    .sort((a, b) => Number(g.areFriendly(hero, a)) - Number(g.areFriendly(hero, b)))[0]?.id;
            });
            assert(target !== undefined);
            await pilot.commands.order(['BORIS'], 3, target);
            pilot.report.airstrikeDiagnostic = { tick: await pilot.page.evaluate(() => window.__ra2debug.game.currentTick), target,
                qualification: 'An ordinary forced attack in a disposable checkpoint; source mission acceptance is separate.' };
        }
        if (i % 5 === 0) state = await pilot.observe('original-time-return-and-soviet-base-contact-' + i);
    }
    pilot.report.status = 'PASS_ORIGINAL_RETURN_CHECKPOINT_BASE_CONTACT_AND_9600_TURNS_NO_MISSING_CELL';
} catch (error) { failure = error; }
if (pilot.session?.page) pilot.report.missingCell = await pilot.page.evaluate(() => window.__sovietMissingCell).catch(() => undefined);
await pilot.finish(failure);
