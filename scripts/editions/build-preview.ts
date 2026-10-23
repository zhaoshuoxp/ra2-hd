// Self-contained design review, deliberately separate from the playable application.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
if (!process.argv[2] || !process.argv[3]) throw Error('Pass the RA2 and Yuri cover image paths');
const out = path.resolve(process.argv[4] ?? '.artifacts/editions/selection-preview');
mkdirSync(out, { recursive: true });
const sources = {
    ra2: path.resolve(process.argv[2]),
    yr: path.resolve(process.argv[3]),
};
const covers = Object.fromEntries(Object.entries(sources).map(([id, file]) => [id, 'data:image/jpeg;base64,' + readFileSync(file).toString('base64')]));
const entry = path.join(out, 'entry.tsx');
writeFileSync(entry, `import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditionSelect } from '${path.resolve('src/gui/component/edition/EditionSelect')}';
function Preview() {
    const [selected, select] = useState();
    return <><EditionSelect covers={${JSON.stringify(covers)}} selected={selected} onSelect={select}/>
        <div className="preview-only" role="status">Interface preview{selected ? ': ' + selected.toUpperCase() + ' selected' : ''}</div></>;
}
createRoot(document.getElementById('preview')).render(<Preview/>);
`);
const build = await Bun.build({ entrypoints: [entry], target: 'browser', minify: true });
if (!build.success) throw new Error(build.logs.join('\n'));
const js = await build.outputs.find(o => o.path.endsWith('.js'))!.text();
const css = await build.outputs.find(o => o.path.endsWith('.css'))!.text();
writeFileSync(path.join(out, 'review.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Game edition selection - interface preview</title><style>html,body{margin:0;background:#110b0a}.preview-only{position:fixed;bottom:8px;left:0;width:100%;text-align:center;color:#988c7d;font:12px Arial;pointer-events:none}${css}</style><div id="preview"></div><script>${js.replaceAll('</script', '<\\/script')}</script></html>`);
console.log(path.join(out, 'review.html'));
