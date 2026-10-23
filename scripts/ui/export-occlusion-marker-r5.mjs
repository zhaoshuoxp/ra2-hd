import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { _electron as electron } from '@playwright/test';

const [input, output] = process.argv.slice(2), out = path.resolve(output);
await fs.mkdir(out);
const original = JSON.parse(await fs.readFile(path.join(input, 'ra2-behind.json')));
const source = await fs.readFile('src/engine/renderable/entity/OcclusionMarkerArt.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const app = await electron.launch({ args: [path.resolve('scripts/ui/feedback-art-shell.mjs')] });
try {
    const page = await app.firstWindow();
    await page.addScriptTag({ content: `(() => { const exports = {}; ${code}; window.occlusionArt = exports; })();` });
    const result = await page.evaluate(original => {
        const comparison = document.createElement('canvas'); comparison.width = 1280; comparison.height = 1000;
        const c = comparison.getContext('2d'); c.fillStyle = '#242f2a'; c.fillRect(0, 0, 1280, 1000);
        c.fillStyle = 'white'; c.font = '24px sans-serif'; c.fillText('Actual BEHIND indicator: original / R5 straight faces', 24, 36);
        const palette = { getColor: i => original.palette[i] }, frames = [];
        for (const frame of original.frames) {
            const image = { ...frame, imageData: frame.pixels };
            const canvas = document.createElement('canvas'); canvas.width = frame.width + frame.width % 2; canvas.height = frame.height + frame.height % 2;
            const g = canvas.getContext('2d'), rgba = g.createImageData(canvas.width, canvas.height);
            frame.pixels.forEach((index, i) => {
                if (!index) return;
                const color = palette.getColor(index), x = i % frame.width, y = Math.floor(i / frame.width);
                rgba.data.set([color.r, color.g, color.b, 255], (y * canvas.width + x) * 4);
            });
            g.putImageData(rgba, 0, 0);
            const hd = window.occlusionArt.occlusionMarkerCanvas(image, palette), arrows = window.occlusionArt.occlusionMarkerArrows(image, palette);
            const alpha = hd.getContext('2d').getImageData(0, 0, hd.width, hd.height).data;
            let partial = 0;
            for (let i = 3; i < alpha.length; i += 4) if (alpha[i] > 0 && alpha[i] < 255) partial++;
            frames.push({ frame: frame.frame, arrows: arrows.length, bodyVertices: arrows.map(a => a.body.length),
                logical: [canvas.width, canvas.height], pixels: [hd.width, hd.height], partialCoverage: partial,
                originalPng: canvas.toDataURL().split(',')[1], hdPng: hd.toDataURL().split(',')[1] });
            const row = [1, 6, 12, 17].indexOf(frame.frame);
            if (row >= 0) {
                const y = 95 + row * 225;
                c.fillText(`Frame ${frame.frame}`, 24, y);
                c.imageSmoothingEnabled = false; c.drawImage(canvas, 200, y + 20, canvas.width * 4, canvas.height * 4);
                c.imageSmoothingEnabled = true; c.drawImage(hd, 700, y + 20);
            }
        }
        return { comparison: comparison.toDataURL().split(',')[1], frames };
    }, original);
    await fs.writeFile(path.join(out, 'comparison.png'), Buffer.from(result.comparison, 'base64'));
    for (const row of result.frames) for (const role of ['original', 'hd']) {
        const key = role + 'Png';
        await fs.writeFile(path.join(out, `frame-${row.frame}-${role}.png`), Buffer.from(row[key], 'base64')); delete row[key];
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify({
        sourceHash: original.sourceHash, paletteSourceHash: original.paletteSourceHash,
        method: 'Four native convex arrow silhouettes, fitted planar native-palette faces, 16X coverage reduced to 4X. No redesigned symbols.', frames: result.frames,
    }, null, 2) + '\n');
    console.log(JSON.stringify({ frames: result.frames.length, arrows: result.frames.map(f => f.arrows) }));
} finally { await app.close(); }
