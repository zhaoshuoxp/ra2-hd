import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { installClarityProbe } from './power-plant-clarity-probe.mjs';

export async function runPowerPlantClarity(page, output) {
    await fs.mkdir(output, { recursive: false });
    const report = { status: 'FAIL', scope: 'Explicit diagnostic only; accepted textures and default renderer unchanged', sets: [] };
    const labels = ['unpatched', 'A', 'B', 'C', 'D', 'A-restored'];
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const sourceNames = ['power-plant-clarity-probe.mjs', 'run-power-plant-clarity.mjs', 'run-power-plant-game.mjs'];
    const identity = { checkout: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sources: {} };
    for (const name of sourceNames) {
        const bytes = await fs.readFile(`scripts/m1/${name}`);
        identity.sources[name] = hash(bytes);
        await fs.writeFile(`${output}/source-${name}`, bytes);
    }
    await fs.writeFile(`${output}/source-identity.json`, JSON.stringify(identity, null, 2) + '\n');
    try {
        await page.evaluate(() => {
            window.__ra2debug.unitSelection.deselectAll();
            window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k';
        });
        await page.waitForFunction(() => {
            const r = window.__ra2debug.renderableManager.getRenderableByGameObject(window.__m12Plant);
            return [...r.animObjects.values()].flat().some(m => m.get3DObject()?.visible
                && m.builder.frameOffset === 3 && m.builder.getFrame() === 2);
        });
        await page.evaluate(installClarityProbe);
        async function capture(name, full = false, targetFrame) {
            const cases = await page.evaluate(async ({ full, targetFrame }) => {
                const currentFrame = () => {
                    const r = window.__ra2debug.renderableManager.getRenderableByGameObject(window.__m12Plant);
                    return [...r.animObjects.values()].flat().find(m => m.get3DObject()?.visible && m.builder.frameOffset === 3)?.builder.getFrame();
                };
                while (targetFrame !== undefined && currentFrame() !== targetFrame)
                    await new Promise(requestAnimationFrame);
                return window.__m12aProbe.captureAll(full);
            }, { full, targetFrame });
            const reference = cases[0];
            for (const entry of cases) {
                assert.equal(entry.tick, reference.tick);
                assert.deepEqual(entry.camera, reference.camera);
                assert.deepEqual(entry.body, reference.body);
                assert.deepEqual(entry.active, reference.active);
                assert.equal(entry.glError, 0);
                assert(entry.cropLogical[0] >= 0 && entry.cropLogical[1] >= 0, 'Camera crop left the viewport');
                assert.deepEqual(entry.gpu, reference.gpu);
            }
            assert.equal(cases[0].png, cases[1].png, 'Unpatched versus diagnostic A mismatch');
            assert.equal(cases[1].png, cases[5].png, 'Control did not restore exactly');
            for (const [i, entry] of cases.entries()) {
                const bytes = Buffer.from(entry.png.split(',')[1], 'base64');
                const file = `${name}-${labels[i]}.png`;
                if (i > 0 && i < 5) await fs.writeFile(`${output}/${file}`, bytes);
                entry.file = file; entry.sha256 = hash(bytes); delete entry.png;
                if (entry.full) {
                    await fs.writeFile(`${output}/${name}-full.png`, Buffer.from(entry.full.split(',')[1], 'base64'));
                    delete entry.full;
                }
            }
            report.sets.push({ name, cases });
            // No experimental shader remains installed between sampled game frames.
            await page.evaluate(() => window.__m12aProbe.restore());
            return reference.active?.frame;
        }
        await capture('normal-4k', true, 2);
        report.textureFrames = await page.evaluate(() => window.__m12aTextureDump);
        for (const frame of report.textureFrames) {
            for (const [role, data] of Object.entries(frame.values))
                await fs.writeFile(`${output}/${frame.member}-${String(frame.frame).padStart(3, '0')}-${role}.rgba`, Buffer.from(data, 'base64'));
            delete frame.values;
        }
        await page.evaluate(() => window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p');
        await capture('normal-1080p');
        await page.evaluate(() => window.__ra2debug.generalOptions.graphics.renderResolution.value = '4k');
        async function sequence(prefix, count, moving = false) {
            let previous = -1;
            for (let i = 0; i < count; i++) {
                if (moving) {
                    await page.mouse.move(i < count / 2 ? 1918 : 2, 540);
                    await page.waitForTimeout(60);
                    await page.mouse.move(1400, 900);
                }
                await page.waitForFunction(previous => {
                    const r = window.__ra2debug.renderableManager.getRenderableByGameObject(window.__m12Plant);
                    return [...r.animObjects.values()].flat().some(m => m.get3DObject()?.visible && m.builder.frameOffset === 3
                        && m.builder.getFrame() !== previous);
                }, previous);
                const start = prefix.startsWith('damaged') ? 8 : 0;
                const target = previous < 0 ? start : start + (previous - start + 1) % 8;
                previous = await capture(`${prefix}-${String(i).padStart(2, '0')}`, false, target);
            }
            if (moving) await page.mouse.move(1400, 900);
        }
        await sequence('normal-stationary', 16);
        await sequence('normal-moving', 8, true);
        await page.evaluate(() => {
            const d = window.__ra2debug;
            d.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 3, window.__m12Plant.id);
        });
        await page.waitForFunction(() => window.__m12Plant.healthTrait.health < 48, undefined, { timeout: 60000 });
        await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 11));
        await page.waitForTimeout(500);
        await capture('damaged-4k', true, 8);
        await sequence('damaged-stationary', 8);
        await sequence('damaged-moving', 8, true);
        report.status = 'PASS_DIAGNOSTIC_CAPTURE_ONLY';
    } finally {
        await page.evaluate(() => window.__m12aProbe?.restore()).catch(() => {});
        await fs.writeFile(`${output}/result.json`, JSON.stringify(report, null, 2) + '\n');
    }
    return { status: report.status, output, setCount: report.sets.length };
}
