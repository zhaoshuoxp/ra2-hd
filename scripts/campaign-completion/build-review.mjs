import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.resolve(process.argv[2] ?? '../project-history/ra2-campaign-completion-20261026/Review/Soviet03-Review-r1.html');
const configuration = process.argv.find(value => value.startsWith('--config='))?.slice(9);
const config = configuration ? JSON.parse(await fs.readFile(configuration, 'utf8')) : undefined;
const escape = text => String(text).replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const figures = config?.figures ?? [
    ['Authored loading page', 'sov03-loading-native-r2/native-loading-1440x900.png',
        'Actual native Mac loading screen. Approved photograph direction; source state borders and arrow restored. Shared accepted emblem and chrome reused. Full loading/user visual acceptance remains pending.'],
    ['Original objective-chain victory', 'sov03-mission-r13/native-original-victory.png',
        'Actual original Soviet 03 victory at tick 22508, Original rendering. Assisted ordinary commands and accelerated simulation; no modified rules, triggers, health or objectives. The initial approach was reconstructed from its ordinary recorded command prefix.'],
    ['Real named save after restart', 'sov03-mission-r13/native-beacon-restored-after-restart.png',
        'Actual beacon-defense save, restored after a complete Mac application restart. World, tick, RNG, mission variables, teams, timer and callbacks match; 180 further ticks match the reference. Original rendering.'],
    ['HD beacon binding inspection', 'sov03-resources-4x-r3/napsyb.png',
        'Explicit diagnostic inspection at 4X from the real mid-mission checkpoint. Shroud is revealed for asset inspection. This view is not presented as an unmodified gameplay screenshot. Source/palette/frame-identical accepted complete beacon family is reused.'],
    ['Vehicle paradrop inspection', 'sov03-resources-4x-r3/source-vehicle-paradrop-mtnk-3464.png',
        'Explicit diagnostic inspection at 4X of actual source-spawned tanks from the saved attack wave. Ordinary physical descent, original common PARACH animation, ground shadow and attack inhibition are visible. The common parachute effect is retained Original artwork; this is not a newly authored HD effect.'],
    ['Source radar communication', 'sov03-lifecycle-r5/native-source-yuri-after-war-factory.png',
        'Actual original Yuri movie action after ordinary war-factory construction and the original eight-second delay. Normal direct-selection run; the player can skip it and the radar returns afterward.'],
];
const records = [], sections = [];
const categories = [...new Set(figures.map(figure => figure[3]).filter(Boolean))];
const sectionId = category => 'section-' + categories.indexOf(category);
let previousCategory;
for (const [title, relative, caption, category] of figures) {
    const directory = path.resolve(root, config?.sourceRoot ?? '.artifacts/campaign-completion');
    const source = path.resolve(directory, relative);
    if (!source.startsWith(directory + path.sep)) throw Error('Review source exceeds its declared directory');
    const bytes = await fs.readFile(source), lossless = config?.imageFormat === 'webp-lossless';
    const { width, height } = PNG.sync.read(bytes);
    const embedded = execFileSync('python3', ['-c', lossless
        ? "from PIL import Image,ImageChops; import io,sys; im=Image.open(sys.argv[1]).convert('RGB'); out=io.BytesIO(); im.save(out,format='WEBP',lossless=True,method=6); payload=out.getvalue(); decoded=Image.open(io.BytesIO(payload)).convert('RGB'); assert im.size==decoded.size and ImageChops.difference(im,decoded).getbbox() is None; sys.stdout.buffer.write(payload)"
        : "from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.stdout.buffer,format='JPEG',quality=93,subsampling=0,optimize=True)", source], { maxBuffer: 16 * 1024 * 1024 });
    records.push({ title, file: relative, sourcePngSha256: createHash('sha256').update(bytes).digest('hex'),
        embeddedSha256: createHash('sha256').update(embedded).digest('hex'), category,
        ...(!lossless ? { embeddedJpegSha256: createHash('sha256').update(embedded).digest('hex') } : {}),
        codec: lossless ? 'WEBP_LOSSLESS_PIXEL_VERIFIED' : 'JPEG93', dimensionsPreserved: true, width, height });
    if (category && category !== previousCategory) {
        sections.push(`<h2${config?.navigation ? ` id="${sectionId(category)}"` : ''}>${escape(category)}</h2>`);
        previousCategory = category;
    }
    sections.push(`<figure><h3>${escape(title)}</h3><div class="image-wrap"><img width="${width}" height="${height}" loading="lazy" src="data:image/${lossless ? 'webp' : 'jpeg'};base64,${embedded.toString('base64')}" alt="${escape(title)}"></div><button onclick="this.parentElement.querySelector('img').classList.toggle('native-size')">Native pixels / fit</button><figcaption>${escape(caption)}</figcaption></figure>`);
}
const title = config?.title ?? 'RA2 Soviet 03: current working-main review';
const tables = (config?.tables ?? []).map(table => `<h2>${escape(table.title)}</h2><div class="image-wrap"><table><thead><tr>`
    + table.headers.map(value => `<th>${escape(value)}</th>`).join('') + '</tr></thead><tbody>'
    + table.rows.map(row => '<tr>' + row.map(value => `<td>${escape(value)}</td>`).join('') + '</tr>').join('')
    + '</tbody></table></div>').join('');
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + `<title>${escape(title)}</title><style>body{max-width:1500px;margin:32px auto;padding:0 24px;background:#111;color:#eee;font:18px/1.55 system-ui}h1{font-size:32px}h2{font-size:26px}h3{font-size:23px}figure{margin:32px 0;padding-top:16px;border-top:1px solid #555}.image-wrap{overflow:auto;max-width:100%}img{display:block;max-width:100%;height:auto}img.native-size{max-width:none}button{font:inherit;margin-top:10px;background:#292929;color:#eee;border:1px solid #777;border-radius:4px;padding:6px 12px}table{border-collapse:collapse;width:100%;font-size:18px}th,td{text-align:left;vertical-align:top;border:1px solid #555;padding:10px}th{background:#252525}figcaption{max-width:1100px;margin:12px 0;color:#ccc}code{color:#ffbda9}</style>`
    + `<h1>${escape(title)}</h1>`
    + (config ? config.paragraphs.map(text => `<p>${escape(text)}</p>`).join('') : '<p>Technical checks and user visual acceptance are separate. This self-contained page is an interim review of Soviet 03; completion of all remaining original RA2 campaigns continues. YR missions remain unavailable. Native Windows has not been tested on this Mac.</p>'
    + '<p>Use the normal canonical-main desktop entry: <code>bun run desktop:start</code> from the ra2-hd repository. The older frozen M3.2 app/ZIP does not include this working-main checkpoint. No new app package is produced for this interim review.</p>'
    + '<p>Known limits: exact retail recruitment, aircraft-entry position and build-activity scan cadence remain qualified compatibility details. The original CASIN01W stop-sign placement has no matching image in the original archives; no guessed art is substituted. Existing common Original effects remain distinguishable from the newly authored loading art and source-identical HD actor/environment families.</p>'
    ) + (config?.navigation ? '<nav aria-label="Review contents"><h2>Review contents</h2><ul>'
        + categories.map(category => `<li><a style="color:#9dd4ff" href="#${sectionId(category)}">${escape(category)}</a></li>`).join('')
        + '</ul></nav>' : '') + tables + sections.join('') + '</html>';
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, html, { flag: 'wx' });
await fs.writeFile(output.replace(/\.html$/, '.json'), JSON.stringify({ review: path.basename(output), figures: records,
    acceptance: 'TECHNICAL_EVIDENCE_RECORDED_USER_FULL_VISUAL_REVIEW_PENDING', platform: 'MAC_NATIVE_WINDOWS_NOT_RUN' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ review: output, bytes: Buffer.byteLength(html), figures: records.length }));
