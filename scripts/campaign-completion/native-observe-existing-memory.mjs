import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

// Attach read-only to an already running task-owned Electron instance. This
// observer never launches, closes, pauses or changes the inspected application.
const profile = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const [port] = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
const browser = await chromium.connectOverCDP('http://127.0.0.1:' + Number(port));
const pages = browser.contexts().flatMap(context => context.pages());
const page = pages.find(page => page.url().startsWith('ra2:')) ?? pages[0];
const cdp = await browser.newBrowserCDPSession();
const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
const renderer = await page.evaluate(() => {
    const d = window.__ra2debug, g = d?.game, graphics = d?.generalOptions.graphics;
    const actors = d?.worldView?.sovietUnitsHd?.report;
    return { mission: g?.campaign?.launch.mission, tick: g?.currentTick, hash: g?.getHash(),
        density: graphics?.hdDensity.value, enabled: graphics?.hdEnabled.value,
        jsHeap: performance.memory && { usedBytes: performance.memory.usedJSHeapSize,
            totalBytes: performance.memory.totalJSHeapSize, limitBytes: performance.memory.jsHeapSizeLimit },
        actors: actors && { bytes: actors.gpuBytes, peakBytes: actors.peakBytes, limitBytes: actors.budget,
            nonReadyFamilies: Object.entries(actors.families).filter(([, family]) => family.status !== 'READY') } };
});
const processRows = execFileSync('/bin/ps', ['-o', 'pid=,ppid=,rss=', '-p', processInfo.map(p => p.id).join(',')],
    { encoding: 'utf8' }).trim().split('\n').map(row => {
        const [pid, parentPid, residentKiB] = row.trim().split(/\s+/).map(Number);
        return { pid, parentPid, residentKiB, type: processInfo.find(process => process.id === pid)?.type };
    });
const report = { status: 'OBSERVED_EXISTING_NATIVE_INSTANCE', observedAt: new Date().toISOString(),
    platform: process.platform, hostPhysicalBytes: os.totalmem(), profile, renderer, processes: processRows,
    summedResidentBytes: processRows.reduce((sum, row) => sum + row.residentKiB * 1024, 0),
    targetPhysicalGiB: renderer.density === 2 ? 8 : 16,
    qualification: 'Process resident sets may count shared pages twice. This read-only snapshot does not establish a target-memory hardware, memory-pressure or Windows result.' };
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, density: renderer.density, tick: renderer.tick,
    residentGiB: report.summedResidentBytes / 2 ** 30, jsHeapGiB: renderer.jsHeap?.usedBytes / 2 ** 30,
    actorMiB: renderer.actors?.bytes / 2 ** 20,
    nonReadyFamilyStatuses: renderer.actors?.nonReadyFamilies.reduce((counts, [, family]) =>
        (counts[family.status] = (counts[family.status] ?? 0) + 1, counts), {}), output }));
// Closing this observer's process disconnects only its own CDP connection.
process.exit(0);
