// One portable HTML handoff, embedding existing evidence without modifying it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const output=process.argv[2]??'.artifacts/m1-3f/report-v1';
if(!/^\.artifacts\/m1-3f\/report-[a-z0-9-]+$/.test(output))throw Error('Use a bounded Rhino report directory');
await fs.mkdir(output,{recursive:true});
let body=Bun.markdown.html(await fs.readFile('docs/m1-3f-rhino-gameplay.md','utf8'));
const media=[...new Set([...body.matchAll(/(?:src|poster)="([^"]+)"/g)].map(m=>m[1]))];
const allowed=path.resolve('.artifacts/m1-3f/review-v1')+path.sep;
for(const file of media){
    if(!file.startsWith(allowed)||!['.png','.webm'].includes(path.extname(file)))throw Error(`Unexpected media: ${file}`);
    const mime=file.endsWith('.png')?'image/png':'video/webm';
    const data=`data:${mime};base64,${(await fs.readFile(file)).toString('base64')}`;
    body=body.replaceAll(`src="${file}"`,`src="${data}"`).replaceAll(`poster="${file}"`,`poster="${data}"`);
}
if(!body.includes('<video ')||!body.includes('data:video/webm;base64,'))throw Error('Missing embedded video');
await fs.writeFile(`${output}/report.html`, `<!doctype html><html lang="en"><meta charset="utf-8">
<title>M1.3f Rhino illustrated report</title>
<style>body{font:18px/1.55 system-ui;margin:32px;background:#171b22;color:#edf0f5;max-width:1200px}h1{font-size:30px}h2{font-size:25px;margin-top:36px}h3{font-size:21px}a{color:#9ccfff}img,video{display:block;max-width:none}table{border-collapse:collapse;width:100%}td,th{border:1px solid #566070;padding:10px;text-align:left}pre{overflow:auto;padding:16px;background:#252c38}code{font-size:16px}p{max-width:1100px}</style>
${body}</html>`);
console.log(`Embedded ${media.length} existing media files in ${output}/report.html`);
