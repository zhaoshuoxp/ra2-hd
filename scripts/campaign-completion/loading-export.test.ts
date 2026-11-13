import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { Palette } from '../../src/data/Palette';
import { ShpFile } from '../../src/data/ShpFile';
import { resourceRoot, retailMember, sha256 } from '../test-support/resources';
import { loadingDiagramSymbols, loadingGeographicDiagram } from './loading-focus-raster.mjs';

const root = path.resolve(import.meta.dir, '../..');
const rects = [[257, 379, 77, 63], [350, 379, 78, 63], [446, 379, 79, 63], [542, 266, 238, 242]];
test('natural warm lunar material never becomes an opaque UI-symbol backplate', () => {
    const focus = new PNG({ width: 32, height: 16 });
    const samples = [[2, [236, 220, 112], false], [6, [76, 124, 56], false],
        [12, [232, 24, 24], true], [18, [80, 76, 252], true], [24, [188, 36, 232], true]] as const;
    for (const [x, rgb] of samples) focus.data.set([...rgb, 255], (8 * focus.width + x) * 4);
    const symbols = loadingDiagramSymbols(focus);
    for (const [x, , expected] of samples) expect(symbols.nearby(x, 8, 0)).toBe(expected);
});
test('dark navy ocean never becomes fragmented neutral land in the loading diagram', () => {
    const focus = new PNG({ width: 64, height: 40 });
    const ocean = [[0, 0, 24, 255], [0, 8, 16, 255], [8, 8, 24, 255], [8, 8, 8, 255], [40, 40, 48, 255]];
    for (let y = 0; y < focus.height; y++) for (let x = 0; x < focus.width; x++)
        focus.data.set(ocean[x % ocean.length], (y * focus.width + x) * 4);
    expect(loadingGeographicDiagram(focus).land).not.toContain('<path');
    for (let y = 6; y < 34; y++) for (let x = 14; x < 50; x++)
        focus.data.set([220, 220, 220, 255], (y * focus.width + x) * 4);
    for (let y = 7; y < 33; y++) for (let x = 15; x < 49; x++)
        focus.data.set([8, 8, 8, 255], (y * focus.width + x) * 4);
    focus.data.set([8, 8, 8, 255], (20 * focus.width + 14) * 4);
    expect(loadingGeographicDiagram(focus).land.match(/<path/g)?.length).toBe(1);
});
test('cartographic ridges preserve pale boundary ink without turning broad terrain highlights white', () => {
    const focus = new PNG({ width: 64, height: 40 });
    for (let y = 0; y < focus.height; y++) for (let x = 0; x < focus.width; x++) {
        const rgb = x >= 6 && x < 24 && y >= 6 && y < 26 ? [236, 236, 236] : [120, 120, 112];
        focus.data.set([...rgb, 255], (y * focus.width + x) * 4);
    }
    for (let y = 4; y < 36; y++) focus.data.set([228, 228, 228, 255], (y * focus.width + 40) * 4);
    const diagram = loadingGeographicDiagram(focus);
    expect(diagram.color([236, 236, 236], 12, 12)).toEqual([0, 0, 0]);
    expect(diagram.color([228, 228, 228], 40, 16)).toEqual(diagram.colors.white);
});
function fixture(folder: string, mission: string, photoSize = 1024) {
    const edition = mission.endsWith('md.map') ? 'yr' : 'ra2';
    const directory = path.join(resourceRoot, 'campaign', edition, mission.slice(0, -4));
    const presentation = JSON.parse(fs.readFileSync(path.join(directory, 'presentation.json'), 'utf8'));
    const spec = presentation.sprites.mission;
    const source = retailMember(edition, spec.image), palette = retailMember(edition, spec.palette);
    const shp = new ShpFile(source.file), frame = shp.images[0], colors = new Palette(palette.file);
    const original = new PNG({ width: shp.width, height: shp.height });
    frame.imageData.forEach((index, pixel) => {
        const color = colors.getColor(index), x = pixel % frame.width + frame.x, y = Math.floor(pixel / frame.width) + frame.y;
        original.data.set([color.r, color.g, color.b, 255], (y * original.width + x) * 4);
    });
    const originalBytes = PNG.sync.write(original); fs.writeFileSync(path.join(folder, 'original.png'), originalBytes);
    // Small generated fixtures exercise layout/capacity. They are never game artwork.
    const photo = new PNG({ width: photoSize, height: photoSize });
    for (let y = 0; y < photo.height; y++) for (let x = 0; x < photo.width; x++)
        photo.data.set([x % 255, y % 255, 100, x > 8 && y > 8 ? 255 : 0], (y * photo.width + x) * 4);
    const photoBytes = PNG.sync.write(photo); fs.writeFileSync(path.join(folder, 'fixture.png'), photoBytes);
    const config: any = { edition, mission, revision: 'specialized-layout-probe', layoutTestOnly: true,
        original: 'original.png', originalPngSha256: sha256(originalBytes), rects, photos: rects.map(() => 'fixture.png'),
        source: { member: spec.image, sha256: source.sha256, palette: spec.palette, paletteSha256: palette.sha256 } };
    if (mission.startsWith('all')) {
        config.layout = { focus: [348, 57, 284, 282], frame: [347, 54, 289, 286],
            pipe: 'M636 174H716V266M234 414H542', projection: 'M347 54L247 144V177L347 340M247 144H281V177H247',
            tacticalClip: 'M637 266H780V508H542V342H637Z', frameInk: '#00c8fc', pipeInk: '#0000fc' };
        config.emblem = { file: 'fixture.png', sha256: sha256(photoBytes), rect: [20, 344, 227, 157] };
    }
    return { config, directory };
}
function run(folder: string, config: unknown, args: string[] = []) {
    const file = path.join(folder, 'config.json'); fs.writeFileSync(file, JSON.stringify(config));
    return spawnSync('node', [path.join(root, 'scripts/campaign-completion/export-loading.mjs'), file,
        '--resource-root=' + resourceRoot, '--work-dir=' + path.join(folder, 'work'), ...args],
        { cwd: root, encoding: 'utf8', timeout: 30000 });
}

