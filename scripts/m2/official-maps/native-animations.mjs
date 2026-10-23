// Observe native phases and a stock procedural lightpost without sprite overrides.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateNativeAnimations({ page, report, out }) {
    if (report.environment.families['environment-gglite']?.status === 'PUBLISHED_COMPLETE_FAMILY') {
        await page.evaluate(() => {
            const d = window.__ra2debug;
            if (!d.game.getWorld().getAllObjects().some(object => object.name === 'INGRNLMP'))
                window.__m23NativeLightpost = window.__allied.building('INGRNLMP');
        });
        await page.waitForTimeout(250);
    }
    const sample = () => page.evaluate(() => {
        const d = window.__ra2debug;
        return { tick: d.game.currentTick,
            waterfalls: d.mapRenderable.tileLayer.anims.filter(anim => /^W[ABD]/.test(anim.name))
                .map(anim => ({ name: anim.name, member: anim.mainObj.builder.shpFile?.filename,
                    frame: anim.mainObj.builder.getFrame(), hd: anim.mainObj.builder.hdOverride?.identity })),
            lightposts: d.game.getWorld().getAllObjects().filter(object => object.rules?.isLightpost)
                .map(object => {
                    const renderable = d.renderableManager.getRenderableByGameObject(object);
                    return { name: object.name, tile: object.tile && [object.tile.rx, object.tile.ry],
                        nativeLightIntensity: object.rules.lightIntensity, spawned: object.isSpawned,
                        hasMainSprite: !!renderable?.mainObj,
                        lampChildren: renderable?.get3DObject()?.children.map(child => child.type) };
                }) };
    });
    report.newNativeAnimations = { disclosure: 'Ordinary native animation ticks. A legal stock green lightpost fixture is created when its selected family has no placed green post. Native procedural lamp rendering is retained without an SHP sprite or rules override.', before: await sample() };
    await page.waitForTimeout(700);
    report.newNativeAnimations.after = await sample();
    const { before, after } = report.newNativeAnimations;
    assert(after.tick > before.tick);
    if (before.waterfalls.length) {
        assert(before.waterfalls.every(anim => anim.hd?.endsWith(`/tiles/${report.environment.density}`)));
        assert(after.waterfalls.some((anim, index) => anim.frame !== before.waterfalls[index]?.frame));
        const png = await page.evaluate(() => {
            const d = window.__ra2debug, layer = d.mapRenderable.tileLayer;
            const anim = layer.anims.find(anim => /^W[ABD]/.test(anim.name));
            const tile = d.game.map.tiles.getAll().find(tile => {
                const source = layer.theater.tileSets.getTile(tile.tileNum)?.getAnimation();
                return source?.name === anim.name && source.subTile === tile.subTile;
            });
            d.worldInteraction.minimapHandler.panToTile(tile); d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL().split(',')[1];
        });
        await fs.writeFile(path.join(out, 'native-waterfall-framebuffer.png'), Buffer.from(png, 'base64'));
    }
    report.newNativeAnimations.status = 'PASS_NATIVE_PHASE_OBSERVATION';
}
