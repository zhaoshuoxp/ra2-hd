// Inspect the actual native output and logical viewport without modifying game code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [stage, referenceFile, output] = process.argv.slice(2);
const reference = JSON.parse(await fs.readFile(referenceFile));
process.argv.push(`--map=${reference.selectedMap}`, '--bot-slot=1');
const session = await startSession(stage, output, reference.edition, false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
});
const sample = () => session.page.evaluate(() => {
    const d = window.__ra2debug, canvas = d.renderer.renderer.domElement;
    return { output: [canvas.width, canvas.height], logical: [d.renderer.width, d.renderer.height],
        preset: d.generalOptions.graphics.renderResolution.value,
        preferred: d.generalOptions.graphics.resolution.value,
        dataset: { ...canvas.dataset }, window: [innerWidth, innerHeight], dpr: devicePixelRatio,
        rect: { width: canvas.getBoundingClientRect().width, height: canvas.getBoundingClientRect().height } };
});
try {
    session.report.reference = { file: referenceFile, graphics: reference.graphics };
    session.report.samples = [{ phase: 'after-start', ...await sample() }];
    for (const preset of ['720p', '1080p']) {
        await session.page.evaluate(preset => { window.__ra2debug.generalOptions.graphics.renderResolution.value = preset; }, preset);
        await session.page.waitForTimeout(250);
        session.report.samples.push({ phase: preset, ...await sample() });
    }
    session.report.status = 'DIAGNOSTIC_ONLY_NATIVE_OUTPUT_RECORDED';
} finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(session.report, null, 2) + '\n');
    await session.close();
}
