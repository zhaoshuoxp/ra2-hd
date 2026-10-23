// Incremental native checks in the exact correction package and an isolated profile.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';

const edition = process.argv[4] ?? 'yr';
const smoke = process.argv.includes('--smoke');
const infantryOnly = process.argv.includes('--infantry-only');
const density = process.argv.includes('--2x') ? 2 : 4;
const s = await startSession(process.argv[2], process.argv[3], edition, process.argv.includes('--snow'),
    async ({ page }) => page.evaluate(density => {
        const o = window.__ra2debug.generalOptions.graphics;
        o.hdEnabled.value = true; o.hdDensity.value = density;
    }, density), async ({ page }) => {
        await page.locator('input[name=superWeapons]').uncheck();
        assert.equal(await page.locator('input[name=superWeapons]').isChecked(), false);
    });
const { page, report, stage, startClip, stopClip, close } = s;
let failure;
try {
    report.option = await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.player.color = d.game.rules.colors.get('DarkBlue');
        f.enemy.color = d.game.rules.colors.get('DarkGreen');
        f.detailSize = [760, 580];
        f.cleanup = () => {
            if (f.actor?.isSpawned) d.game.unspawnObject(f.actor);
            delete f.actor;
        };
        f.inspect = () => {
            const r = d.renderableManager.getRenderableByGameObject(f.actor);
            const parts = [r?.mainObj, r?.bib, r?.shpRenderable, ...[...(r?.animObjects?.values() ?? [])].flat()].filter(Boolean);
            return { sample: f.sample(f.actor), owner: f.actor.owner.color,
                nativeFrame: r?.mainObj?.builder?.getFrame(),
                shp: parts.map(p => ({ hd: !!p.builder?.hdOverride, frame: p.builder?.getFrame(),
                    material: p.getShapeMesh?.()?.material.type })),
                vxl: r?.unitVxlHd?.layers.map(l => ({ member: l.frames[0]?.part.member,
                    rotor: l.rotor, headings: l.frames.map(v => v.frame.heading),
                    visible: l.frames.filter(v => v.batch.visible).map(v => v.frame.heading) })),
                glError: d.renderer.renderer.getContext().getError() };
        };
        return { superWeapons: f.player.production.gameOpts.superWeapons, density: d.generalOptions.graphics.hdDensity.value };
    });
    assert.equal(report.option.superWeapons, false);
    if (!infantryOnly) {
        report.production = await page.evaluate(() => {
            const f = window.__allied, g = window.__ra2debug.game;
            f.techFixtures = [];
            const rows = [];
            for (const [owner, names, lab, unit, powers] of [
                [f.player, ['GACNST','GAPOWR','GAREFN','GAPILE','GAWEAP','GAAIRC'], 'GATECH','SREF',['GACSPH','GAWEAT']],
                [f.enemy, ['NACNST','NAPOWR','NAREFN','NAHAND','NAWEAP','NARADR'], 'NATECH','APOC',['NAIRON','NAMISL']],
            ]) {
                for (const name of names) f.techFixtures.push(f.building(name, f.center, owner));
                const p = owner.production, rule = g.rules.getObject(lab, 2);
                const labAvailable = p.isAvailableForProduction(rule);
                f.techFixtures.push(f.building(lab, f.center, owner));
                rows.push({ country: owner.country.name, lab, labAvailable, unit,
                    advancedAvailable: p.isAvailableForProduction(g.rules.getObject(unit, 7)),
                    powers: powers.map(name => ({ name, available: p.isAvailableForProduction(g.rules.getObject(name, 2)) })) });
            }
            return rows;
        });
        for (const row of report.production) {
            assert(row.labAvailable && row.advancedAvailable, row.lab + ' / ' + row.unit);
            assert(row.powers.every(p => !p.available));
        }
        await stage('superweapons-off-tech');
        await page.evaluate(() => {
            const f = window.__allied, g = window.__ra2debug.game;
            for (const b of f.techFixtures) g.unspawnObject(b);
        });
        report.buildings = {};
        for (const name of ['GAGAP', 'ATESLA', 'NAWEAP', 'NANRCT']) {
            await page.evaluate(name => {
                const f = window.__allied, d = window.__ra2debug;
                f.actor = f.building(name, { rx: f.center.rx - 8, ry: f.center.ry - 4 });
                d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            }, name);
            await page.waitForFunction(() => {
                const d = window.__ra2debug, f = window.__allied;
                const r = d.renderableManager.getRenderableByGameObject(f.actor);
                return f.actor.buildStatus === 1 && r?.mainObj?.builder?.hdOverride;
            }, undefined, { timeout: 45000 });
            const row = report.buildings[name] = {};
            for (const state of ['normal', 'damaged']) {
                if (state === 'damaged') await page.evaluate(() => {
                    const f = window.__allied; f.actor.healthTrait.applyHitPoints(Math.floor(f.actor.rules.strength * .35), window.__ra2debug.game);
                });
                for (const color of ['blue','green']) {
                    await page.evaluate(color => {
                        const f = window.__allied;
                        window.__ra2debug.game.changeObjectOwner(f.actor, color === 'blue' ? f.player : f.enemy);
                    }, color);
                    await page.waitForTimeout(220);
                    row[state + '-' + color] = await page.evaluate(() => window.__allied.inspect());
                    assert(row[state + '-' + color].shp.some(p => p.hd));
                    assert.equal(row[state + '-' + color].glError, 0);
                    await stage(name + '-' + state + '-' + color);
                }
            }
            await page.evaluate(() => window.__allied.cleanup());
        }
        report.headings = {};
        for (const name of ['DEST','AEGIS','CARRIER','APOC','SCHP','DRED','SHAD']) {
            if (edition === 'ra2' && name === 'SCHP') continue;
            await page.evaluate(name => {
                const f = window.__allied, d = window.__ra2debug;
                f.actor = f.spawn(name, 7, { rx: f.center.rx - 8, ry: f.center.ry - 4 });
                f.actor.attackTrait?.setDisabled(true);
                d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            }, name);
            await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd,
                undefined, { timeout: 45000 });
            const rows = report.headings[name] = [];
            for (const heading of (smoke ? [0,135] : [0,45,90,135,180,225,270,315])) {
                await page.evaluate(heading => {
                    const u = window.__allied.actor; u.direction = heading;
                    if (u.turretTrait) u.turretTrait.facing = heading;
                }, heading);
                await page.waitForTimeout(140);
                const row = { heading, ...await page.evaluate(() => window.__allied.inspect()) };
                assert(row.sample.vxlHd); assert.equal(row.glError, 0); rows.push(row);
                await stage(name + '-blue-' + heading);
            }
            await page.evaluate(() => {
                const f = window.__allied; window.__ra2debug.game.changeObjectOwner(f.actor, f.enemy);
            });
            await page.waitForTimeout(180);
            await stage(name + '-green');
            await page.evaluate(() => window.__allied.cleanup());
        }
        if (edition === 'yr') {
            report.rotors = {};
            for (const name of ['SHAD','SCHP']) {
                await page.evaluate(name => {
                    const d = window.__ra2debug, f = window.__allied;
                    f.actor = f.spawn(name, 7, { rx: f.center.rx - 8, ry: f.center.ry - 4 });
                    f.actor.attackTrait?.setDisabled(true);
                    d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
                }, name);
                await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).vxlHd);
                await startClip();
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied, u = f.actor;
                    f.destination = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t) && !t.rampType
                        && d.game.map.getTileZone(t) === 0
                        && !d.game.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                        .sort((a,b) => Math.abs(Math.hypot(a.rx-u.tile.rx,a.ry-u.tile.ry)-10)
                            - Math.abs(Math.hypot(b.rx-u.tile.rx,b.ry-u.tile.ry)-10))[0];
                    d.actionsApi.orderUnits([u.id], 0, f.destination.rx, f.destination.ry);
                });
                await page.waitForFunction(() => window.__allied.actor.zone === 1, undefined, { timeout: 30000 });
                const sample = () => page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    const r = d.renderableManager.getRenderableByGameObject(f.actor);
                    return { zone: f.actor.zone, moving: f.actor.isMoving, sample: f.sample(f.actor),
                        names: r.objectArt.rotors.map(v => v.name), speeds: r.rotorSpeeds,
                        rotations: r.rotors.map(v => v.quaternion.toArray()),
                        hd: r.unitVxlHd?.layers.filter(l => l.rotor).map(l => ({ count: l.frames.length,
                            visible: l.frames.some(v => v.batch.visible), matrix: l.frames[0].batch.matrixWorld.toArray() })) };
                });
                const before = await sample(); await page.waitForTimeout(650); const after = await sample();
                assert.equal(before.rotations.length, 2); assert(after.speeds.every(v => v !== 0));
                before.rotations.forEach((v,i) => assert.notDeepEqual(v,after.rotations[i], name + ' rotor ' + i));
                assert(after.hd.length === 2 && after.hd.every(v => v.count === 1 && v.visible));
                before.hd.forEach((v,i) => assert.notDeepEqual(v.matrix,after.hd[i].matrix));
                report.rotors[name] = { before, after };
                await stage(name + '-rotors-airborne'); await page.waitForTimeout(1000);
                await stopClip(name + '-native-rotors');
                await page.evaluate(() => window.__allied.cleanup());
            }
        }
    }
    await page.evaluate(() => {
        const f = window.__allied, g = window.__ra2debug.game;
        const tiles = g.map.tiles.getAll();
        const blocked = tiles.filter(t => g.map.getGroundObjectsOnTile(t).some(o => o.isTerrain() || o.isTechno()));
        const land = tiles.filter(t => g.map.isWithinBounds(t) && !t.occluded && !t.rampType
            && g.map.terrain.getPassableSpeed(t, g.rules.getObject('E1', 3).speedType, true, false) > 0
            && g.map.getTileZone(t) === 0);
        f.infOrigin = land.filter(t => !blocked.some(n => Math.hypot(t.rx-n.rx,t.ry-n.ry) < 4))
            .sort((a,b) => Math.hypot(a.rx-f.center.rx,a.ry-f.center.ry) - Math.hypot(b.rx-f.center.rx,b.ry-f.center.ry))[0];
        if (!f.infOrigin) throw Error('No unobstructed infantry review tile');
        f.detailSize = [360, 280];
    });
    report.deaths = {};
    for (const name of (edition === 'yr' ? ['E1','GGI','TANY','E2'] : ['E1','TANY'])) {
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.spawn(name, 3, f.infOrigin);
            f.actor.attackTrait.setDisabled(true); d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).shpHd);
        if (name === 'TANY') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied; d.gameScreen.gameAnimationLoop.stop();
                d.renderableManager.getRenderableByGameObject(f.actor).shpRenderable.setFrame(153);
                d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
            });
            await stage('TANY-controlled-death-frame153');
            await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
        }
        await startClip();
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.deathRenderable = d.renderableManager.getRenderableByGameObject(f.actor);
            f.deathFrames = [];
            f.deathTimer = setInterval(() => f.deathFrames.push({ tick: d.game.currentTick,
                frame: f.deathRenderable.shpRenderable?.builder?.getFrame(), hd: !!f.deathRenderable.shpRenderable?.builder?.hdOverride }), 30);
            d.game.destroyObject(f.actor, { player: f.enemy });
        });
        await page.waitForTimeout(140); await stage(name + '-native-death');
        await page.waitForTimeout(2600); await stopClip(name + '-native-death');
        report.deaths[name] = await page.evaluate(() => {
            const f = window.__allied; clearInterval(f.deathTimer);
            return { destroyed: f.actor.isDestroyed, frames: f.deathFrames };
        });
        assert(report.deaths[name].destroyed);
        assert(new Set(report.deaths[name].frames.filter(v => v.hd).map(v => v.frame)).size > 1);
    }
    report.renderer = await page.evaluate(() => {
        const d = window.__ra2debug, rr = d.renderer.renderer, gl = rr.getContext();
        return { glError: gl.getError(), contextLost: gl.isContextLost(), memory: rr.info.memory,
            frame: rr.info.render, canvas: [rr.domElement.width,rr.domElement.height] };
    });
    assert.equal(report.renderer.glError, 0); assert.equal(report.renderer.contextLost, false);
} catch (error) { failure = error; console.error(error); }
await close(failure);
if (failure) process.exitCode = 1;
