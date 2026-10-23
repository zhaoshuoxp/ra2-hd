// Exercise retained RGBA backing through actual GPU uploads and an isolated context restore.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

export async function checkTerrainSourceRecovery(session) {
    const result = await session.page.evaluate(async () => {
        const d = window.__ra2debug;
        const terrain = d.mapRenderable.tileLayer.theater.terrainHd;
        const index = terrain.textures.findIndex(t => t.userData.hdSourceRetention || t.userData.terrainSourceRetention);
        if (index < 0) throw Error('No compressed native terrain source available');
        const texture = terrain.textures[index], expected = terrain.report.groups.filter(g => g.status === 'PUBLISHED')[index].sha256;
        const state = texture.userData.hdSourceRetention ?? texture.userData.terrainSourceRetention;
        if (state.uploads < 1) throw Error('The actual match must have uploaded its retained source');
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 8;
        canvas.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:8px;height:8px';
        document.body.append(canvas);
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!gl) throw Error('Native recovery probe needs WebGL2');
        const extension = gl.getExtension('WEBGL_lose_context');
        if (!extension) throw Error('Native recovery probe lacks context-loss extension');
        const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map(v => v.toString(16).padStart(2, '0')).join('');
        const uploaded = [];
        async function uploadAndReadback() {
            const { width, height } = texture.image;
            const rgba = texture.image.data;
            const sourceHash = await digest(rgba);
            const gpu = gl.createTexture(), framebuffer = gl.createFramebuffer();
            gl.bindTexture(gl.TEXTURE_2D, gpu);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpu, 0);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('Recovery GPU framebuffer incomplete');
            const pixels = new Uint8Array(rgba.byteLength);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const gpuHash = await digest(pixels);
            const error = gl.getError();
            gl.deleteFramebuffer(framebuffer); gl.deleteTexture(gpu);
            // Use the real Three upload callback to release the decoded view.
            texture.needsUpdate = true;
            d.renderer.renderer.initTexture(texture);
            uploaded.push({ sourceHash, gpuHash, glError: error, actualMatchUploads: state.uploads });
        }
        await uploadAndReadback();
        const lost = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error('Recovery context loss timeout')), 5000);
            canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); clearTimeout(timeout); resolve(); }, { once: true });
        });
        extension.loseContext(); await lost;
        // Chromium completes loss-event bookkeeping after dispatch returns.
        // Restoring from its event microtask can leave an unattached probe lost.
        await new Promise(resolve => setTimeout(resolve, 250));
        const restored = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(Error('Recovery context restore timeout')), 15000);
            canvas.addEventListener('webglcontextrestored', () => { clearTimeout(timeout); resolve(); }, { once: true });
        });
        extension.restoreContext(); await restored;
        await uploadAndReadback();
        canvas.remove();
        const gameGlError = d.renderer.renderer.getContext().getError();
        return { expected, uploaded, gameGlError, retainedSource: { ...state },
            disclosure: 'Actual match DataTexture backing, real Three reuploads and an isolated probe context loss/restore. The gameplay context is preserved. Every GPU readback and decompressed source must equal the frozen original atlas hash.' };
    });
    assert.equal(result.gameGlError, 0);
    assert.equal(result.uploaded.length, 2);
    for (const upload of result.uploaded) {
        assert.equal(upload.sourceHash, result.expected);
        assert.equal(upload.gpuHash, result.expected);
        assert.equal(upload.glError, 0);
    }
    session.report.terrainSourceRecovery = { status: 'PASS_ACTUAL_UPLOAD_REUPLOAD_AND_ISOLATED_CONTEXT_RESTORE', ...result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [receipt, output] = process.argv.slice(2);
    process.argv.push('--map=downtown.map', '--bot-slot=1');
    const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
        await page.evaluate(() => {
            const g = window.__ra2debug.generalOptions.graphics;
            g.hdEnabled.value = true; g.hdDensity.value = 4;
        });
    });
    let failure;
    try { await checkTerrainSourceRecovery(session); }
    catch (error) { failure = error; }
    await session.close(failure);
    if (failure) throw failure;
}
