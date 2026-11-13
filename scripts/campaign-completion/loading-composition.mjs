import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';

// Compile only the official pure painter and its asset constants. Review
// exports use the same world registration without importing another UI store.
export async function loadingBackdropPainter() {
    const file = new URL('../../src/gui/campaign/CampaignBackdrop.tsx', import.meta.url);
    const source = await fs.readFile(file, 'utf8');
    const tree = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const names = ['paintCampaignBackdrop', 'campaignWorldRegistration'];
    const selected = tree.statements.filter(node => ts.isVariableStatement(node)
        ? node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === 'assets')
        : ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
    assert.equal(selected.length, 3, 'Official loading painter closure changed');
    const code = selected.map(node => node.getText(tree).replace(/^export /, '')).join('\n');
    const javascript = ts.transpileModule(code, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
    } }).outputText + '\nreturn paintCampaignBackdrop;';
    return { javascript, sourceSha256: createHash('sha256').update(source).digest('hex') };
}

export async function verifyNativeLoadingWorld(page, painter) {
    const result = await page.evaluate(({ javascript }) => {
        const api = window.__heldLoading, art = api.presentation.backdrop;
        const actual = document.querySelector('[data-campaign-backdrop]');
        if (!art || (!art.world && art.revision !== 'campaign-backdrop-world-r2a.png') || !actual)
            throw Error('Complete loading world backdrop is absent');
        const width = actual.clientWidth, height = actual.clientHeight;
        const expected = document.createElement('canvas'); expected.width = actual.width; expected.height = actual.height;
        const context = expected.getContext('2d', { willReadFrequently: true });
        context.setTransform(actual.width / width, 0, 0, actual.height / height, 0, 0);
        new Function(javascript)()(context, art, width, height);
        const background = context.getImageData(0, 0, expected.width, expected.height).data;
        const rendered = actual.getContext('2d', { willReadFrequently: true })
            .getImageData(0, 0, actual.width, actual.height).data;
        const foreground = api.presentation.sprites.mission.hdFrame;
        const left = (width - 800) / 2, top = (height - 520) / 2;
        let checked = 0, maxDifference = 0;
        for (let y = 4; y < actual.height - 4; y += 8) for (let x = 4; x < actual.width - 4; x += 8) {
            const logicalX = (x + .5) * width / actual.width - left;
            const logicalY = (y + .5) * height / actual.height - top;
            let covered = false;
            // Exclude the filtering neighborhood of the overlaid foreground.
            for (let dy = -3; dy <= 3 && !covered; dy++) for (let dx = -3; dx <= 3; dx++) {
                const sx = Math.floor((logicalX + dx) * foreground.width / 800);
                const sy = Math.floor((logicalY + dy) * foreground.height / 520);
                if (sx >= 0 && sy >= 0 && sx < foreground.width && sy < foreground.height
                    && foreground.data[(sy * foreground.width + sx) * 4 + 3]) { covered = true; break; }
            }
            const i = (y * actual.width + x) * 4;
            if (covered || !(background[i] > 100 || background[i + 1] > 40 || background[i + 2] > 40)) continue;
            checked++;
            for (let c = 0; c < 4; c++) maxDifference = Math.max(maxDifference, Math.abs(background[i + c] - rendered[i + c]));
        }
        expected.width = expected.height = 0;
        return { revision: art.revision, sourceSize: [art.image.naturalWidth, art.image.naturalHeight],
            ...(art.world ? { registration: art.world } : {}),
            checkedWorldSamples: checked, maximumChannelDifference: maxDifference,
            method: 'Compare actual native composite with the official world painter at uncovered geographic samples.' };
    }, painter);
    assert(result.checkedWorldSamples > 100, 'Insufficient visible geographic evidence');
    assert(result.maximumChannelDifference <= 1, 'Native world differs from its registered backdrop');
    return { ...result, painterSourceSha256: painter.sourceSha256 };
}

export async function captureLoadingComposition(page, painter, stem, asset, edition = 'ra2') {
    assert(['ra2', 'yr'].includes(edition));
    return page.evaluate(async ({ javascript, stem, asset, edition }) => {
        const response = await fetch(`/local-campaign/${edition}/${stem}/${asset}`);
        if (!response.ok) throw Error('Loading export response');
        const url = URL.createObjectURL(await response.blob()), image = new Image(); image.src = url;
        const canvas = document.createElement('canvas');
        try {
            await image.decode(); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0);
            const foreground = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const foregroundPng = canvas.toDataURL('image/png');
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.setTransform(canvas.width / 800, 0, 0, canvas.height / 520, 0, 0);
            new Function(javascript)()(context, window.__heldLoading.presentation.backdrop, 800, 520);
            const background = context.getImageData(0, 0, canvas.width, canvas.height).data;
            context.drawImage(image, 0, 0, 800, 520);
            const composed = context.getImageData(0, 0, canvas.width, canvas.height).data;
            let visibleWorldPixels = 0, transparentForegroundPixels = 0, maxDifference = 0;
            for (let i = 0; i < composed.length; i += 4) {
                if (foreground[i + 3]) continue;
                transparentForegroundPixels++;
                if (!(background[i] > 100 || background[i + 1] > 40 || background[i + 2] > 40)) continue;
                visibleWorldPixels++;
                for (let c = 0; c < 4; c++) maxDifference = Math.max(maxDifference, Math.abs(background[i + c] - composed[i + c]));
            }
            return { width: canvas.width, height: canvas.height, foregroundPng,
                compositedPng: canvas.toDataURL('image/png'), transparentForegroundPixels,
                visibleWorldPixels, maximumBackgroundChannelDifference: maxDifference };
        } finally { image.src = ''; URL.revokeObjectURL(url); canvas.width = canvas.height = 0; }
    }, { ...painter, stem, asset, edition });
}

