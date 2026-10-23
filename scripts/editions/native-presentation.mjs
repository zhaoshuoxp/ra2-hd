import assert from 'node:assert/strict';
import path from 'node:path';
export async function validatePresentation(page, report, out) {
    report.presentationCheck = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        for (const bot of g.botManager.bots.values()) bot.onGameTick = () => {};
        const units = d.localPlayer.getOwnedObjects().filter(u => u.isUnit());
        const tank = units.find(u => u.name === 'HTNK');
        const pip = d.renderableManager.getRenderableByGameObject(tank).pipOverlay;
        const texture = pip.createUnitHealthTexture(true), { data, width, height } = texture.image;
        const rows = height / pip.imageFinder.find('pipbrd', false).getImage(0).height;
        const colors = [1, Math.floor(rows * .4), rows].map(n => {
            const rowHeight = height / rows, rgb = [];
            for (let y = (n - 1) * rowHeight; y < n * rowHeight; y++) for (let x = 0; x < width; x++) {
                const index = data[(y * width + x) * 4 + 3];
                if (index) { const c = pip.palette.getColor(index); rgb.push([c.r, c.g, c.b]); }
            }
            return { count: n, colors: [...new Set(rgb.map(c => c.join(',')))].map(c => c.split(',').map(Number)) };
        });
        texture.dispose();
        const rankStart = new URLSearchParams(location.search).get('edition') === 'yr' ? 14 : 13;
        const ranks = [1, 2].map(veteranLevel => {
            const mesh = pip.createVeteranIndicator({ veteranLevel });
            const frame = pip.imageFinder.find('pips', false).getImage(rankStart + veteranLevel - 1);
            return { correctGeometry: mesh.geometry === pip.constructor.geometries.get(frame), width: frame.width, height: frame.height };
        });
        const base = d.localPlayer.getOwnedObjects().find(u => u.name === 'NACNST');
        const r = d.renderableManager.getRenderableByGameObject(base);
        const hd = r.mainObj?.builder?.hdOverride;
        const conscript = pip.imageFinder.conscriptHd;
        const saved = units.map(u => ({ u, health: u.healthTrait.health }));
        d.unitSelection.deselectAll();
        units.forEach((u, i) => { u.healthTrait.health = [100, 40, 10][i % 3]; d.unitSelection.addToSelection(u); });
        window.presentationRestore = () => saved.forEach(({u, health}) => { u.healthTrait.health = health; });
        return { colors, ranks, constructionYardHd: !!hd, constructionYardKeys: Object.keys(r.mainObj?.builder ?? {}),
            conscriptHd: !!conscript?.override, rhinoHd: pip.imageFinder.rhinoHd?.report.status,
            availability: d.gameScreen.generalOptions.graphics.hdAvailability, gl: d.renderer.renderer.getContext().getError() };
    });
    const c = report.presentationCheck;
    assert(c.colors[0].colors.some(([r,g,b]) => r > g * 2 && r > b * 2), 'Low health must be red');
    assert(c.colors[1].colors.some(([r,g,b]) => r > 150 && g > 100 && b < 100), 'Intermediate health must be yellow');
    assert(c.colors[2].colors.every(([r,g,b]) => g > r && g > b), 'Full health must use narrow green pips');
    assert(c.constructionYardHd && c.conscriptHd && c.rhinoHd === 'READY', 'Existing Soviet building and unit HD must be active');
    assert(c.ranks.every(r => r.correctGeometry), 'Veterancy must select rank geometry rather than the medical pip');
    assert.deepEqual(c.ranks.map(r => [r.width, r.height]), [[8, 5], [8, 13]]);
    assert.equal(c.gl, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'hd-health.png') });
    await page.evaluate(() => window.presentationRestore());
    c.status = 'PASS_HD_AND_HEALTH_PALETTE';
}
