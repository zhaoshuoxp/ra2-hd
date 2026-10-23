import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { recordNativePage } from './record-native-page.mjs';

/** Inspect actual film structure, not merely a colored scan crossing the former erasure. */
export async function inspectRegisteredHome(page, out, name, record = false) {
    await page.locator('[data-radar-footage=retail]').waitFor({ timeout: 30000 });
    const samples = [], times = [.6, .9, 1.2, 1.5, 7.1, 7.5, 8, 8.7, 9.9, 14.5, 15, 16, 21.8, 22.2, 23, 27.5];
    for (const time of times) {
        const sample = await page.evaluate(async time => {
            const video = document.querySelector('[data-retail-menu-video]'); video.pause();
            if (Math.abs(video.currentTime - time) > .001) await new Promise(resolve => {
                video.addEventListener('seeked', resolve, { once: true }); video.currentTime = time;
            });
            const c = document.querySelector('[data-retail-menu-footage]'), gl = c.getContext('webgl');
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            const read = () => {
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                const data = new Uint8Array(c.width * c.height * 4); gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
                return data;
            };
            gl.uniform1f(gl.getUniformLocation(program, 'movieTime'), video.currentTime);
            gl.uniform1f(gl.getUniformLocation(program, 'cycleDuration'), video.duration);
            gl.uniform1i(gl.getUniformLocation(program, 'movie'), 0);
            const full = read();
            if (!window.__r5ReferencePixels) {
                const image = await createImageBitmap(await (await fetch('/res/presentation/menu-retail-reference-r3.png')).blob());
                const canvas = document.createElement('canvas'); canvas.width = 632; canvas.height = 570;
                const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); image.close();
                window.__r5ReferencePixels = context.getImageData(0, 0, 632, 570).data;
                const guard = await createImageBitmap(await (await fetch('/res/presentation/menu-retail-glyph-guard-r5.png')).blob());
                context.drawImage(guard, 0, 0); guard.close();
                window.__r5GuardPixels = context.getImageData(0, 0, 632, 570).data;
            }
            const stamped = document.createElement('canvas'); stamped.width = 632; stamped.height = 570;
            const context = stamped.getContext('2d'); context.drawImage(video, 0, 0);
            gl.activeTexture(gl.TEXTURE0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stamped);
            const control = read(), pixels = context.getImageData(0, 0, 632, 570);
            let stampedPixels = 0;
            for (let y = 107; y <= 302; y++) for (let x = 75; x <= 558; x++) {
                const i = (y * 632 + x) * 4, ref = window.__r5ReferencePixels;
                const guard = window.__r5GuardPixels;
                const guarded = [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => guard[i + (dy * 632 + dx) * 4] === 0));
                if (guarded && Math.max(ref[i + 1], ref[i + 2]) > 24) {
                    pixels.data.set([255, 0, 255, 255], i); stampedPixels++;
                }
            }
            context.putImageData(pixels, 0, 0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stamped);
            const contamination = read(); let glyphInfluence = 0, worstPixel = 0;
            for (let i = 0; i < control.length; i++) if (Math.abs(control[i] - contamination[i]) > glyphInfluence) {
                glyphInfluence = Math.abs(control[i] - contamination[i]); worstPixel = Math.floor(i / 4);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            gl.uniform1i(gl.getUniformLocation(program, 'movie'), 1); const scan = read();
            const region = ([x0, y0, x1, y1]) => {
                let contribution = 0, edge = 0, alpha = 0, total = 0, count = 0;
                for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                    const i = ((c.height - 1 - y) * c.width + x) * 4;
                    alpha = Math.max(alpha, full[i + 3]); total += full[i + 3]; count++;
                    for (let channel = 0; channel < 3; channel++) {
                        const value = full[i + channel] * full[i + 3] / 255;
                        contribution = Math.max(contribution, Math.abs(value - scan[i + channel] * scan[i + 3] / 255));
                        edge = Math.max(edge, Math.abs(value - full[i + 4 + channel] * full[i + 7] / 255));
                    }
                }
                return { movieContribution: contribution, movieEdge: edge, maxAlpha: alpha, meanAlpha: total / count };
            };
            const result = { time: video.currentTime, glyphInfluence, stampedPixels,
                worstPixel: [worstPixel % c.width, c.height - 1 - Math.floor(worstPixel / c.width)], width: c.width, height: c.height,
                aboveTitle: region([580, 80, 1120, 158]), formerLeft: region([515, 160, 610, 235]),
                formerRight: region([1060, 160, 1195, 235]) };
            gl.uniform1i(gl.getUniformLocation(program, 'movie'), 0); read(); return result;
        }, time);
        samples.push(sample);
        await fs.writeFile(path.join(out, `${name}-home-samples.json`), JSON.stringify(samples, null, 2) + '\n');
        assert(sample.glyphInfluence <= 2, 'Original opaque lettering/wing pixels must not leak into any output pixel');
        if ([.9, 1.2, 7.5, 9.9, 15, 21.8, 22.2].includes(time))
            await page.screenshot({ path: path.join(out, `${name}-home-${time}.png`) });
    }
    for (const region of ['aboveTitle', 'formerLeft', 'formerRight']) {
        assert(Math.max(...samples.map(s => s[region].movieContribution)) > 40, `${region} must reveal actual cinematic image values`);
        assert(Math.max(...samples.map(s => s[region].movieEdge)) > 8, `${region} must contain filmed edges, not a flat color fill`);
        assert(Math.min(...samples.map(s => s[region].meanAlpha)) < 5, `${region} must fade back to the dark map`);
    }
    const result = { status: 'PASS_REGISTERED_ORIGINAL_FILM_ABOVE_AND_BESIDE_HD_TITLE', samples };
    if (record) {
        await page.locator('[data-retail-menu-video]').evaluate(video => {
            video.currentTime = .1; void video.play(); window.__movieCycleTimes = [];
            video.addEventListener('timeupdate', () => window.__movieCycleTimes.push(video.currentTime));
        });
        const stop = await recordNativePage(page, path.join(out, 'home-native-compositor.webm'));
        await page.waitForTimeout(31500); result.recording = await stop();
        result.playbackTimes = await page.evaluate(() => window.__movieCycleTimes);
        assert(result.playbackTimes.some((t, i, a) => i && t + 20 < a[i - 1]), 'Playback must cross a complete original movie loop');
    }
    await fs.writeFile(path.join(out, `${name}-home-report.json`), JSON.stringify(result, null, 2) + '\n');
    return result;
}
