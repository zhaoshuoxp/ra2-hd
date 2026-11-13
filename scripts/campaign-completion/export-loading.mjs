import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { vectorPaths } from '../art/palette-contours.mjs';
import { closeLoadingDiagramBoundaries, loadingGeographicDiagram, prepareLoadingFocusRaster } from './loading-focus-raster.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const configFile = path.resolve(process.argv[2]);
const config = JSON.parse(await fs.readFile(configFile));
const edition = config.edition;
if (!(edition === 'ra2' && /^(sov|all|trn)\d{2}[tsu]\.map$/.test(config.mission)
    || edition === 'yr' && /^(sov|all)0[1-7][usdtl]md\.map$/.test(config.mission)))
    throw Error('Original campaign mission identity required');
const mission = config.mission.slice(0, -4), resolve = value => path.resolve(path.dirname(configFile), value);
const stageArgument = process.argv.find(value => value.startsWith('--stage='))?.slice(8);
const stage = stageArgument && path.resolve(stageArgument);
if (config.layoutTestOnly && !stage) throw Error('A specialized layout probe cannot be published');
if (stage) await fs.mkdir(stage, { recursive: false });
const resourceRoot = path.resolve(process.argv.find(value => value.startsWith('--resource-root='))?.slice(16)
    ?? path.join(root, '.local'));
const directory = path.join(resourceRoot, 'campaign', edition, mission);
const workArgument = process.argv.find(value => value.startsWith('--work-dir='))?.slice(11);
const work = workArgument ? path.resolve(workArgument)
    : stage ? path.join(stage, 'work') : path.join(root, '.artifacts/campaign-completion', mission + '-loading-export');
const output = stage ? path.join(stage, 'files') : directory, shared = path.join(resourceRoot, 'campaign/ra2/sov01t');
await fs.mkdir(work, { recursive: true });
if (stage) await fs.mkdir(output);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file));
const manifest = await read(path.join(directory, 'manifest.json'));
const presentation = await fs.readFile(path.join(directory, 'presentation.json'));
const originalPresentation = JSON.parse(presentation);
const catalog = manifest.catalog.find(entry => entry.edition === edition && entry.filename === config.mission);
if (!catalog) throw Error('Mission is absent from its original campaign catalog');
const faction = catalog.faction === 'training' ? 'tutorial' : catalog.faction;
if (config.faction && config.faction !== faction) throw Error('Source campaign faction mismatch');
const nativeImage = originalPresentation.sprites.mission;
if (config.source?.member !== nativeImage.image || config.source.palette !== nativeImage.palette
    || !originalPresentation.sources.some(source => source.name === nativeImage.image && source.sha256 === config.source.sha256)
    || !originalPresentation.sources.some(source => source.name === nativeImage.palette && source.sha256 === config.source.paletteSha256))
    throw Error('Original loading source or palette mismatch');
const originalSource = await fs.readFile(resolve(config.original));
if (sha(originalSource) !== config.originalPngSha256) throw Error('Original loading image identity changed');
const source = PNG.sync.read(originalSource), rects = config.rects;
if (source.width !== 800 || source.height !== 520 || !Array.isArray(rects)
    || rects.length < 2 || rects.length > 4 || !Array.isArray(config.photos)
    || config.photos.length !== rects.length) throw Error('Invalid original loading plane');
const tacticalPhotoIndex = rects.length - 1;
const sourceReceipt = manifest.files.find(file => file.name === 'presentation.json');
if (sourceReceipt.sha256 !== sha(presentation)) throw Error('Prepared presentation identity changed');
const layout = config.layout ?? { focus: [348, 57, 284, 282], frame: [347, 54, 287, 286],
    pipe: 'M634 174H716V266M234 414H542', projection: 'M347 54L247 144V177L347 340M247 144H281V177H247',
    tacticalClip: 'M637 266H780V508H542V342H637Z', frameInk: '#ff5900', pipeInk: '#ff4900' };
