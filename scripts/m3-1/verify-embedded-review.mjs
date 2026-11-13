import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..'), read = async file => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const receipt = await read('.artifacts/m3-1/embedded-review-receipt.json');
const htmlBytes = await fs.readFile(path.join(root, receipt.output)), html = htmlBytes.toString('utf8');
assert.equal(htmlBytes.length, receipt.bytes); assert.equal(sha(htmlBytes), receipt.sha256);
assert(!/<script\b|<iframe\b|<object\b/i.test(html));
const embedded = [...html.matchAll(/\b(src|href)="([^"]+)"/g)].map(([, attribute, value]) => {
    assert(value.startsWith('data:')); const match = /^data:([^;]+);base64,(.*)$/.exec(value); assert(match);
    const bytes = Buffer.from(match[2], 'base64'); return { attribute, mime: match[1], bytes: bytes.length, sha256: sha(bytes) };
});
for (const source of receipt.sourceFiles) {
    const bytes = await fs.readFile(path.join(root, source.path));
    assert.equal(bytes.length, source.bytes); assert.equal(sha(bytes), source.sha256);
    assert(embedded.some(row => row.bytes === source.bytes && row.sha256 === source.sha256), source.path);
}
assert.equal(embedded.filter(row => row.mime.startsWith('image/')).length, receipt.images);
assert.equal(embedded.filter(row => row.mime.startsWith('video/')).length, receipt.videos);
const current = await read('docs/m3-1-interface-bridge.json');
const imagePackaging = await read(current.validation.imagePackaging.path);
assert.equal(imagePackaging.images.length, receipt.images); assert(imagePackaging.images.every(row => row.decodedPixelEquality));
const runtime = await read('.artifacts/m3-1/review-runtime/package.json');
assert.equal(runtime.sourceHead, current.source.runtimeHead);
const finalAcceptance = current.finalAcceptance ? await read(current.finalAcceptance.path) : undefined;
if (finalAcceptance) {
    assert.equal(finalAcceptance.source.runtimeHead, runtime.sourceHead);
    assert.equal(current.review.newInterfaceUserAcceptance, 'ACCEPTED');
    assert.deepEqual(receipt.sourceFiles.filter(file => file.isImage || file.isVideo)
        .map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })), finalAcceptance.approvedMedia);
}
const build = await read('.artifacts/m3-1/review-runtime/build.json');
for (const file of build.web) {
    const bytes = await fs.readFile(path.join(root, '.artifacts/m3-1/review-runtime/dist', file.path));
    assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
}
let desktopFiles = 0;
for (const name of await fs.readdir(path.join(root, 'desktop'))) {
    if (/\.(mjs|cjs|json)$/.test(name) && name !== 'app-files.json') {
        assert.equal(sha(await fs.readFile(path.join(root, 'desktop', name))),
            sha(await fs.readFile(path.join(root, '.artifacts/m3-1/review-runtime/desktop', name)))); desktopFiles++;
    }
}
const result = { schemaVersion: 1, status: 'PASS_SELF_CONTAINED_NATIVE_MEDIA_AND_EVIDENCE',
    userAcceptance: finalAcceptance?.status ?? 'PENDING', approvedNativeMediaUnchanged: !!finalAcceptance,
    gallery: { path: receipt.output, bytes: receipt.bytes, sha256: receipt.sha256 },
    media: { images: receipt.images, videos: receipt.videos, documents: embedded.filter(row => row.attribute === 'href').length,
        allEmbeddedBytesMatchSource: true, decodedPixelIdenticalImages: imagePackaging.images.length,
        menuVideoFullyDecoded: (await read(current.validation.menuVideo.path)).status,
        acceptedResultVideoFullyDecoded: (await read(current.validation.resultVideo.path)).status },
    nativeRuntime: { head: runtime.sourceHead, webFiles: build.web.length, desktopFiles, allHashesMatch: true },
    browserRender: { status: 'NOT_RUN_NO_CONNECTED_TAB',
        reason: 'The existing supported in-app browser connection returned an empty tab list during this update despite ambient file-page context. No alternate navigation/server/browser bypass was used.',
        boundary: 'Static embedding integrity, native clip decode and actual native interface/bridge screenshots are verified; browser playback remains user review.' } };
await fs.writeFile(path.join(root, '.artifacts/m3-1/embedded-review-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
