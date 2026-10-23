import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ResultBannerLettering, resultLetteringRevision } from '../../src/gui/screen/game/component/ResultBannerLettering';

const output = path.resolve(process.argv[2]);
await mkdir(output, { recursive: false });
const previousR2 = process.argv.includes('--previous-r2');
const previousR3 = process.argv.includes('--previous-r3');
const previousR4 = process.argv.includes('--previous-r4');
const previousCommit = previousR4 ? 'b2a635b4' : previousR3 ? '1e57dd33' : previousR2 ? 'ef43c5cd' : '86eeb663';
const previousPath = previousR2 || previousR3 || previousR4 ? 'src/gui/screen/game/component/ResultBannerLettering.tsx'
    : 'src/gui/screen/game/component/LocalizedGameResultBanner.tsx';
const previousSource = execFileSync('git', ['show', `${previousCommit}:${previousPath}`], { encoding: 'utf8' });
const previousFile = path.join(output, 'previous-banner-source.tsx');
await writeFile(previousFile, previousSource);
const previousModule = await import(pathToFileURL(previousFile).href);
const Previous = previousR2 || previousR3 || previousR4 ? previousModule.ResultBannerLettering : previousModule.LocalizedGameResultBanner;
const rows = [];
for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
    const ui = JSON.parse(await readFile(`public/res/locale/${language}.json`, 'utf8'));
    const labels = { ...JSON.parse(await readFile(`public/res/locale/retail-yr-${language}.json`, 'utf8')).labels,
        ...Object.fromEntries(Object.entries(ui).map(([key, value]) => [key.toLowerCase(), value])) };
    for (const [slot, key] of ['hd:missionaccomplished', 'hd:missionfailed', 'txt_victorious', 'txt_lost'].entries()) {
        const props = { victory: slot % 2 === 0, mission: slot < 2, text: labels[key] };
        const previous = renderToStaticMarkup(<Previous {...props} rasterScale={4}/>, { identifierPrefix: `previous-${language}-${slot}-` });
        rows.push({ language, slot, ...props,
            current: renderToStaticMarkup(<ResultBannerLettering {...props}/>, { identifierPrefix: `${language}-${slot}-` }),
            previous: previous.match(/<svg[\s\S]*?<\/svg>/)![0]
                .replaceAll('result-banner-gold', `previous-gold-${language}-${slot}`) });
    }
}
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const document = { status: 'PRODUCTION_COMPONENT_MARKUP_EXPORTED', revision: resultLetteringRevision,
    source: 'src/gui/screen/game/component/ResultBannerLettering.tsx',
    sourceSha256: digest(await readFile('src/gui/screen/game/component/ResultBannerLettering.tsx')),
    previousCommit, previousLabel: previousR4 ? 'R4' : previousR3 ? 'R3' : previousR2 ? 'R2' : 'Previous HD', previousSourceSha256: digest(previousSource), rows };
await writeFile(path.join(output, 'lettering.json'), JSON.stringify(document, null, 2) + '\n');
const disclaimer = { status: 'USER_ACCEPTED_AND_INTEGRATED_IN_GAME_STARTUP', languages: {} };
for (const language of ['zh-CN', 'en-US']) {
    const file = `public/res/locale/${language}.json`;
    const values = JSON.parse(await readFile(file, 'utf8'));
    disclaimer.languages[language] = { source: file, key: 'ts:disclaimer', text: values['ts:disclaimer'] };
}
await writeFile(path.join(output, 'startup-disclaimer-copy.json'), JSON.stringify(disclaimer, null, 2) + '\n');
console.log(JSON.stringify({ status: document.status, rows: rows.length, sourceSha256: document.sourceSha256 }));