test('consolidated production keeps user visual acceptance pending and rejects a stale authority receipt', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-consolidated-'));
    try {
        const { config, directory } = fixture(folder, 'sov03u.map');
        const authority = path.join(root, 'docs/campaign-art/consolidated-review-authority-20261031.json');
        config.productionAuthorization = { file: authority, sha256: sha256(fs.readFileSync(authority)) };
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const stage = path.join(folder, 'stage'), result = run(folder, config, ['--stage=' + stage]);
        expect(result.status, result.stderr).toBe(0);
        const receipt = JSON.parse(fs.readFileSync(path.join(stage, 'receipt.json'), 'utf8'));
        expect(receipt.productionAuthorization).toEqual(config.productionAuthorization);
        expect(receipt.artworkReview).toBe('CONSOLIDATED_USER_REVIEW_PENDING_NO_INDIVIDUAL_ACCEPTANCE_INFERRED');
        expect(receipt.photoDirectionApproval).toBeUndefined();
        config.productionAuthorization.sha256 = '0'.repeat(64);
        const denied = run(folder, config, ['--stage=' + path.join(folder, 'denied')]);
        expect(denied.status).not.toBe(0);
        expect(denied.stderr).toContain('Consolidated production authorization mismatch');
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('YR loading reuses pinned HD cameos at native raster extent and isolates the accepted selection page', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-loading-reuse-'));
    try {
        const { config, directory } = fixture(folder, 'sov01umd.map');
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const selected = JSON.parse(fs.readFileSync(path.join(resourceRoot, 'ui-selection.json'), 'utf8'));
        const parent = path.join(resourceRoot, 'ui-packs', selected.revision);
        const assets = JSON.parse(fs.readFileSync(path.join(parent, 'manifest.json'), 'utf8')).assets;
        const cameo = assets.find((asset: any) => asset.id === 'brisicon.shp');
        config.photos[0] = path.join(parent, cameo.file);
        config.acceptedUiPhotos = [{ index: 0, id: cameo.id, revision: selected.revision,
            manifestSha256: selected.sha256, sha256: cameo.sha256 }];
        const stage = path.join(folder, 'valid'), valid = run(folder, config, ['--stage=' + stage]);
        expect(valid.status, valid.stderr).toBe(0);
        const metadata = JSON.parse(fs.readFileSync(path.join(stage, 'files/interface-hd.json'), 'utf8'));
        expect(metadata.edition).toBe('yr'); expect(metadata.loadingOnly).toBe(true);
        expect(metadata.selection).toBeUndefined();
        const manifest = JSON.parse(fs.readFileSync(path.join(stage, 'files/manifest.json'), 'utf8'));
        expect(manifest.files.every((file: any) => file.route.startsWith('/local-campaign/yr/'))).toBe(true);
        const svg = fs.readFileSync(path.join(stage, 'files/interface-loading-4x.svg'), 'utf8');
        const embedded = svg.match(/href="data:image\/png;base64,([^\"]+)"/)![1];
        const image = PNG.sync.read(Buffer.from(embedded, 'base64'));
        expect([image.width, image.height]).toEqual([240, 192]);
        config.acceptedUiPhotos[0].sha256 = 'a'.repeat(64);
        const corrupt = run(folder, config, ['--stage=' + path.join(folder, 'corrupt')]);
        expect(corrupt.status).not.toBe(0); expect(corrupt.stderr).toContain('Accepted UI photo payload mismatch');
        config.acceptedUiPhotos[0].sha256 = cameo.sha256;
        config.photos[1] = config.photos[0];
        const insufficient = run(folder, config, ['--stage=' + path.join(folder, 'insufficient')]);
        expect(insufficient.status).not.toBe(0); expect(insufficient.stderr).toContain('Insufficient authored detail');
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('Lunar loading isolates the authored Moon behind original symbols and rejects a mismatched master', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'yr-loading-moon-'));
    try {
        const { config, directory } = fixture(folder, 'sov06lmd.map');
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        config.focusRaster = { file: 'fixture.png', sha256: sha256(fs.readFileSync(path.join(folder, 'fixture.png'))),
            rect: [-8, -44, 208, 208], sourceRegion: [0, 0, 205, 170],
            clipCircle: [.5, .5, .478], miniature: [183, 12, 124, 124] };
        const stage = path.join(folder, 'valid'), valid = run(folder, config, ['--stage=' + stage]);
        expect(valid.status, valid.stderr).toBe(0);
        for (const density of [2, 4]) {
            const svg = fs.readFileSync(path.join(stage, 'files', `interface-loading-${density}x.svg`), 'utf8');
            expect(svg).toContain('lunar-focus-limb'); expect(svg).toContain('lunar-context-limb');
            expect(svg).not.toContain('id="geographic-material"');
            const image = PNG.sync.read(fs.readFileSync(path.join(folder, 'work', `focus-raster-${density}x.png`)));
            expect([image.width, image.height]).toEqual([208 * density, 208 * density]);
        }
        config.focusRaster.sha256 = 'a'.repeat(64);
        const corrupt = run(folder, config, ['--stage=' + path.join(folder, 'corrupt')]);
        expect(corrupt.status).not.toBe(0); expect(corrupt.stderr).toContain('Lunar focus artwork identity mismatch');
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test.each(['sov03u.map', 'all01t.map'])('%s stages both independent densities without changing formal source files', mission => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-layout-'));
    try {
        const { config, directory } = fixture(folder, mission), before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const stage = path.join(folder, 'stage'), result = run(folder, config, ['--stage=' + stage]);
        expect(result.status, result.stderr).toBe(0);
        const receipt = JSON.parse(fs.readFileSync(path.join(stage, 'receipt.json'), 'utf8'));
        expect(receipt.acceptance).toBe('SPECIALIZED_LAYOUT_PROBE_NOT_MISSION_ART_NOT_REGISTERED');
        for (const density of [2, 4]) {
            const svg = fs.readFileSync(path.join(stage, 'files', `interface-loading-${density}x.svg`), 'utf8');
            expect(svg).toContain(`width="${800 * density}" height="${520 * density}"`);
            const images = [...svg.matchAll(/href="data:image\/png;base64,([^\"]+)"/g)]; expect(images).toHaveLength(5);
            images.slice(0, 4).forEach((image, index) => {
                const decoded = PNG.sync.read(Buffer.from(image[1], 'base64'));
                expect([decoded.width, decoded.height]).toEqual([rects[index][2] * density, rects[index][3] * density]);
            });
        }
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
        const denied = run(folder, config); expect(denied.status).not.toBe(0);
        expect(denied.stderr).toContain('A specialized layout probe cannot be published');
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('the original two-photo loading layout keeps both portraits and clips only the final tactical photograph', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-two-photos-'));
    try {
        const { config, directory } = fixture(folder, 'all05s.map');
        const sourceRects = [[308, 378, 77, 61], [402, 378, 77, 61], [541, 268, 235, 231]];
        config.rects = sourceRects; config.photos = sourceRects.map(() => 'fixture.png');
        config.layout.tacticalClip = 'M646 268H776V499H541V342H646Z';
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const stage = path.join(folder, 'stage'), result = run(folder, config, ['--stage=' + stage]);
        expect(result.status, result.stderr).toBe(0);
        for (const density of [2, 4]) {
            const svg = fs.readFileSync(path.join(stage, 'files', `interface-loading-${density}x.svg`), 'utf8');
            const photos = [...svg.matchAll(/<image x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" ([^>]+)>/g)];
            expect(photos).toHaveLength(4); // Three photographs and the separate approved-emblem fixture.
            photos.slice(0, 3).forEach((photo, index) => {
                expect(photo.slice(1, 5).map(Number)).toEqual(sourceRects[index]);
                expect(photo[5].includes('clip-path="url(#tactical-photo)"')).toBe(index === 2);
                const encoded = photo[5].match(/base64,([^\"]+)/)![1];
                const decoded = PNG.sync.read(Buffer.from(encoded, 'base64'));
                expect([decoded.width, decoded.height]).toEqual(sourceRects[index].slice(2).map(size => size * density));
            });
            expect(svg).not.toContain('<image x="257"');
        }
        for (const [index, invalid] of [
            { ...config, photos: config.photos.slice(1) },
            { ...config, rects: [sourceRects[0]], photos: ['fixture.png'] },
            { ...config, rects: [...sourceRects, ...sourceRects], photos: Array(6).fill('fixture.png') },
            { ...config, rects: null }, { ...config, photos: null },
        ].entries()) {
            const deniedStage = path.join(folder, 'denied-' + index);
            const denied = run(folder, invalid, ['--stage=' + deniedStage]);
            expect(denied.status).not.toBe(0); expect(denied.stderr).toContain('Invalid original loading plane');
            expect(fs.readdirSync(path.join(deniedStage, 'files'))).toEqual([]);
        }
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('Soviet04 retains its source-blue naval arrow separately from blue land', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-blue-arrow-'));
    try {
        const { config, directory } = fixture(folder, 'sov04s.map');
        config.layout = { focus: [350, 60, 282, 273], frame: [347, 54, 287, 286],
            pipe: 'M638 177H715V267M234 407H541', projection: 'M346 55L246 160V194L346 337M246 160H281V194H246',
            tacticalClip: 'M647 266H775V500H541V341H647Z', frameInk: '#ff5900', pipeInk: '#ff4900' };
        config.outlineArrow = [95, 135, 128, 102]; config.outlineArrowInk = 'blue';
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const stage = path.join(folder, 'stage'), result = run(folder, config, ['--stage=' + stage]);
        expect(result.status, result.stderr).toBe(0);
        for (const density of [2, 4]) {
            const svg = fs.readFileSync(path.join(stage, 'files', `interface-loading-${density}x.svg`), 'utf8');
            expect(svg).toContain('fill="#1430fc"'); expect(svg).toContain('fill="#0000fc"');
            expect(svg).toMatch(/<g transform="translate\(95 135\)" fill="none"[^>]+><path/);
        }
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('Allied07 retains its original enemy-red naval arrow independently of the player faction', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-enemy-arrow-'));
    try {
        const { config, directory } = fixture(folder, 'all07t.map');
        config.outlineArrow = [80, 34, 100, 140]; config.outlineArrowInk = 'red';
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const stage = path.join(folder, 'stage'), result = run(folder, config, ['--stage=' + stage]);
        expect(result.status, result.stderr).toBe(0);
        for (const density of [2, 4]) {
            const svg = fs.readFileSync(path.join(stage, 'files', `interface-loading-${density}x.svg`), 'utf8');
            const outline = svg.match(/<g transform="translate\(80 34\)" fill="none"[^>]+>(.*?)<\/g>/)?.[1];
            expect(outline).toBeTruthy();
            const coordinates = [...outline!.matchAll(/d="([MLQZ0-9 .,-]+)"/g)]
                .flatMap(match => [...match[1].matchAll(/-?\d+(?:\.\d+)?/g)].map(number => Number(number[0])));
            const xs = coordinates.filter((_, index) => index % 2 === 0);
            const ys = coordinates.filter((_, index) => index % 2 === 1);
            // The actual source naval arrow is large; its small blue island marker
            // cannot satisfy these independent original-plane extent bounds.
            expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(70);
            expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(100);
        }
        const metadata = JSON.parse(fs.readFileSync(path.join(stage, 'files/interface-hd.json'), 'utf8'));
        expect(metadata.loading.outlineArrowInk).toBe('red');
        for (const [index, invalid] of [
            { ...config, outlineArrowInk: 'green' }, { ...config, outlineArrow: undefined },
            { ...config, outlineArrow: [80, 34, 300, 140] },
        ].entries()) {
            const denied = path.join(folder, 'denied-' + index);
            const failure = run(folder, invalid, ['--stage=' + denied]);
            expect(failure.status).not.toBe(0);
            expect(failure.stderr).toContain('Invalid original arrow declaration');
            expect(fs.readdirSync(path.join(denied, 'files'))).toEqual([]);
        }
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('Pacific world preparation wraps original political authority and preserves isolated Antarctic relief', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-pacific-world-'));
    try {
        const { config, directory } = fixture(folder, 'all07t.map');
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const atlasFile = path.join(root, 'public/res/presentation/campaign-backdrop-world-r2a.png');
        const recipe: any = { schema: 'source-pinned-loading-world-recipe-v1', source: config.source,
            original: 'original.png', originalPngSha256: config.originalPngSha256,
            atlas: atlasFile, atlasSha256: sha256(fs.readFileSync(atlasFile)),
            sourceRegions: [[8, 12, 324, 320], [650, 12, 138, 146], [730, 158, 58, 100], [8, 440, 780, 68]],
            sourceExclusions: [[236, 159, 40, 40], [8, 335, 238, 140], [541, 266, 238, 235]],
            wrapLongitude: true, assetName: 'interface-world-pacific-test.png',
            registration: { scale: .6258503384712227, sourceLocator: [1887.3260848520747, 336.7173932288814],
                nativeLocator: [256, 178], gridOrigin: [70, 70], gridStep: [163.75, 132], gridInk: '#0c004c' },
            atlasTerritories: [{ rect: [0, 720, 1915, 101], state: 'red',
                sourceSamples: [[60, 490], [300, 480], [500, 488]],
                authority: 'Original unobscured Antarctic source pixels qualify the entire isolated accepted Antarctic landmass.' },
            { rect: [1434, 478, 220, 155], state: 'blue', sourceSamples: [[25, 300], [43, 295], [65, 310]],
                authority: 'Original Australia is blue, including the coast beyond the bounded source-mask edge.' }] };
        const prepare = (data: unknown, name: string) => {
            const file = path.join(folder, name + '.json'); fs.writeFileSync(file, JSON.stringify(data));
            return spawnSync('node', [path.join(root, 'scripts/campaign-completion/prepare-loading-world.mjs'),
                file, path.join(folder, name)], { cwd: root, encoding: 'utf8', timeout: 60000 });
        };
        const result = prepare(recipe, 'world'); expect(result.status, result.stderr).toBe(0);
        const world = PNG.sync.read(fs.readFileSync(path.join(folder, 'world', recipe.assetName)));
        const pixel = (x: number, y: number) => [...world.data.subarray((y * world.width + x) * 4, (y * world.width + x) * 4 + 3)];
        // Europe is in the arc across the atlas seam. Without longitude wrap,
        // its original red authority falls outside the atlas and remains blue.
        const [r, g, b] = pixel(933, 284); expect(r).toBeGreaterThan(20);
        expect(r).toBeGreaterThan(b * 2); expect(r).toBeGreaterThan(g * 2);
        for (const x of [198, 900, 1500]) {
            const [red, green, blue] = pixel(x, 800);
            expect(red).toBeGreaterThan(blue * 2); expect(red).toBeGreaterThan(green);
        }
        // This western Australian material lies just beyond the original
        // visible-mask edge and is clearly red in the accepted base atlas.
        const [ar, ag, ab] = pixel(1490, 540);
        expect(ab).toBeGreaterThan(ar * 2); expect(ab).toBeGreaterThan(ag);
        const receipt = JSON.parse(fs.readFileSync(path.join(folder, 'world/receipt.json'), 'utf8'));
        expect(receipt.politicalMask.uniqueLongitudeCycle).toEqual([155, 1915]);
        expect(receipt.baked.maximumOutsideChannelDifference).toBe(0);
        expect(receipt.baked.unchangedOutsideDeclaredRegions).toBeGreaterThan(1_000_000);
        for (const [index, invalid] of [
            { ...recipe, wrapLongitude: 'repeat' }, { ...recipe, sourceRegion: [8, 12, 30, 30] },
            { ...recipe, sourceRegions: [[8, 12, 800, 320]] },
            { ...recipe, sourceExclusions: [[1, 1, 798, 518]] },
            { ...recipe, atlasTerritories: [{ ...recipe.atlasTerritories[0], state: 'blue' }] },
            { ...recipe, atlasTerritories: [{ rect: [845, 302, 295, 300], state: 'red',
                sourceSamples: [[750, 216], [768, 220], [780, 240]],
                authority: 'This intentionally false uniform African assignment must fail the original mixed-state guard.' }] },
        ].entries()) {
            const name = 'denied-' + index, denied = prepare(invalid, name);
            expect(denied.status).not.toBe(0); expect(fs.existsSync(path.join(folder, name))).toBe(false);
        }
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 90000);

test('loading export rejects a substituted original source and insufficient4X detail before publication', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-guards-'));
    try {
        const { config, directory } = fixture(folder, 'sov03u.map', 512);
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const wrong = run(folder, { ...config, source: { ...config.source, sha256: '0'.repeat(64) } },
            ['--stage=' + path.join(folder, 'wrong-source')]);
        expect(wrong.status).not.toBe(0); expect(wrong.stderr).toContain('Original loading source or palette mismatch');
        const small = run(folder, config, ['--stage=' + path.join(folder, 'small')]);
        expect(small.status).not.toBe(0); expect(small.stderr).toContain('Insufficient authored detail');
        expect(fs.readdirSync(path.join(folder, 'small/files'))).toEqual([]);
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('loading export preflights all existing payloads before updating the active manifest', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-preservation-'));
    try {
        const { config, directory } = fixture(folder, 'sov03u.map'); config.layoutTestOnly = false;
        const files = ['manifest.json', 'interface-hd.json', 'interface-loading-2x.svg', 'interface-loading-4x.svg'];
        const before = files.map(file => fs.readFileSync(path.join(directory, file)));
        const denied = run(folder, config); expect(denied.status).not.toBe(0);
        expect(denied.stderr).toContain('Existing loading payload differs');
        files.forEach((file, index) => expect(fs.readFileSync(path.join(directory, file)).equals(before[index])).toBe(true));
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('an unapproved Allied emblem cannot publish a loading page', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-emblem-review-'));
    try {
        const { config, directory } = fixture(folder, 'all01t.map'); config.layoutTestOnly = false;
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const hdFile = path.join(directory, 'interface-hd.json');
        const hdBefore = fs.existsSync(hdFile) ? fs.readFileSync(hdFile) : undefined;
        const denied = run(folder, config); expect(denied.status).not.toBe(0);
        expect(denied.stderr).toContain('Approved Allied emblem required for publication');
        for (const receipt of ['approved', { file: 'approval.json', sha256: 'unverified' }]) {
            const invalid = run(folder, { ...config, emblem: { ...config.emblem, directionApproval: receipt } });
            expect(invalid.status).not.toBe(0);
            expect(invalid.stderr).toContain('Allied emblem direction approval receipt is invalid');
        }
        const approvalBytes = Buffer.from(JSON.stringify({ status: 'DIRECTION_REVIEW_PENDING',
            scope: 'RA2_ALLIED_LOADING_EMBLEM', masterSha256: config.emblem.sha256, questionItemId: 'pending' }));
        fs.writeFileSync(path.join(folder, 'approval.json'), approvalBytes);
        config.emblem.directionApproval = { file: 'approval.json', sha256: sha256(approvalBytes) };
        const pending = run(folder, config); expect(pending.status).not.toBe(0);
        expect(pending.stderr).toContain('Allied emblem direction approval is pending or mismatched');
        const acceptedBytes = Buffer.from(JSON.stringify({ status: 'USER_DIRECTION_APPROVED',
            scope: 'RA2_ALLIED_LOADING_EMBLEM', masterSha256: config.emblem.sha256, questionItemId: 'fixture-only' }));
        fs.writeFileSync(path.join(folder, 'approval.json'), acceptedBytes);
        config.emblem.directionApproval.sha256 = sha256(acceptedBytes);
        const noSilhouette = run(folder, config); expect(noSilhouette.status).not.toBe(0);
        expect(noSilhouette.stderr).toContain('Verified Allied emblem silhouette required for publication');
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
        if (hdBefore) expect(fs.readFileSync(hdFile).equals(hdBefore)).toBe(true);
        else expect(fs.existsSync(hdFile)).toBe(false);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('source-pinned Allied emblem clipping retains the original master and rejects a substituted source', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-emblem-clip-'));
    try {
        const { config, directory } = fixture(folder, 'all01t.map');
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const masterBefore = fs.readFileSync(path.join(folder, 'fixture.png'));
        const recipe = { master: 'fixture.png', masterSha256: config.emblem.sha256, original: 'original.png',
            originalPngSha256: config.originalPngSha256, nativeRegion: [20, 344, 227, 157], alphaCutoff: 192, neutralThreshold: 40 };
        const recipeFile = path.join(folder, 'emblem.json'), registrationFile = path.join(folder, 'registration.json');
        fs.writeFileSync(recipeFile, JSON.stringify(recipe));
        const prepared = spawnSync('node', [path.join(root, 'scripts/campaign-completion/prepare-loading-emblem.mjs'),
            recipeFile, registrationFile], { encoding: 'utf8', timeout: 30000 });
        expect(prepared.status, prepared.stderr).toBe(0);
        const registration = JSON.parse(fs.readFileSync(registrationFile, 'utf8'));
        expect(registration.nativeBounds).toEqual([23, 347, 221, 139]);
        config.emblem.rect = registration.nativeBounds;
        config.emblem.registration = { file: 'registration.json', sha256: sha256(fs.readFileSync(registrationFile)) };
        const stage = path.join(folder, 'stage'), staged = run(folder, config, ['--stage=' + stage]);
        expect(staged.status, staged.stderr).toBe(0);
        for (const density of [2, 4]) {
            const svg = fs.readFileSync(path.join(stage, 'files', `interface-loading-${density}x.svg`), 'utf8');
            expect(svg).toContain('clip-path="url(#allied-emblem)"');
            expect(svg).toContain(`viewBox="${registration.masterFrame.join(' ')}"`);
        }
        registration.originalPngSha256 = '0'.repeat(64); fs.writeFileSync(registrationFile, JSON.stringify(registration));
        config.emblem.registration.sha256 = sha256(fs.readFileSync(registrationFile));
        const denied = run(folder, config, ['--stage=' + path.join(folder, 'wrong-source')]);
        expect(denied.status).not.toBe(0); expect(denied.stderr).toContain('Allied emblem silhouette registration mismatch');
        expect(fs.readdirSync(path.join(folder, 'wrong-source/files'))).toEqual([]);
        expect(fs.readFileSync(path.join(folder, 'fixture.png')).equals(masterBefore)).toBe(true);
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);

test('source-pinned world preparation stages a complete dependency and rejects source, metadata and payload drift', () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ra2-loading-source-world-'));
    try {
        const { config, directory } = fixture(folder, 'all05s.map');
        const before = fs.readFileSync(path.join(directory, 'manifest.json'));
        const atlas = path.join(root, 'public/res/presentation/campaign-backdrop-world-r2a.png');
        const recipe = { schema: 'source-pinned-loading-world-recipe-v1', source: config.source,
            original: 'original.png', originalPngSha256: config.originalPngSha256,
            atlas, atlasSha256: sha256(fs.readFileSync(atlas)), sourceRegion: [8, 12, 332, 320],
            assetName: 'interface-world-layout-fixture.png', registration: {
                scale: .6277777473493853, sourceLocator: [1011.6371744889243, 197.0707846196585],
                nativeLocator: [261.5, 161], gridOrigin: [71, 203], gridStep: [163, 263], gridInk: '#0c004c',
            } };
        const recipeFile = path.join(folder, 'world-recipe.json'), prepared = path.join(folder, 'world');
        fs.writeFileSync(recipeFile, JSON.stringify(recipe));
        const preparation = spawnSync('node', [path.join(root, 'scripts/campaign-completion/prepare-loading-world.mjs'),
            recipeFile, prepared], { cwd: root, encoding: 'utf8', timeout: 30000 });
        expect(preparation.status, preparation.stderr).toBe(0);
        const receiptFile = path.join(prepared, 'receipt.json'), receiptBytes = fs.readFileSync(receiptFile);
        const receipt = JSON.parse(receiptBytes.toString());
        expect(receipt.baked.status).toBe('PASS_PINNED_PALETTE_DERIVATION');
        expect(receipt.baked.maximumOutsideChannelDifference).toBe(0);
        expect(receipt.baked.unchangedOutsideDeclaredRegions).toBeGreaterThan(1_300_000);
        const derived = PNG.sync.read(fs.readFileSync(path.join(prepared, receipt.asset.file)));
        const accepted = PNG.sync.read(fs.readFileSync(atlas));
        for (const [x, y] of [[200, 300], [500, 500], [1300, 400], [1500, 600]]) {
            const i = (y * 1915 + x) * 4;
            expect(derived.data.subarray(i, i + 4)).toEqual(accepted.data.subarray(i, i + 4));
        }
        config.worldPreparation = { file: 'world/receipt.json', sha256: sha256(receiptBytes) };
        const stage = path.join(folder, 'stage'), staged = run(folder, config, ['--stage=' + stage]);
        expect(staged.status, staged.stderr).toBe(0);
        const bundle = JSON.parse(fs.readFileSync(path.join(stage, 'files/interface-hd.json'), 'utf8'));
        expect(bundle.loading.world).toEqual(receipt.binding);
        expect(bundle.loading.variants.map((v: any) => v.density)).toEqual([2, 4]);
        const stagedManifest = JSON.parse(fs.readFileSync(path.join(stage, 'files/manifest.json'), 'utf8'));
        expect(stagedManifest.files.some((f: any) => f.name === receipt.asset.file && f.sha256 === receipt.asset.sha256)).toBe(true);
        expect(fs.readFileSync(path.join(stage, 'files', receipt.asset.file))).toEqual(fs.readFileSync(path.join(prepared, receipt.asset.file)));
        for (const [index, mutate] of [
            (value: any) => value.originalPngSha256 = '0'.repeat(64),
            (value: any) => value.source.sha256 = '0'.repeat(64),
            (value: any) => value.atlasSha256 = '0'.repeat(64),
            (value: any) => value.binding.nativeLocator = [-1, 161],
            (value: any) => value.binding.gridStep = 163,
            (value: any) => value.binding.file = '../interface-world-layout-fixture.png',
            (value: any) => value.asset.sha256 = '0'.repeat(64),
        ].entries()) {
            const bad = structuredClone(receipt); mutate(bad);
            const bytes = Buffer.from(JSON.stringify(bad)); fs.writeFileSync(receiptFile, bytes);
            const deniedStage = path.join(folder, 'denied-' + index);
            const denied = run(folder, { ...config, worldPreparation: { ...config.worldPreparation, sha256: sha256(bytes) } },
                ['--stage=' + deniedStage]);
            expect(denied.status).not.toBe(0); expect(denied.stderr).toMatch(/Loading world (source identity|registration|payload) mismatch/);
            expect(fs.readdirSync(path.join(deniedStage, 'files'))).toEqual([]);
        }
        expect(fs.readFileSync(path.join(directory, 'manifest.json')).equals(before)).toBe(true);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}, 30000);