if (faction !== 'soviet' && !config.layout) throw Error('Loading requires explicit original layout and colors');
for (const rect of [layout.focus, layout.frame, ...rects]) {
    if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)
        || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0
        || rect[0] + rect[2] > 800 || rect[1] + rect[3] > 520) throw Error('Invalid original loading rectangle');
}
if (![layout.frameInk, layout.pipeInk].every(value => /^#[0-9a-f]{6}$/i.test(value))
    || ![layout.pipe, layout.projection, layout.tacticalClip].every(value => value.length < 4096 && /^[MLHVZ0-9 .,-]+$/.test(value)))
    throw Error('Invalid loading layout path or ink');
if (!/^M\s*\d+(?:\.\d+)?[ ,]+\d/.test(layout.tacticalClip)) throw Error('Tactical clip requires two separate move coordinates');
const masters = await Promise.all(config.photos.map(async name => {
    const bytes = await fs.readFile(resolve(name)), image = PNG.sync.read(bytes);
    return { name, sha256: sha(bytes), width: image.width, height: image.height };
}));
const acceptedUiPhotos = config.acceptedUiPhotos ?? [];
if (!Array.isArray(acceptedUiPhotos) || acceptedUiPhotos.length > rects.length
    || new Set(acceptedUiPhotos.map(item => item.index)).size !== acceptedUiPhotos.length)
    throw Error('Invalid accepted UI photo reuse declaration');
for (const reuse of acceptedUiPhotos) {
    if (edition !== 'yr' || !Number.isInteger(reuse.index) || reuse.index < 0 || reuse.index >= tacticalPhotoIndex)
        throw Error('Accepted UI photo reuse scope mismatch');
    const selected = await read(path.join(resourceRoot, 'ui-selection.json'));
    const parent = path.join(resourceRoot, 'ui-packs', selected.revision);
    const bytes = await fs.readFile(path.join(parent, 'manifest.json'));
    if (selected.reviewOnly || selected.revision !== reuse.revision || selected.sha256 !== reuse.manifestSha256
        || sha(bytes) !== selected.sha256) throw Error('Accepted UI photo selection mismatch');
    const asset = JSON.parse(bytes).assets.find(asset => asset.id === reuse.id);
    if (!asset || asset.logicalWidth !== 60 || asset.logicalHeight !== 48 || asset.overlay
        || path.resolve(parent, asset.file) !== resolve(config.photos[reuse.index])
        || asset.sha256 !== masters[reuse.index].sha256 || asset.sha256 !== reuse.sha256
        || asset.width !== masters[reuse.index].width || asset.height !== masters[reuse.index].height)
        throw Error('Accepted UI photo payload mismatch');
}
let worldPreparation, worldPayload;
if (config.worldPreparation) {
    const preparationFile = resolve(config.worldPreparation.file), bytes = await fs.readFile(preparationFile);
    worldPreparation = JSON.parse(bytes);
    if (sha(bytes) !== config.worldPreparation.sha256
        || worldPreparation.schema !== 'source-pinned-campaign-world-preparation-v1'
        || worldPreparation.atlasSha256 !== 'cac525710da77cac0c9be65917bf60c195f4934c1ca22f3701d42f857f0059f8'
        || worldPreparation.originalPngSha256 !== config.originalPngSha256
        || ['member', 'sha256', 'palette', 'paletteSha256'].some(key => worldPreparation.source?.[key] !== config.source[key])) {
        throw Error('Loading world source identity mismatch');
    }
    const { asset, binding } = worldPreparation;
    const point = (p, width, height) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
        && p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height;
    if (binding?.schema !== 'campaign-world-backdrop-v1' || !/^interface-world-[a-z0-9-]+\.png$/.test(binding.file)
        || binding.width !== 1915 || binding.height !== 821 || asset?.file !== binding.file
        || asset.width !== binding.width || asset.height !== binding.height
        || !Number.isFinite(binding.scale) || binding.scale < .4 || binding.scale > 1
        || !point(binding.sourceLocator, 1915, 821) || !point(binding.nativeLocator, 800, 520)
        || binding.sourceLocator[0] < 155
        || !point(binding.gridOrigin, 800, 520) || !Array.isArray(binding.gridStep) || binding.gridStep.length !== 2
        || !binding.gridStep.every(step => Number.isFinite(step) && step >= 80 && step <= 320)
        || !/^#[0-9a-f]{6}$/.test(binding.gridInk)) {
        throw Error('Loading world registration mismatch');
    }
    worldPayload = await fs.readFile(path.join(path.dirname(preparationFile), asset.file));
    const decoded = PNG.sync.read(worldPayload);
    if (worldPayload.length !== asset.bytes || sha(worldPayload) !== asset.sha256
        || decoded.width !== binding.width || decoded.height !== binding.height) throw Error('Loading world payload mismatch');
}
let photoDirectionApproval;
if (config.photoDirectionApproval) {
    const bytes = await fs.readFile(resolve(config.photoDirectionApproval.file)), approval = JSON.parse(bytes);
    if (sha(bytes) !== config.photoDirectionApproval.sha256 || approval.status !== 'USER_DIRECTION_APPROVED'
        || !approval.questionItemId || !Array.isArray(approval.masters)
        || JSON.stringify(approval.masters.map(master => master.sha256).sort())
            !== JSON.stringify(masters.map(master => master.sha256).sort())) throw Error('Loading photo direction approval mismatch');
    photoDirectionApproval = config.photoDirectionApproval;
}
let productionAuthorization;
if (config.productionAuthorization) {
    const bytes = await fs.readFile(resolve(config.productionAuthorization.file)), authorization = JSON.parse(bytes);
    const consolidated = authorization.status === 'USER_REQUESTS_ONE_CONSOLIDATED_REVIEW_AFTER_REMAINING_PRODUCTION'
        && authorization.scope?.edition === edition && authorization.scope?.reviewMode === 'consolidated-after-production';
    const yrScope = edition === 'yr' && authorization.schema === 'yr-campaign-art-direction-authorization-v1'
        && authorization.faithfulReconstructionAuthorized === true && authorization.missions.includes(config.mission)
        && authorization.userVisualAcceptance === 'PENDING';
    if (sha(bytes) !== config.productionAuthorization.sha256 || !consolidated && !yrScope)
        throw Error('Consolidated production authorization mismatch');
    productionAuthorization = config.productionAuthorization;
}
let emblem, emblemSource;
if (config.emblemReuse) {
    const reuse = config.emblemReuse;
    if (edition !== 'yr' || !productionAuthorization || reuse.edition !== 'ra2'
        || reuse.mission !== (faction === 'allied' ? 'all01t.map' : 'sov01t.map'))
        throw Error('Accepted loading emblem reuse scope mismatch');
    const parent = path.join(resourceRoot, 'campaign/ra2', reuse.mission.slice(0, -4));
    const bytes = await fs.readFile(path.join(parent, reuse.file));
    const parentSpec = await read(path.join(parent, 'interface-hd.json'));
    const parentManifest = await read(path.join(parent, 'manifest.json'));
    const pin = parentManifest.files.find(file => file.name === reuse.file);
    if (reuse.file !== parentSpec.loading.file || !pin || pin.sha256 !== sha(bytes) || pin.sha256 !== reuse.sha256)
        throw Error('Accepted loading emblem payload mismatch');
    const text = bytes.toString();
    const fragment = faction === 'soviet' ? text.match(/<image\b[^>]*\/>/g)?.at(-1)
        : text.match(/<svg x="[\s\S]*?<\/svg>/)?.[0];
    const dimensions = fragment && ['x', 'y', 'width', 'height'].map(name => Number(fragment.match(new RegExp(`\\b${name}="([0-9.]+)"`))?.[1]));
    const rect = reuse.rect;
    if (!fragment || !dimensions?.every(Number.isFinite) || !Array.isArray(rect) || rect.length !== 4
        || !rect.every(Number.isFinite) || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0
        || rect[0] + rect[2] > 800 || rect[1] + rect[3] > 520) throw Error('Accepted loading emblem geometry mismatch');
    const [x, y, width, height] = dimensions;
    emblem = `<g transform="translate(${rect[0]} ${rect[1]}) scale(${rect[2]/width} ${rect[3]/height}) translate(${-x} ${-y})">${fragment}</g>`;
    emblemSource = { reuse, parentInterfaceSha256: sha(await fs.readFile(path.join(parent, 'interface-hd.json'))) };
} else if (faction === 'soviet') {
    const accepted = await fs.readFile(path.join(shared, 'interface-loading-vector.svg'), 'utf8');
    emblem = accepted.match(/<image\b[^>]*\/>/g)?.at(-1);
    if (!emblem?.includes('data:image/png;base64,')) throw Error('Accepted shared Soviet emblem is unavailable');
} else {
    const spec = config.emblem;
    if (!spec || !stage && !(faction === 'tutorial' ? productionAuthorization : spec.directionApproval))
        throw Error(faction === 'allied' ? 'Approved Allied emblem required for publication'
            : 'Source-qualified emblem authorization required for publication');
    if (!stage && faction === 'allied') {
        if (typeof spec.directionApproval !== 'object' || !spec.directionApproval.file
            || !/^[a-f0-9]{64}$/.test(spec.directionApproval.sha256))
            throw Error('Allied emblem direction approval receipt is invalid');
        const approvalBytes = await fs.readFile(resolve(spec.directionApproval.file));
        const approval = JSON.parse(approvalBytes);
        if (sha(approvalBytes) !== spec.directionApproval.sha256 || approval.status !== 'USER_DIRECTION_APPROVED'
            || approval.scope !== 'RA2_ALLIED_LOADING_EMBLEM' || approval.masterSha256 !== spec.sha256
            || !approval.questionItemId) throw Error('Allied emblem direction approval is pending or mismatched');
    }
    const bytes = await fs.readFile(resolve(spec.file)), image = PNG.sync.read(bytes);
    const [x, y, width, height] = spec.rect ?? [];
    if (sha(bytes) !== spec.sha256 || ![x, y, width, height].every(Number.isFinite)
        || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 800 || y + height > 520
        || image.width < width * 4 || image.height < height * 4
        || !image.data.some((value, index) => index % 4 === 3 && value === 0)) throw Error('Allied emblem identity, detail or transparency mismatch');
    if (spec.registration) {
        const registrationBytes = await fs.readFile(resolve(spec.registration.file));
        const registration = JSON.parse(registrationBytes);
        const [left, top, frameWidth, frameHeight] = registration.masterFrame ?? [];
        if (sha(registrationBytes) !== spec.registration.sha256
            || registration.schema !== 'source-pinned-loading-emblem-clip-v1'
            || registration.masterSha256 !== spec.sha256 || registration.originalPngSha256 !== config.originalPngSha256
            || JSON.stringify(registration.nativeBounds) !== JSON.stringify(spec.rect)
            || ![left, top, frameWidth, frameHeight].every(Number.isFinite)
            || left < 0 || top < 0 || frameWidth < width * 4 || frameHeight < height * 4
            || left + frameWidth > image.width || top + frameHeight > image.height
            || typeof registration.clipPath !== 'string' || registration.clipPath.length > 300000
            || !/^[MLQZ0-9 .,-]+$/.test(registration.clipPath)) throw Error('Allied emblem silhouette registration mismatch');
        emblem = `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${left} ${top} ${frameWidth} ${frameHeight}" preserveAspectRatio="none">`
            + `<defs><clipPath id="allied-emblem"><path fill-rule="evenodd" clip-rule="evenodd" d="${registration.clipPath}"/></clipPath></defs>`
            + `<image width="${image.width}" height="${image.height}" clip-path="url(#allied-emblem)" href="data:image/png;base64,${bytes.toString('base64')}"/></svg>`;
    } else {
        if (!stage) throw Error('Verified Allied emblem silhouette required for publication');
        emblem = `<image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/png;base64,${bytes.toString('base64')}"/>`;
    }
    emblemSource = { ...spec, width: image.width, height: image.height };
}
const [focusX, focusY, focusWidth, focusHeight] = layout.focus;
const focusNeutralMinimum = config.focusNeutralMinimum ?? 160, focusNeutralStroke = config.focusNeutralStroke ?? 0;
if (!Number.isInteger(focusNeutralMinimum) || focusNeutralMinimum < 64 || focusNeutralMinimum > 160
    || !Number.isFinite(focusNeutralStroke) || focusNeutralStroke < 0 || focusNeutralStroke > .75)
    throw Error('Invalid original neutral contour reconstruction');
const outlineArrowInk = config.outlineArrowInk ?? (faction === 'allied' ? 'cyan' : 'red');
if (config.outlineArrowInk !== undefined && (!['cyan', 'red', 'blue'].includes(config.outlineArrowInk)
    || !Array.isArray(config.outlineArrow) || config.outlineArrow.length !== 4
    || !config.outlineArrow.every(Number.isFinite)
    || config.outlineArrow[0] < 0 || config.outlineArrow[1] < 0
    || config.outlineArrow[2] <= 0 || config.outlineArrow[3] <= 0
    || config.outlineArrow[0] + config.outlineArrow[2] > focusWidth
    || config.outlineArrow[1] + config.outlineArrow[3] > focusHeight))
    throw Error('Invalid original arrow declaration');
const focus = new PNG({ width: focusWidth, height: focusHeight });
PNG.bitblt(source, focus, focusX, focusY, focusWidth, focusHeight, 0, 0);
const diagram = edition === 'yr' ? loadingGeographicDiagram(focus) : undefined;
const focusArtwork = await prepareLoadingFocusRaster(config, focus, resolve, work, diagram?.symbols);
for (let i = 0; i < focus.data.length; i += 4) {
    const [r, g, b] = focus.data.subarray(i, i + 3);
    const x = i / 4 % focusWidth, y = Math.floor(i / 4 / focusWidth);
    const blueArrowRegion = outlineArrowInk === 'blue' && config.outlineArrow
        && x >= config.outlineArrow[0] && y >= config.outlineArrow[1]
        && x < config.outlineArrow[0] + config.outlineArrow[2]
        && y < config.outlineArrow[1] + config.outlineArrow[3];
    const blueArrow = blueArrowRegion && b > 220 && r >= 12 && r < 80 && g >= 32 && g < 96;
    const color = diagram ? diagram.color([r, g, b], x, y) : Math.max(r, g, b) < 40 ? [0, 0, 0]
        : blueArrow ? [20, 48, 252]
        : blueArrowRegion && Math.min(r, g, b) > 48 ? [0, 0, 0]
        : edition === 'yr' && r > 100 && b > 140 && g < 90 && r > g * 1.5 && b > g * 1.5 ? [192, 0, 252]
        : faction === 'tutorial' && r <= 12 && g >= 12 && b >= 32 && g > r * 2 ? [4, 128, 0]
        : faction === 'allied' && b > 180 && g > 100 && r < 100 ? [0, 160, 252]
        : b > r * 1.25 && b > g * 1.25 ? config.focusInkMode && b < 225 && g > 10 ? [12, 28, 192] : [0, 0, 252]
        : r > g * 1.5 && r > b * 1.5 ? config.focusInkMode && r < 220 ? [188, 32, 0] : [252, 0, 0]
        : g > r * 1.1 && g > b * 1.1 ? [4, 128, 0]
        : Math.max(r, g, b) > focusNeutralMinimum && (Math.max(r, g, b) > 160 || Math.min(r, g, b) > 48)
            ? [184, 204, 216] : [0, 0, 0];
    const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 100;
    focus.data.set(focusArtwork?.suppressNeutral(x, y) && neutral ? [0, 0, 0] : color, i);
}
if (diagram && !focusArtwork) closeLoadingDiagramBoundaries(focus, diagram.colors.white);
const contours = vectorPaths(focus, (x, y) => x < 3 || y < 3 || x >= focusWidth - 3 || y >= focusHeight - 3,
    { tolerance: diagram ? 1.35 : 1.15, cornerRadius: diagram ? .85 : .9, minimumArea: 4 });
let tutorialBadge = '';
if (faction === 'tutorial') {
    const [x, y, width, height] = config.tutorialBadge ?? [];
    if (![x, y, width, height].every(Number.isSafeInteger) || width !== 74 || height !== 94)
        throw Error('Original training badge registration is required');
    const rifleMask = new PNG({ width, height });
    for (let ry = 8; ry < 61; ry++) for (let rx = 8; rx < width - 8; rx++) {
        const at = ((y + ry) * source.width + x + rx) * 4;
        if (Math.max(...source.data.subarray(at, at + 3)) < 48)
            rifleMask.data.set([255, 255, 255, 255], (ry * width + rx) * 4);
    }
    const rifles = vectorPaths(rifleMask, undefined, { tolerance: .55, cornerRadius: .5, minimumArea: 1 });
    if (!rifles.length) throw Error('Original crossed-rifle symbol is absent');
    tutorialBadge = `<g transform="translate(${x} ${y})"><defs><linearGradient id="training-field" x1="0" y1="0" x2=".8" y2="1">`
        + '<stop stop-color="#dce8fa"/><stop offset=".4" stop-color="#73c3f2"/><stop offset="1" stop-color="#779acc"/></linearGradient></defs>'
        + '<path d="M0 0H74V52L37 94L0 52Z" fill="#e5e9f4" stroke="#c0c8df" stroke-width="1"/>'
        + '<path d="M7 7H67V49L37 83L7 49Z" fill="url(#training-field)"/>'
        + [40, -40].map((angle, index) => `<g transform="translate(37 35) rotate(${angle})${index ? ' scale(-1 1)' : ''}" fill="#050a16">`
            + '<path d="M-1-30H1V-9H2V7L3.8 16V27Q2 29-2.8 28L-3 16L-1 7H-2V-8H-1Z"/>'
            + '<path d="M-2-24H2V-22H-2ZM-2-14H2V-9H-2ZM1-4Q4-1 5 5L2.8 6L1 1Z"/>'
            + '<path d="M-1 1Q-5 0-4 5Q-3 8 0 6" fill="none" stroke="#050a16" stroke-width="1.1" stroke-linecap="round"/>'
            + '</g>').join('') + '</g>';
}
const arrowOutlines = [];
if (config.outlineArrow) {
    const [left, top, width, height] = config.outlineArrow, mask = new PNG({ width, height });
    const ink = new Uint8Array(width * height), outside = new Uint8Array(width * height), pending = [];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = ((top + y + focusY) * source.width + left + x + focusX) * 4;
        const [r, g, b] = source.data.subarray(i, i + 3);
        ink[y * width + x] = Number(outlineArrowInk === 'blue'
            ? b > 220 && r >= 12 && r < 80 && g >= 32 && g < 96
            : outlineArrowInk === 'cyan' ? b > 180 && g > 100 && r < 100
            : r > 120 && r > g * 1.5 && r > b * 1.5);
        if (!x || !y || x === width - 1 || y === height - 1) pending.push([x, y]);
    }
    while (pending.length) {
        const [x, y] = pending.pop();
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = y * width + x;
        if (outside[i] || ink[i]) continue;
        outside[i] = 1; pending.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
    // Fill internal tank-symbol holes for the outer outline only. The actual
    // source symbol remains in the cartographic foreground underneath it.
    for (let i = 0; i < ink.length; i++) if (!outside[i]) mask.data.set([255, 255, 255, 255], i * 4);
    arrowOutlines.push(`<g transform="translate(${left} ${top})" fill="none" stroke="#d8e0e8" stroke-width="1.25">`
        + vectorPaths(mask, undefined, { tolerance: 1, cornerRadius: .5, minimumArea: 12 })
            .map(p => `<path d="${p.d}"/>`).join('') + '</g>');
}
execFileSync('python3', ['-c', `
from PIL import Image
from pathlib import Path
import json,sys
config=json.loads(sys.argv[1]); work=Path(sys.argv[2]); base=Path(sys.argv[3])
reuse={item['index'] for item in config.get('acceptedUiPhotos',[])}
for density in [2,4]:
 for index,(filename,rect) in enumerate(zip(config['photos'],config['rects'])):
  image=Image.open(base/filename).convert('RGB'); size=(rect[2]*density,rect[3]*density)
  required=(rect[2]*2,rect[3]*2) if index in reuse else size
  assert image.width>=required[0] and image.height>=required[1],('Insufficient authored detail',filename,image.size,required)
  if index in reuse and (image.width<size[0] or image.height<size[1]):
   image.save(work/f'photo-{index}-{density}x.png')
  else:
   image.resize(size,Image.Resampling.LANCZOS).save(work/f'photo-{index}-{density}x.png')
`, JSON.stringify(config), work, path.dirname(configFile)]);
const files = [], payloads = new Map();
const assetStem = config.assetRevision ? `interface-loading-${config.assetRevision}` : 'interface-loading';
if (!/^interface-loading(?:-[a-z0-9-]+)?$/.test(assetStem)) throw Error('Invalid loading asset revision');
for (const density of [2, 4]) {
    const focusRaster = await focusArtwork?.render(density);
    const photos = await Promise.all(rects.map(async ([x, y, width, height], index) =>
        `<image x="${x}" y="${y}" width="${width}" height="${height}" ${index === tacticalPhotoIndex ? 'clip-path="url(#tactical-photo)" ' : ''}`
        + `href="data:image/png;base64,${(await fs.readFile(path.join(work, `photo-${index}-${density}x.png`))).toString('base64')}"/>`));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${800 * density}" height="${520 * density}" viewBox="0 0 800 520">`
        + `<defs><clipPath id="tactical-photo"><path d="${layout.tacticalClip}"/></clipPath>`
        + `<clipPath id="focus-plane"><rect width="${focusWidth}" height="${focusHeight}"/></clipPath></defs>`
        + (focusRaster?.context ?? '')
        + `<path d="${layout.pipe}" fill="none" stroke="${layout.pipeInk}" stroke-width="14"/>`
        + `<g transform="translate(${focusX} ${focusY})" clip-path="url(#focus-plane)"><rect width="${focusWidth}" height="${focusHeight}" fill="#000"/>`
        + (focusRaster?.focus ?? (diagram ? diagram.land + diagram.symbols.backplates : ''))
        + contours.map(p => `<path fill="${p.fill}" fill-rule="evenodd"${p.fill === '#b8ccd8' && focusNeutralStroke
            ? ` stroke="${p.fill}" stroke-width="${focusNeutralStroke}" stroke-linejoin="round"` : ''} d="${p.d}"/>`).join('') + arrowOutlines.join('') + '</g>'
        + tutorialBadge + photos.join('') + `<rect x="${layout.frame[0]}" y="${layout.frame[1]}" width="${layout.frame[2]}" height="${layout.frame[3]}" fill="none" stroke="${layout.frameInk}" stroke-width="4"/>`
        + (edition === 'yr' ? rects.slice(0, tacticalPhotoIndex).map(([x, y, width, height]) =>
            `<rect x="${x-.5}" y="${y-.5}" width="${width+1}" height="${height+1}" fill="none" stroke="#bec0b8" stroke-width=".85"/>`).join('')
            + `<path d="${layout.tacticalClip}" fill="none" stroke="#a4a7a0" stroke-width=".85"/>` : '')
        + `<path d="${layout.projection}" fill="none" stroke="${layout.frameInk}" stroke-width="1.7"/>`
        + emblem + '</svg>';
    const name = `${assetStem}-${density}x.svg`, bytes = Buffer.from(svg);
    payloads.set(name, bytes);
    files.push({ name, bytes: bytes.length, sha256: sha(bytes), route: `/local-campaign/${edition}/${mission}/${name}` });
}
const sharedHdBytes = await fs.readFile(path.join(shared, 'interface-hd.json'));
const sharedHd = JSON.parse(sharedHdBytes), sharedManifest = await read(path.join(shared, 'manifest.json'));
const sharedSelection = sharedManifest.files.find(file => file.name === sharedHd.selection.file);
if (!sharedSelection || !sharedManifest.files.some(file => file.name === 'interface-hd.json' && file.sha256 === sha(sharedHdBytes)))
    throw Error('Accepted shared interface identity mismatch');
const sharedSelectionBytes = await fs.readFile(path.join(shared, sharedSelection.name));
if (sharedSelection.bytes !== sharedSelectionBytes.length || sharedSelection.sha256 !== sha(sharedSelectionBytes))
    throw Error('Accepted shared selection dependency mismatch');
if (edition === 'yr') {
    const parentPresentation = await read(path.join(shared, 'presentation.json'));
    for (const role of ['title', 'progressHousing', 'progressFill']) {
        const sprite = originalPresentation.sprites[role], parentSprite = parentPresentation.sprites[role];
        if (JSON.stringify(sprite) !== JSON.stringify(parentSprite)) throw Error('Shared loading chrome geometry mismatch');
        for (const name of [sprite.image, sprite.palette]) {
            const source = originalPresentation.sources.find(source => source.name === name);
            if (!source || !parentPresentation.sources.some(parent => parent.name === name && parent.sha256 === source.sha256
                && parent.bytes === source.bytes)) throw Error('Shared loading chrome source mismatch: ' + name);
        }
    }
}
const bundle = { ...sharedHd, revision: config.revision, edition, mission: config.mission, originalPresentationSha256: sha(presentation),
    loading: { file: `${assetStem}-2x.svg`, width: 1600, height: 1040, logical: [800, 520], foreground: true,
        variants: files.map((file, index) => ({ file: file.name, density: index ? 4 : 2 })), originalPhotoRects: rects,
        method: faction === 'soviet' ? 'Original focus geography reconstructed as continuous vector contours; independent authored photos; accepted shared Soviet emblem and chrome'
            : `Original ${faction} focus geography, ink and layout; independent authored photos; source-qualified emblem and accepted shared chrome`,
        masters, ...(acceptedUiPhotos.length ? { acceptedUiPhotos,
            inheritedPhotoDetail: 'Accepted 240x192 cameo payloads supply the unchanged 2X active UI surface. The 4X vector review export retains their native raster extent without pixel upscaling or new artwork credit.' } : {}),
        ...(focusArtwork ? { focusRaster: focusArtwork.source } : {}),
        ...(diagram ? { sourceDiagram: { colors: diagram.colors, qualification: diagram.qualification } } : {}),
        ...(emblemSource ? { faction, layout, emblem: emblemSource } : {}),
        ...(config.outlineArrowInk !== undefined ? { outlineArrowInk } : {}),
        ...(worldPreparation ? { world: worldPreparation.binding } : {}) }, policy: 'Existing 2X active UI surface and 16 MiB budget; independent 4X export retained. Accepted shared resources are unchanged.' };
if (edition === 'yr') {
    delete bundle.selection;
    bundle.loadingOnly = true;
    bundle.policy += ' Loading-only artwork. Public edition selection retains the accepted common RA2 presentation.';
}
const bytes = Buffer.from(JSON.stringify(bundle) + '\n'), name = 'interface-hd.json';
payloads.set(name, bytes);
files.push({ name, bytes: bytes.length, sha256: sha(bytes), route: `/local-campaign/${edition}/${mission}/${name}` });
if (edition === 'ra2') files.push(sharedSelection);
if (worldPreparation) {
    const name = worldPreparation.asset.file;
    payloads.set(name, worldPayload);
    files.push({ name, bytes: worldPayload.length, sha256: sha(worldPayload), route: `/local-campaign/${edition}/${mission}/${name}` });
}
manifest.files = [...manifest.files.filter(file => !files.some(next => next.name === file.name)), ...files];
if (manifest.files.length > 256) throw Error('Loading export exceeds the campaign manifest file limit');
payloads.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
const receipt = { mission: config.mission, revision: config.revision, acceptance: 'PHOTO_DIRECTION_ACCEPTED_FULL_LOADING_AND_RUNTIME_REVIEW_PENDING',
    configSha256: sha(await fs.readFile(configFile)), originalPngSha256: config.originalPngSha256,
    source: config.source, files, masters, rects, vectorPaths: contours.length,
    ...(edition === 'yr' ? { sourceWorldLocator: config.sourceWorldLocator } : {}),
    ...(focusArtwork ? { focusRaster: focusArtwork.source } : {}),
    ...(acceptedUiPhotos.length ? { acceptedUiPhotos, inheritedPhotoDetail: bundle.loading.inheritedPhotoDetail } : {}),
    ...(emblemSource ? { faction, emblem: emblemSource } : {}) };
if (photoDirectionApproval) receipt.photoDirectionApproval = photoDirectionApproval;
if (productionAuthorization) {
    receipt.productionAuthorization = productionAuthorization;
    receipt.acceptance = 'AUTHORIZED_PRODUCTION_CONSOLIDATED_USER_REVIEW_PENDING';
    receipt.artworkReview = 'CONSOLIDATED_USER_REVIEW_PENDING_NO_INDIVIDUAL_ACCEPTANCE_INFERRED';
}
if (config.outlineArrowInk !== undefined) receipt.outlineArrowInk = outlineArrowInk;
if (worldPreparation) receipt.worldPreparation = { ...config.worldPreparation, world: worldPreparation.binding,
    atlasSha256: worldPreparation.atlasSha256, politicalMask: worldPreparation.politicalMask, baked: worldPreparation.baked,
    qualification: worldPreparation.qualification };
if (stage) {
    receipt.acceptance = config.layoutTestOnly ? 'SPECIALIZED_LAYOUT_PROBE_NOT_MISSION_ART_NOT_REGISTERED'
        : 'STAGED_NOT_REGISTERED_FULL_LOADING_AND_USER_REVIEW_PENDING';
} else {
    // Preflight every destination before the first write. Existing art payloads
    // require byte identity; only an explicitly pinned active selector may change.
    const previous = process.argv.find(value => value.startsWith('--replace-interface-sha='))?.slice(24);
    for (const [name, bytes] of payloads) {
        let old; try { old = await fs.readFile(path.join(output, name)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (old && !old.equals(bytes) && name !== 'manifest.json'
            && !(name === 'interface-hd.json' && previous === sha(old))) throw Error('Existing loading payload differs: ' + name);
    }
}
for (const [name, bytes] of payloads) {
    const file = path.join(output, name);
    if (stage) await fs.writeFile(file, bytes, { flag: 'wx' });
    else { let old; try { old = await fs.readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (!old?.equals(bytes)) await fs.writeFile(file, bytes, { flag: old ? 'w' : 'wx' }); }
}
const receiptFile = stage ? path.join(stage, 'receipt.json') : path.join(root, 'docs/campaign-art',
    ...(edition === 'yr' ? ['yr-v1'] : []), mission + '-loading.json');
await fs.writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ mission, staged: !!stage, output, vectorPaths: contours.length, files: files.map(file => file.name) }));
