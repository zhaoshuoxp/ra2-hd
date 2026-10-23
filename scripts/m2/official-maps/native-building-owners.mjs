// Inspect actual ownership palettes and matched native/HD building rendering.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../../m1/allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = process.argv.includes('--density=2') ? 2 : 4;
const edition = process.argv.includes('--edition=ra2') ? 'ra2' : 'yr';
const snow = process.argv.includes('--snow');
const phase = process.argv.find(arg => arg.startsWith('--phase='))?.slice(8) ?? 'baseline';
const names = process.argv.find(arg => arg.startsWith('--names='))?.slice(8).split(',')
    ?? ['GAPOWR', 'NAPOWR', 'GAREFN', 'TESLA', 'YABRCK', 'NATBNK'];
const session = await startSession(receipt, output, edition, snow, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true;
        graphics.hdDensity.value = density;
    }, density);
}, async ({ page, report }) => {
    report.lobby = await page.evaluate(edition => {
        const options = window.__ra2debug.skirmishLobby.gameOpts;
        options.aiPlayers[2] = { difficulty: 4, countryId: edition === 'yr' ? 9 : 5, colorId: 6, startPos: 2, teamId: 1 };
        return { aiPlayers: options.aiPlayers, map: options.mapName };
    }, edition);
});
const { page, report, close } = session;
let failure;
try {
    report.phase = phase;
    report.disclosure = 'Copied native application with isolated profile. Legal building fixtures, owner changes between existing combatants, and synchronous complete-family Original restoration including voxel turrets. Resource identities and material readiness remain separate from this ownership audit.';
    report.density = density;
    report.cases = [];
    await page.evaluate(() => {
        window.__allied.detailSize = [960, 720];
        window.__ra2debug.worldScene.cameraPan.freeCamera.value = true;
        window.__ownerBinding = object => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(object);
            const turret = r.buildingTurretHd;
            return { id: object.id, name: object.name, owner: object.owner.name,
                ownerColor: object.owner.color, lastOwnerColor: r.lastOwnerColor,
                turret: turret && { density: turret.resources.density,
                    headings: [...turret.meshes].map(([heading, [, surface]]) => ({ heading,
                        visible: surface.visible, ownerDelta: surface.material.uniforms.rhinoColorDelta.value.toArray(),
                        ownerPixels: turret.resources.parts.get(heading).mask.image.data.reduce((n, v) => n + (v === 255), 0),
                        invalidMaskValues: turret.resources.parts.get(heading).mask.image.data.some(v => v !== 0 && v !== 255) })) },
                parts: [r.mainObj, r.bib, ...[...r.animObjects.values()].flat()].filter(Boolean).map(part => ({
                    member: part.builder.shpFile?.filename, frame: part.builder.getFrame(),
                    hd: part.builder.hdOverride?.identity, palette: part.builder.palette.colors.slice(16, 32),
                    visible: part.get3DObject()?.visible })) };
        };
    });
    for (const name of names) {
        const id = await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            const object = f.building(name);
            f.actor = object;
            d.worldInteraction.minimapHandler.panToTile(object.tile);
            return object.id;
        }, name);
        await page.waitForFunction(id => window.__ra2debug.game.getWorld().getAllObjects()
            .find(object => object.id === id)?.buildStatus === 1, id, { timeout: 30000 });
        if (process.argv.includes('--occupiable-states')) {
            const occupied = await page.evaluate(id => {
                const d = window.__ra2debug, f = window.__allied;
                const object = d.game.getWorld().getAllObjects().find(object => object.id === id);
                if (!object.garrisonTrait?.canBeOccupied() || !object.rules.maxNumberOccupants) return false;
                d.game.changeObjectOwner(object, d.game.getCivilianPlayer());
                const unit = f.spawn('E1', 3, object.tile);
                d.actionsApi.orderUnits([unit.id], 8, id);
                return true;
            }, id);
            if (occupied) await page.waitForFunction(id => window.__ra2debug.game.getWorld().getAllObjects()
                .find(object => object.id === id)?.garrisonTrait.units.length === 1, id, { timeout: 60000 });
        }
        for (const [number, side] of ['player', 'enemy'].entries()) {
            await page.evaluate(({ id, side }) => {
                const d = window.__ra2debug;
                const object = d.game.getWorld().getAllObjects().find(object => object.id === id);
                d.game.changeObjectOwner(object, window.__allied[side]);
            }, { id, side });
            await page.waitForTimeout(180);
            const binding = await page.evaluate(id => window.__ownerBinding(window.__ra2debug.game.getWorld()
                .getAllObjects().find(object => object.id === id)), id);
            assert.deepEqual(binding.ownerColor, binding.lastOwnerColor);
            const factors = [63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8];
            const expectedPalette = factors.map(factor => Object.fromEntries(['r', 'g', 'b']
                .map(channel => [channel, Math.floor(binding.ownerColor[channel] / 255 * factor * 4)])));
            for (const part of binding.parts) assert.deepEqual(part.palette, expectedPalette);
            assert(binding.parts.some(part => part.hd), `${name} has no HD building part`);
            if (binding.turret) {
                assert.equal(binding.turret.headings.length, 8);
                const linear = v => v / 255 <= .04045 ? v / 255 / 12.92 : ((v / 255 + .055) / 1.055) ** 2.4;
                const color = ['r', 'g', 'b'].map(c => linear(binding.ownerColor[c]));
                const scale = Math.max(...color, 1e-6), reference = [1, linear(24), linear(24)];
                for (const heading of binding.turret.headings) {
                    assert(!heading.invalidMaskValues);
                    heading.ownerDelta.forEach((v, i) => assert(Math.abs(v - (color[i] / scale - reference[i])) < 1e-5));
                }
                assert.equal(binding.turret.headings.filter(h => h.visible).length, 1);
            }
            const samples = await page.evaluate(id => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(
                    d.game.getWorld().getAllObjects().find(object => object.id === id));
                const parts = [r.mainObj, r.bib, ...[...r.animObjects.values()].flat()].filter(Boolean);
                const saved = parts.map(part => part.builder.hdOverride);
                const turret = r.buildingTurretHd;
                const meshes = turret ? [...turret.meshes.values()].flat() : [];
                const visibility = meshes.map(mesh => mesh.visible);
                const materials = turret?.originals.map(mesh => mesh.material);
                const shot = () => {
                    d.worldScene.scene.updateMatrixWorld(false);
                    d.worldScene.meshBatchManager.updateMeshes();
                    d.worldScene.meshBatchManager.processRenderQueue();
                    d.renderer.render();
                    return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
                };
                const hd = shot();
                try {
                    parts.forEach(part => part.setHdOverride(undefined));
                    meshes.forEach(mesh => { mesh.visible = false; });
                    turret?.originals.forEach((mesh, i) => { mesh.material = turret.materials[i]; });
                    return { hd, original: shot(), tick: d.game.currentTick,
                        originalRestoration: 'COMPLETE_BUILDING_FAMILY_SAME_SYNCHRONOUS_NATIVE_TICK' };
                } finally {
                    parts.forEach((part, index) => part.setHdOverride(saved[index]));
                    meshes.forEach((mesh, i) => { mesh.visible = visibility[i]; });
                    turret?.originals.forEach((mesh, i) => { mesh.material = materials[i]; });
                }
            }, id);
            for (const mode of ['hd', 'original']) {
                await fs.writeFile(path.join(output, `${name}-${side}-${mode}.png`), Buffer.from(samples[mode], 'base64'));
                delete samples[mode];
            }
            report.cases.push({ name, side, number, binding, ...samples });
            await fs.writeFile(path.join(output, 'owner-cases.json'), JSON.stringify(report, null, 2) + '\n');
        }
        await page.evaluate(id => window.__ra2debug.game.unspawnObject(window.__ra2debug.game.getWorld()
            .getAllObjects().find(object => object.id === id)), id);
        console.log(`PASS native owner palette ${name}`);
    }
    report.ownerAudit = 'PASS_NATIVE_SELECTED_PART_PALETTES_AND_MATCHED_ORIGINAL_HD';
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