export async function verifyNativeLoadingSourceWorld(page, proof) {
    const result = await page.evaluate(proof => {
        const canvas = document.querySelector('[data-campaign-backdrop]');
        const api = window.__heldLoading, frame = api.presentation.sprites.mission.hdFrame;
        const width = canvas.clientWidth, height = canvas.clientHeight;
        const left = (width - 800) / 2, top = (height - 520) / 2;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        // Proof coordinates identify original image pixels, whose samples are at their centers.
        const pixel = ([x, y]) => [...context.getImageData(Math.floor((left + x + .5) * canvas.width / width),
            Math.floor((top + y + .5) * canvas.height / height), 1, 1).data].slice(0, 3);
        return {
            viewportLayout: { width, height, left, top, canvas: [canvas.width, canvas.height],
                world: api.presentation.backdrop.world },
            samples: proof.samples.map(sample => ({ ...sample, actual: pixel(sample.at),
                foregroundAlpha: frame.data[(Math.floor((sample.at[1] + .5) * frame.height / 520) * frame.width
                    + Math.floor((sample.at[0] + .5) * frame.width / 800)) * 4 + 3] })),
            grid: proof.grid.map(sample => ({ ...sample, actual: pixel(sample.at) })),
            absentLegacyGrid: proof.absentLegacyGrid.map(at => ({ at, actual: pixel(at) })),
            extensionRegions: (proof.extensionRegions ?? []).map(region => {
                const [rx, ry, rw, rh] = region.rect;
                const { gridOrigin, gridStep } = api.presentation.backdrop.world;
                const nearGrid = (value, origin, step) => {
                    const distance = ((value - origin) % step + step) % step;
                    return Math.min(distance, step - distance) <= 2;
                };
                let visiblePixels = 0, geographicPixels = 0;
                for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
                    if (nearGrid(x + .5, gridOrigin[0], gridStep[0]) || nearGrid(y + .5, gridOrigin[1], gridStep[1])) continue;
                    const i = (Math.floor((y + .5) * frame.height / 520) * frame.width + Math.floor((x + .5) * frame.width / 800)) * 4;
                    if (frame.data[i + 3]) continue;
                    visiblePixels++;
                    if (pixel([x, y]).reduce((sum, value) => sum + value, 0) > 30) geographicPixels++;
                }
                return { ...region, visiblePixels, geographicPixels };
            }),
        };
    }, proof);
    for (const sample of result.samples) {
        assert.equal(sample.foregroundAlpha, 0, 'Source world check is covered by foreground: ' + sample.name);
        const matches = ([r, g, b]) => sample.state === 'red' ? r > 8 && r > b * 1.4 && r > g * 1.1
            : b > 12 && b > r * 1.25 && b > g * .8;
        try {
            assert(matches(sample.actual),
                'Original source political state differs: ' + sample.name + ' actual=' + JSON.stringify(sample.actual));
        } catch (error) { error.loadingSourceObservation = result; throw error; }
    }
    for (const sample of result.grid) {
        const [r, g, b] = sample.actual;
        const state = sample.state ?? 'blue';
        assert(['red', 'blue'].includes(state), 'Unsupported original source grid color');
        assert(state === 'red' ? r > 24 && r > b * 2 && g < 8 : b > 24 && b > r * 2 && g < 8,
            'Original source ' + state + ' grid differs');
    }
    for (const sample of result.absentLegacyGrid) assert(Math.max(...sample.actual) <= 2, 'Unexpected legacy grid in source ocean');
    for (const region of result.extensionRegions) {
        assert(region.visiblePixels > 1000, 'Insufficient unobstructed right-background coverage');
        assert(region.geographicPixels >= region.minimumGeographicPixels, 'Right world geography is absent: ' + region.geographicPixels);
    }
    return { status: 'PASS_ORIGINAL_SOURCE_REGION_AND_GRID_SAMPLES', ...result,
        scope: 'Independent original RGB-state samples at native source positions; selected regions, not whole-world pixel identity. Separately labeled viewport extensions follow the user feedback and reuse the accepted atlas.' };
}
