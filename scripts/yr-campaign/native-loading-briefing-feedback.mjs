import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const missions = ['sov01umd', 'sov02smd', 'sov03umd', 'sov04dmd', 'sov05umd', 'sov06lmd', 'sov07tmd',
    'all01umd', 'all02umd', 'all03umd', 'all04dmd', 'all05umd', 'all06umd', 'all07smd'];
const report = { status: 'RUNNING', errors: [], failedResources: [], layouts: [],
    scope: 'Actual native loading component for all fourteen missions and three locale resources. Read-only source artwork; no simulation, goal or media-completion credit.' };
let session;
try {
    session = await campaignSession(out, report, { edition: 'yr', density: 4 });
    const { page } = session;
    await page.evaluate(() => {
        const screen = window.__ra2debug.mainMenuController.screens.get(22);
        const factory = screen.rootController.screens.get(1).loadingScreenApiFactory, create = factory.create.bind(factory);
        window.__briefingFactory = factory;
        window.__briefingOriginalCreate = create;
        factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async () => { await start(); window.__briefingInitialApi = api; await new Promise(() => {}); };
            return api;
        };
    });
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('sov01umd.map'));
    await page.waitForFunction(() => window.__briefingInitialApi && document.querySelector('[data-campaign-loading]'), undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const factory = window.__briefingFactory;
        factory.create = window.__briefingOriginalCreate; window.__briefingInitialApi.dispose();
    });
    const languages = await Promise.all(['en-US', 'zh-CN', 'zh-TW'].map(async language => ({ language,
        labels: { ...JSON.parse(await fs.readFile(`public/res/locale/retail-yr-${language}.json`)).labels,
            ...JSON.parse(await fs.readFile(`public/res/locale/${language}.json`)) } })));
    for (const [width, height] of [[1440, 900], [1280, 800]]) {
        await session.app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
        for (const mission of missions) for (const locale of languages) {
            const layout = await page.evaluate(async ({ mission, locale }) => {
                const d = window.__ra2debug, factory = window.__briefingFactory;
                const api = factory.create(4), originalStrings = api.strings;
                api.strings = { get: key => locale.labels[key.toLowerCase()] ?? originalStrings.get(key) };
                document.documentElement.lang = locale.language; api.setCampaignMission(mission + '.map', 'yr');
                window.__briefingReviewApi = api; await api.start();
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                const frame = document.querySelector('[data-campaign-loading-frame]'), node = document.querySelector('[data-campaign-load-briefing]');
                const text = node.querySelector('[data-campaign-briefing-text]'), range = document.createRange();
                range.selectNodeContents(text);
                const bounds = frame.getBoundingClientRect(), scale = bounds.width / frame.clientWidth;
                const originX = (frame.clientWidth - 800) / 2, originY = (frame.clientHeight - 520) / 2;
                const lines = [...range.getClientRects()].filter(r => r.width > 0).map(r => ({
                    left: (r.left - bounds.left) / scale - originX, top: (r.top - bounds.top) / scale - originY,
                    right: (r.right - bounds.left) / scale - originX, bottom: (r.bottom - bounds.top) / scale - originY }));
                return { mission, language: locale.language, width: node.clientWidth, lines, text: text.textContent,
                    flow: api.presentation.hd?.briefingFlow, ui: d.uiArt.metrics() };
            }, { mission, locale });
            report.layouts.push({ viewport: [width, height], ...layout });
            assert.equal(layout.width, 319); assert(layout.lines.length > 0);
            assert(layout.lines.every(l => l.left >= 19.5 && l.right <= 340));
            assert(layout.lines.every(l => l.bottom < (mission === 'sov06lmd' ? 246 : 336)), 'The visible text must finish above its source faction emblem');
            const spec = JSON.parse(await fs.readFile(`.local/campaign/yr/${mission}/interface-hd.json`));
            const match = /^M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)V([\d.]+)L([\d.]+) ([\d.]+)/.exec(spec.loading.layout.projection);
            const [rx, ty, lx, uy, ly, , by] = match.slice(1).map(Number);
            const boundary = y => y < ty ? rx : y <= uy ? rx + (lx-rx)*(y-ty)/(uy-ty)
                : y <= ly ? lx : y <= by ? lx+(rx-lx)*(y-ly)/(by-ly || 1) : rx;
            assert(layout.lines.every(l => l.right + 2 < Math.min(boundary(l.top), boundary(l.bottom))),
                'Every actual line fragment must leave the original projection unobstructed');
            if (width === 1440 && locale.language === 'zh-CN' && ['all02umd', 'sov06lmd'].includes(mission))
                await page.screenshot({ path: path.join(out, `native-loading-${mission}-${locale.language}.png`) });
            await page.evaluate(() => { window.__briefingReviewApi.dispose(); delete window.__briefingReviewApi; });
            await fs.writeFile(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
        }
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_ALL_FOURTEEN_YR_LOADING_BRIEFINGS_THREE_LANGUAGES_TWO_VIEWPORTS_WITH_SOURCE_PROJECTION_AND_EMBLEM_CLEARANCE';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await session?.page.evaluate(() => window.__briefingReviewApi?.dispose()).catch(() => {});
    await session?.app.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ status: report.status, error: report.error, layouts: report.layouts.length }));
