import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { errors: [], failedResources: [], scope: 'Read-only Original loading-SHP inspection; loading held before world construction.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 0 }));
    await page.evaluate(() => {
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory); factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...args) => { await start(...args); window.__heldLoading = api; await new Promise(() => {}); };
            return api;
        };
        window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('trn01t.map');
    });
    await page.waitForFunction(() => !!window.__heldLoading, undefined, { timeout: 90000 });
    const result = await page.evaluate(() => {
        const p = window.__heldLoading.presentation;
        return ['progressHousing', 'progressFill'].map(name => {
            const frame = p.sprites[name].frames[0], canvas = document.createElement('canvas');
            canvas.width = frame.width; canvas.height = frame.height; canvas.getContext('2d').putImageData(frame, 0, 0);
            return { name, png: canvas.toDataURL('image/png'), width: frame.width, height: frame.height, hd: !!p.hd };
        });
    });
    for (const image of result) {
        await fs.writeFile(path.join(out, image.name + '.png'), Buffer.from(image.png.split(',')[1], 'base64'));
        delete image.png;
    }
    report.sprites = result;
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
} finally { await app?.close(); }
console.log(JSON.stringify(report));
