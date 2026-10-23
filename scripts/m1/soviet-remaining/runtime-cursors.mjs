import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function reviewCursors(page, output) {
    const directory = path.join(output, 'cursors'); await fs.mkdir(directory);
    const frames = await page.evaluate(() => {
        const d = window.__ra2debug, screen = d.gameScreen, sprite = screen.pointer.getSprite();
        screen.uiAnimationLoop.stop();
        const rows = [];
        for (const [name, start, count] of [['nuke',319,10],['iron',346,5],['chrono',357,12],['storm',279,20],['default',0,1]]) {
            for (let phase = 0; phase < count; phase++) {
                const row = { name, frame: start + phase, phase, count, logical: sprite.getSize(), variants: [] };
                for (const enabled of [false, true]) {
                    d.generalOptions.graphics.hdEnabled.value = enabled;
                    sprite.drawFrame(start + phase);
                    const c = sprite.targetContext.canvas;
                    row.variants.push({ enabled, buffer: [c.width,c.height], css: [c.style.width,c.style.height], image: c.toDataURL('image/png') });
                }
                rows.push(row);
            }
        }
        d.generalOptions.graphics.hdEnabled.value = true;
        sprite.drawFrame(sprite.getFrame());
        return rows;
    });
    for (const row of frames) {
        for (const variant of row.variants) {
            const density = variant.enabled && row.name !== 'default' ? 4 : 1;
            assert.deepEqual(variant.buffer, [row.logical.width*density,row.logical.height*density]);
            assert.deepEqual(variant.css, ['55px','43px']);
            const file = `${row.name}-${row.phase}-${variant.enabled ? 'hd' : 'original'}.png`;
            await fs.writeFile(path.join(directory,file),Buffer.from(variant.image.split(',')[1],'base64'));
            variant.file = file;
        }
        if (row.name === 'default') assert.equal(row.variants[0].image,row.variants[1].image);
        else assert.notEqual(row.variants[0].image,row.variants[1].image);
        for (const variant of row.variants) delete variant.image;
    }
    const report = { status: 'PASS_COMPLETE_HD_CURSOR_CYCLES', authoredFrames: 47, logical: [55,43], hotspot: [27,21],
        density: 4, defaultUnchanged: true, globalHdToggle: 'PASS', frames };
    await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(report,null,2)+'\n');
    return report;
}
