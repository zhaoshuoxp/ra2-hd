import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function reviewRanges(page, output) {
    const result = { status: 'RUNNING', fixture: 'Actual placement/targeting modes on a live map; selecting a target never fires a weapon', samples: [] };
    const dir = path.join(output, 'ranges'); await fs.mkdir(dir);
    await page.evaluate(() => {
        const d = window.__ra2debug, ui = d.gameScreen.playerUi;
        const home = d.localPlayer.getOwnedObjects().find(u => u.name === 'SMCV').tile;
        window.__rangeTest = { ui, tile: d.game.map.tiles.getByMapCoords(home.rx - 4, home.ry - 3) };
        d.worldInteraction.minimapHandler.panToTile(window.__rangeTest.tile);
    });
    for (const name of ['TESLA', 'NALASR', 'NukeSpecial', 'IronCurtainSpecial']) {
        const setup = await page.evaluate(name => {
            const d = window.__ra2debug, q = window.__rangeTest;
            if (name === 'TESLA' || name === 'NALASR') {
                q.mode = q.ui.placementMode;
                q.mode.setBuilding(d.game.rules.getBuilding(name));
                d.worldInteraction.setMode(q.mode); q.mode.hover({ tile: q.tile }, false);
                q.mode.onFrame(performance.now());
                q.grid = q.mode.placementGrid; q.model = q.mode.placementGridModel;
            } else {
                const rules = [...d.game.rules.superWeaponRules.values()].find(r => r.type === (name === 'NukeSpecial' ? 0 : 1));
                if (!rules) throw Error(`Missing superweapon ${name}`);
                q.ui.activateSpecialMode(rules); q.mode = q.ui.specialMode;
                q.mode.hover({ tile: q.tile }, false);
                q.grid = q.mode.rangePreview.grid; q.model = q.mode.rangePreview.model;
            }
            d.worldScene.processRenderQueue(); q.grid.update(); d.worldScene.scene.updateMatrixWorld(true);
            const object = q.grid.rangeObject;
            return { name, radius: q.model.rangeIndicator.radius, tiles: q.model.tiles.length, visible: object.visible,
                type: object.type, ringCount: object.userData.ringCount ?? 1, position: object.position.toArray(), center: q.model.rangeIndicator.center };
        }, name);
        assert.equal(setup.type, 'Mesh'); assert(setup.visible);
        if (name.endsWith('Special')) { assert.equal(setup.tiles, 0); assert.equal(setup.ringCount, 3); }
        for (const mode of ['1080p', '4k']) {
            const capture = await page.evaluate(mode => {
                const d = window.__ra2debug, q = window.__rangeTest;
                d.generalOptions.graphics.renderResolution.value = mode;
                d.gameScreen.gameAnimationLoop.stop(); q.mode.hover({ tile: q.tile }, false);
                if (q.mode.onFrame) q.mode.onFrame(performance.now() + 1000);
                d.worldScene.processRenderQueue(); q.grid.update(); d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
                const rr = d.renderer.renderer, c = rr.domElement;
                return { image: c.toDataURL('image/webp', .95), logical: [d.renderer.width,d.renderer.height], buffer: [c.width,c.height], glError: rr.getContext().getError() };
            }, mode);
            assert.equal(capture.glError, 0);
            const file = `${name}-${mode}.webp`;
            await fs.writeFile(path.join(dir,file),Buffer.from(capture.image.split(',')[1],'base64')); delete capture.image;
            result.samples.push({ ...setup, mode, file, ...capture });
        }
        const moved = await page.evaluate(() => {
            const d = window.__ra2debug, q = window.__rangeTest;
            const next = d.game.map.tiles.getByMapCoords(q.tile.rx + 2,q.tile.ry + 1);
            q.mode.hover({tile:next},false);if(q.mode.onFrame)q.mode.onFrame(performance.now()+2000);q.grid.update();
            const position=q.grid.rangeObject.position.toArray();q.mode.hover(undefined,false);q.model.visible=false;q.grid.update();
            const hidden=!q.grid.rangeObject.visible;
            d.worldInteraction.setMode(undefined);
            const released=!q.mode.rangePreview || !q.mode.rangePreview.attached;
            return { position, hidden, released };
        });
        assert.notDeepEqual(moved.position, setup.position); assert(moved.hidden && moved.released);
        result.samples.at(-1).cleanup = moved;
    }
    result.status = 'PASS_NATIVE_RANGE_MARKERS';
    await fs.writeFile(path.join(dir,'result.json'),JSON.stringify(result,null,2)+'\n'); return result;
}
