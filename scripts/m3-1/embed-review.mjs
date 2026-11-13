import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const templateFile = path.join(root, 'docs/m3-1-review.html');
const output = path.join(root, '.artifacts/m3-1/M3.1-Embedded-Review.html');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const acceptance = JSON.parse(await fs.readFile(path.join(root, 'docs/m3-1-soviet01-acceptance.json'), 'utf8'));
const presentationFile = path.join(root, 'docs/m3-1-presentation-acceptance.json');
const presentation = JSON.parse(await fs.readFile(presentationFile, 'utf8'));
const score = JSON.parse(await fs.readFile(path.join(root, 'docs/m3-1-score-presentation.json'), 'utf8'));
const feedback = JSON.parse(await fs.readFile(path.join(root, 'docs/m3-1-feedback-corrections.json'), 'utf8'));
const current = JSON.parse(await fs.readFile(path.join(root, 'docs/m3-1-interface-bridge.json'), 'utf8'));
const template = await fs.readFile(templateFile, 'utf8');
const sources = new Map();
const pattern = /\b(src|href)="([^"#][^"]*)"/g;
for (const [, attribute, relative] of template.matchAll(pattern)) {
    if (sources.has(relative)) continue;
    const filename = path.resolve(path.dirname(templateFile), relative);
    if (!filename.startsWith(root + path.sep) || await fs.realpath(filename) !== filename) {
        throw new Error(`Unsafe embedded review source: ${relative}`);
    }
    const bytes = await fs.readFile(filename);
    const hash = sha(bytes);
    const isImage = attribute === 'src' && /\.(png|jpg|gif|webp)$/.test(filename);
    const isVideo = attribute === 'src' && filename.endsWith('.webm');
    if (isImage || isVideo) {
        const expected = [...acceptance.screenshots, ...(acceptance.videos ?? []), ...presentation.screenshots,
            ...presentation.references, presentation.video, ...score.screenshots, ...score.videos,
            ...feedback.screenshots, ...feedback.videos, ...current.screenshots, ...current.videos]
            .find(row => path.resolve(root, row.path) === filename);
        if (!expected || expected.bytes !== bytes.length || expected.sha256 !== hash) {
            throw new Error(`Review media differs from its recorded source identity: ${relative}`);
        }
    }
    const mime = isImage ? filename.endsWith('.webp') ? 'image/webp' : 'image/png'
        : isVideo ? 'video/webm' : filename.endsWith('.json') ? 'application/json' : 'text/markdown';
    sources.set(relative, { filename, bytes: bytes.length, sha256: hash, isImage, isVideo,
        data: `data:${mime};base64,${bytes.toString('base64')}` });
}
const html = template.replace(pattern, (_, attribute, relative) => {
    const item = sources.get(relative);
    return `${attribute}="${item.data}"${attribute === 'href' ? ` download="${path.basename(item.filename)}"` : ''}`;
}).replace("img-src data: 'self'", 'img-src data:').replace("media-src data: 'self'", 'media-src data:');
if ([...html.matchAll(pattern)].some(([, , value]) => !value.startsWith('data:'))) {
    throw new Error('Generated review still has an external dependency');
}
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, html);
const receipt = { schemaVersion: 1, status: 'SELF_CONTAINED_SCREENSHOTS_VERIFIED',
    scope: 'Self-contained native HD campaign interface and bridge initialization/repair review, with prior artwork/results and frozen gameplay evidence. User acceptance is recorded separately in the final acceptance receipt.',
    output: path.relative(root, output), bytes: Buffer.byteLength(html), sha256: sha(html),
    images: [...sources.values()].filter(item => item.isImage).length,
    videos: [...sources.values()].filter(item => item.isVideo).length,
    sourceFiles: [...sources.values()].map(({ filename, data: _data, ...item }) => ({ path: path.relative(root, filename), ...item })),
    copyrightedPayload: 'Embedded captures and documents stay in ignored local artifacts, outside source commits.' };
await fs.writeFile(path.join(path.dirname(output), 'embedded-review-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ output, bytes: receipt.bytes, images: receipt.images, sha256: receipt.sha256 }));
