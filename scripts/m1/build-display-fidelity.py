"""Read-only source/export/game trace; deterministic comparisons, never pack edits."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image


def read(path):
    return json.loads(Path(path).read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rgba(path):
    return np.array(Image.open(path).convert('RGBA'))


def source_frame(member, index, out):
    """Reconstruct the selected export, including its original matte/mask policy."""
    if member == 'cons.shp':
        root = Path('.artifacts/m1-1')
        report_path = root / 'resolution-review-v1/4x/review-export.json'
        report = read(report_path)
        source = Path(report['approvedArt'])
        assert sha(source) == report['artSha256']
        selection = read(root / 'art-review-v1/sample-selection.json')
        sample = next(f for f in selection['samples'] if f['nativeFrame'] == index)
        f = read(root / 'conscript-source.json')['frames'][index]
        x = sample['cell'][0] + 56 + (f['x'] - 18) * 10
        y = sample['cell'][1] + 72 + (f['y'] - 18) * 10
        box = [x, y, x + f['width'] * 10, y + f['height'] * 10]
        crop = rgba(source)[box[1]:box[3], box[0]:box[2]].copy()
        r, g, b = crop[:, :, :3].astype(float).transpose(2, 0, 1)
        crop[:, :, 3][(r < 85) & (g >= r + 3) & (b >= r + 1) & (g >= b)] = 0
        size = (f['width'] * 4, f['height'] * 4)
        before_mask = np.array(Image.fromarray(crop).resize(size, Image.Resampling.BOX))
        exported = report_path.parent / f'frame-{index:03}-4x-base.png'
        data_path = report_path.parent / f'frame-{index:03}-4x-data.png'
        pack = Path('.local/hd-packs/conscript-authored/1')
        indices = np.array(f['pixels']).reshape(f['height'], f['width'])
        allowed = np.repeat(np.repeat(indices != 0, 4, 0), 4, 1)
        clipped = before_mask.copy()
        clipped[~allowed | (clipped[:, :, 3] == 0)] = 0
    else:
        root = Path('.artifacts/m1-2')
        reports = [root / 'art-samples-v1/export/review-export.json']
        reports += sorted((root / 'full-art-v1').glob('batch-*/export/review-export.json'))
        found = [(p, f) for p in reports for f in read(p)['frames']
                 if f['member'] == member and f['nativeFrame'] == index]
        assert len(found) == 1
        report_path, record = found[0]
        source = report_path.parent.parent / 'generated.png'
        art = Image.open(source).convert('RGBA')
        f, (x, y) = record['frame'], record['origin']
        sx, sy = art.width / 1728, art.height / 960
        box = [round((x + f['x'] * 4) * sx), round((y + f['y'] * 4) * sy),
               round((x + (f['x'] + f['width']) * 4) * sx),
               round((y + (f['y'] + f['height']) * 4) * sy)]
        crop = np.array(art.crop(box))
        r, g, b = crop[:, :, :3].astype(float).transpose(2, 0, 1)
        crop[:, :, 3][(g > r * 1.22) & (g > b * 1.10)] = 0
        pixels = crop.astype(np.float32)
        pixels[:, :, :3] *= pixels[:, :, 3:4] / 255
        size = (f['width'] * 4, f['height'] * 4)
        pixels = np.stack([np.asarray(Image.fromarray(pixels[:, :, k]).resize(size, Image.Resampling.BOX))
                           for k in range(4)], axis=2)
        alpha = pixels[:, :, 3:4]
        pixels[:, :, :3] = np.divide(pixels[:, :, :3] * 255, alpha,
                                    out=np.zeros_like(pixels[:, :, :3]), where=alpha > 0)
        before_mask = np.clip(np.rint(pixels), 0, 255).astype(np.uint8)
        indices = np.array(read(root / f'source/{member}.json')['frames'][index]['pixels']).reshape(f['height'], f['width'])
        allowed = np.repeat(np.repeat(indices != 0, 4, 0), 4, 1)
        pixels[:, :, 3] = np.minimum(pixels[:, :, 3], allowed * 255)
        clipped = np.clip(np.rint(pixels), 0, 255).astype(np.uint8)
        prefix = f'{member[:-4]}-{index:03}-4x'
        exported = root / f'full-art-review-v1/{prefix}-base.png'
        data_path = root / f'full-art-review-v1/{prefix}-data.png'
        role = 'body' if member == 'ggpowr.shp' else 'active'
        pack = Path(f'.local/hd-packs/power-plant-authored-{role}/1')
    base, data = rgba(exported), rgba(data_path)
    reconstruction = np.zeros_like(base)
    reconstruction[:size[1], :size[0]] = clipped
    assert np.array_equal(base, reconstruction), f'Source/export mismatch: {member} {index}'
    manifest_path = pack / 'manifest.json'
    manifest = read(manifest_path)
    variant = next(v for v in manifest['variants'] if v['density'] == 4)
    frame = next(f for f in variant['frames'] if f['nativeFrame'] == index)
    page = next(p for p in variant['pages'] if p['id'] == frame['page'])
    ax, ay, aw, ah = frame['sampleRect']
    for role, expected in [('base', base), ('data', data)]:
        path = pack / page[role]
        assert sha(path) == page[f'{role}Sha256']
        assert np.array_equal(rgba(path)[ay:ay + ah, ax:ax + aw], expected), 'Export/atlas mismatch'
    if member == 'cons.shp':
        receipt = root / 'hd-gameplay-v1/art-acceptance.json'
        assert sha(receipt) == manifest['provenance']['artAcceptanceSha256']
        assert read(receipt)['reviewSha256'] == manifest['provenance']['reviewSha256']
        assert sha(root / 'full-art-review-v1/candidate-review.json') == read(receipt)['reviewSha256']
    prefix = f'{member[:-4]}-{index:03}'
    for name, pixels in [('source-matte', crop), ('export', base), ('data', data), ('pre-mask', before_mask)]:
        Image.fromarray(pixels).save(out / f'{prefix}-{name}.png')
    metadata = dict(member=member, frame=index, source=str(source), sourceSha256=sha(source), sourceCrop=box,
        sourceCropSize=[crop.shape[1], crop.shape[0]], trimSize=[f['width'], f['height']],
        sourceSamplesPerLogicalPixel=[crop.shape[1] / f['width'], crop.shape[0] / f['height']],
        report=str(report_path), reportSha256=sha(report_path), export=str(exported), exportSha256=sha(exported),
        data=str(data_path), dataSha256=sha(data_path), manifest=str(manifest_path), manifestSha256=sha(manifest_path),
        originalIdentity=manifest['source'], atlas=str(pack / page['base']), atlasSha256=page['baseSha256'],
        sampleRect=frame['sampleRect'], atlasSize=page['size'], exportSize=[base.shape[1], base.shape[0]],
        sourceToExportReconstructionMaxDifference=0, exportToAtlasBaseAndDataMaxDifference=0,
        preMaskAlphaArea=float(before_mask[:, :, 3].sum() / 255),
        maskRemovedAlphaArea=float((before_mask[:, :, 3].astype(float) - clipped[:, :, 3]).sum() / 255),
        remapPixels=int((data[:, :, 0] > 0).sum()), lowAlphaPixels=int(((base[:, :, 3] > 0) & (base[:, :, 3] < 128)).sum()))
    return metadata, crop, base, data, before_mask


def area_sample(pixels, bounds, crop_box):
    """Exact separable box integration onto the game's fractional pixel grid.

    Premultiplied, sRGB-code-value averaging, matching the authored exporter
    convention; this is a controlled filter reference, not a proposed shader.
    """
    x0, y0, x1, y1 = bounds
    left, top, right, bottom = crop_box
    def weights(start, end, count, lo, hi):
        edges = np.linspace(start, end, count + 1)
        dest = np.arange(lo, hi)[:, None]
        return np.maximum(0, np.minimum(dest + 1, edges[1:]) - np.maximum(dest, edges[:-1]))
    wx = weights(x0, x1, pixels.shape[1], left, right)
    wy = weights(y0, y1, pixels.shape[0], top, bottom)
    values = pixels.astype(float) / 255
    values[:, :, :3] *= values[:, :, 3:4]
    sampled = np.stack([wy @ values[:, :, k] @ wx.T for k in range(4)], axis=2)
    return sampled


def composite(background, premult):
    return np.clip(np.rint(premult[:, :, :3] * 255 + background[:, :, :3] * (1 - premult[:, :, 3:4])), 0, 255).astype('uint8')


def nearest_shader(base, data, layer, bounds, crop_box):
    """Predict unoccluded main-quad pixels with the measured production policy."""
    x0, y0, x1, y1 = bounds
    left, top, right, bottom = crop_box
    xs = (np.arange(left, right) + .5 - x0) / (x1 - x0)
    ys = (np.arange(top, bottom) + .5 - y0) / (y1 - y0)
    ix = np.clip(np.floor(xs * base.shape[1]).astype(int), 0, base.shape[1] - 1)
    iy = np.clip(np.floor(ys * base.shape[0]).astype(int), 0, base.shape[0] - 1)
    sampled, remap = base[iy[:, None], ix], data[iy[:, None], ix]
    material = layer['material']
    pw, ph = material['paletteSize']
    palette = np.array(material['palette']).reshape(ph, pw, 4)
    owner = palette[material['paletteRow'], 16 + remap[:, :, 1], :3]
    rgb = np.where(remap[:, :, :1] > 0, owner, sampled[:, :, :3]) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    linear = np.clip(linear * (1 + np.array(material['uniformLight'])), 0, 1)
    linear *= 1 + np.array(material['meshLight'])
    rgb = np.where(linear <= .0031308, linear * 12.92, 1.055 * np.maximum(linear, 0) ** (1 / 2.4) - .055)
    alpha = sampled[:, :, 3] / 255 * material['opacity'] * material['meshOpacity']
    keep = (alpha >= material['alphaTest']) & (xs[None, :] >= 0) & (xs[None, :] < 1) & (ys[:, None] >= 0) & (ys[:, None] < 1)
    # Opaque material: surviving alpha-test fragments replace the background.
    assert not material['transparent']
    predicted = np.zeros((*keep.shape, 4), dtype=float)
    predicted[:, :, :3] = np.clip(rgb, 0, 1) * keep[:, :, None]
    predicted[:, :, 3] = keep
    return predicted, keep, remap[:, :, 0] > 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('capture', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    capture = read(args.capture / 'result.json')
    records, sections = [], []
    for sample in capture['samples']:
        full = rgba(args.capture / sample['full']['file'])
        background = rgba(args.capture / sample['background']['file'])
        ratio = np.array(sample['full']['buffer']) / sample['full']['logical']
        assert np.allclose(ratio, [2.4, 2.4])
        viewport = sample['full']['viewport']
        gl_viewports = {tuple(d['viewport']) for d in sample['full']['draws'] if d['defaultFramebuffer']}
        assert len(gl_viewports) == 1
        gx, gy, gw, gh = next(iter(gl_viewports))
        raster_scale = np.array([gw / viewport['width'], gh / viewport['height']])
        raster_origin = np.array([gx, sample['full']['buffer'][1] - gy - gh])
        all_bounds = []
        for layer in sample['layers']:
            vertices = np.array(layer['renderVertices'])
            positions = (vertices[:, :2] - [viewport['x'], viewport['y']]) * raster_scale + raster_origin
            bounds = np.r_[positions.min(0), positions.max(0)]
            all_bounds.append(bounds)
        lo = np.floor(np.min(np.array(all_bounds)[:, :2], axis=0) - 16).astype(int)
        hi = np.ceil(np.max(np.array(all_bounds)[:, 2:], axis=0) + 16).astype(int)
        # Even crop edges preserve the exact 2-output-pixels/CSS-pixel display.
        lo -= lo % 2; hi += hi % 2
        box = [*lo, *hi]
        bg = background[lo[1]:hi[1], lo[0]:hi[0]]
        game = full[lo[1]:hi[1], lo[0]:hi[0]]
        composite_source, composite_export = bg[:, :, :3].copy(), bg[:, :, :3].copy()
        panels = []
        for layer, bounds in zip(sample['layers'], all_bounds):
            meta, source, base, data, before_mask = source_frame(layer['member'], layer['frame'], args.output)
            # Verify runtime identity, physical texture size and sampled UV rectangle.
            assert meta['manifestSha256'] in layer['identity']
            assert layer['material']['mapSize'] == meta['atlasSize']
            uv = np.array(layer['renderVertices'])[:, 2:]
            if layer['material']['flipY']:
                uv[:, 1] = 1 - uv[:, 1]
            rect = meta['sampleRect']; atlas = meta['atlasSize']
            assert np.allclose(uv.min(0), np.array(rect[:2]) / atlas, atol=1e-7)
            assert np.allclose(uv.max(0), (np.array(rect[:2]) + rect[2:]) / atlas, atol=1e-7)
            extent = bounds[2:] - bounds[:2]
            assert np.allclose(extent, np.array(meta['exportSize']) / 4 * raster_scale, atol=.01)
            source_bounds = np.r_[bounds[:2], bounds[:2] + np.array(meta['trimSize']) * raster_scale]
            controlled = area_sample(source, source_bounds, box)
            premask_sampled = area_sample(before_mask, source_bounds, box)
            exported = area_sample(base, bounds, box)
            prediction, keep, remapped = nearest_shader(base, data, layer, bounds, box)
            if layer['member'] == 'ggpowr.shp':
                actual = rgba(args.capture / sample['bodyOnly']['file'])[lo[1]:hi[1], lo[0]:hi[0]]
            elif layer['member'] == 'ggpowr_a.shp':
                actual = rgba(args.capture / sample['activeOnly']['file'])[lo[1]:hi[1], lo[0]:hi[0]]
            else:
                actual = game
            predicted = composite(bg, prediction)
            error = np.abs(actual[:, :, :3].astype(int) - predicted.astype(int)).max(2)
            changed = np.any(actual[:, :, :3] != bg[:, :, :3], axis=2)
            meta.update(runtimeBounds=bounds.tolist(), displaySizeCss=(extent / 2).tolist(), outputSize=extent.tolist(),
                runtime=layer, expectedVisiblePixels=int(keep.sum()), actualChangedPixels=int(changed.sum()),
                mainQuadPredictionWithin2Levels=float((error[keep] <= 2).mean()),
                mainQuadPredictionMeanMaxChannelError=float(error[keep].mean()),
                mainQuadPredictionMaxChannelError=int(error[keep].max()),
                mainQuadSamplesAbove2Levels=int((error[keep] > 2).sum()),
                sourceVsPremaskTwoStageMeanPremultipliedDifference=float(
                    np.abs(controlled - premask_sampled)[controlled[:, :, 3] > .99, :3].mean() * 255),
                discardedNonzeroAlphaTexels=int(((base[:, :, 3] > 0)
                    & (base[:, :, 3] / 255 < layer['material']['alphaTest'])).sum()),
                survivingPartialAlphaTexels=int(((base[:, :, 3] / 255 >= layer['material']['alphaTest'])
                    & (base[:, :, 3] < 255)).sum()),
                actualCompositeChangesInThisLayerFootprint=int((keep & np.any(game[:, :, :3] != actual[:, :, :3], axis=2)).sum()),
                runtimeRemappedSamples=int((keep & remapped).sum()),
                changedOutsideMainQuadPrediction=int((changed & ~keep).sum()))
            records.append(meta)
            prefix = f'{sample["name"]}-{layer["member"][:-4]}'
            columns = [('source', composite(bg, controlled)), ('export', composite(bg, exported)),
                       ('game', actual[:, :, :3]), ('predicted', predicted)]
            row = []
            for name, pixels in columns:
                path = args.output / f'{prefix}-{name}.png'
                Image.fromarray(pixels).save(path)
                row.append((name, path))
            panels.append((f'{layer["member"]} frame {layer["frame"]}', row))
            composite_source = composite(composite_source, controlled)
            composite_export = composite(composite_export, exported)
        if len(sample['layers']) > 1:
            rows = []
            for name, pixels in [('source', composite_source), ('export', composite_export), ('game', game[:, :, :3])]:
                path = args.output / f'{sample["name"]}-composite-{name}.png'
                Image.fromarray(pixels).save(path); rows.append((name, path))
            panels.insert(0, ('GAPOWR composite — body 0 + activity 2', rows))
        for title, row in panels:
            figures = []
            for name, path in row:
                encoded = base64.b64encode(path.read_bytes()).decode()
                w, h = Image.open(path).size
                figures.append(f'<figure><figcaption>{name}</figcaption><img alt="{html.escape(title)} {name}" '
                    f'width="{w / 2:g}" height="{h / 2:g}" src="data:image/png;base64,{encoded}">'
                    f'<a href="{path.name}">Output pixels</a></figure>')
            sections.append(f'<section><h2>{html.escape(title)}</h2><div class="row">{"".join(figures)}</div></section>')
    report = dict(status='PASS_SOURCE_EXPORT_ATLAS_IDENTITY_AND_MATCHED_CAPTURE',
        visualStatus='REVIEW_OPEN', standardPresentation='USER_CONFIRMED_REFERENCE_HEIGHT_900',
        capture=str(args.capture), captureSha256=sha(args.capture / 'result.json'), frames=records)
    report['tolerances'] = {'predictionChannelLevels': 2,
        'note': 'Prediction residuals are measurements, not visual approval or an automatic defect threshold. Controls use actual draw-batch geometry and GL viewport; no fitted image translation.'}
    (args.output / 'fidelity.json').write_text(json.dumps(report, indent=2) + '\n')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>M1.4 bounded fidelity review</title><style>
body{font:18px/1.5 system-ui;background:#171b21;color:#edf0f5;margin:28px;max-width:1500px}
h1{font-size:30px}h2{font-size:23px}p{max-width:1100px}section{border-top:1px solid #58616c;padding:16px 0}
.row{display:flex;gap:28px;overflow:auto;align-items:flex-start}figure{margin:0;flex:none}
figcaption{font-weight:700;margin-bottom:12px}img{display:block;max-width:none}a{display:block;color:#9bd4ff}
</style><h1>M1.4 — source / exported HD / actual game</h1>
<p>Reference height 900: user confirmed. These are native display-size crops for 1920×1080 CSS and a measured
3840×2160 game buffer (2 output pixels per CSS pixel). Keep browser zoom at 100%; a DPR-2 display shows each
captured output pixel directly. Other display densities may introduce browser resampling. Small windows scroll; crops never shrink.</p>
<p><b>source</b>: selected authored source, original green-matte removal, controlled premultiplied box downsample.
<b>export</b>: the actual packed 4x RGBA resource, downsampled by the same filter to the same fractional position.
<b>game</b>: actual unchanged production rendering. <b>predicted</b>: supplemental CPU nearest-sample prediction
using the captured owner palette, lighting, sRGB conversion and alpha test; it is not a game capture.</p>
<p>Source/export controls retain authored red and soft coverage. Export already includes the original silhouette mask;
game adds 16-shade team remap, nearest filtering, alpha test and lighting. Those intentional differences are not automatically defects.
The GAPOWR composite shows both layers; separate rows hide only the counterpart's HD surface while retaining shadows.
Frozen frame pins match poses and do not claim an actual walking/firing action. No repaint, material revision or Rhino implementation.</p>
<p>Direct PNG links expose output pixels for enlarged inspection only. The page itself stays at native displayed size.
The JSON records source hashes, atlas equality, projected geometry, sampling and prediction residuals.</p>
<p><b>Bounded findings:</b> all five selected exports reconstruct exactly from their authored source and match the packed
base/remap atlas crops exactly. Conscript is reduced from 10 source samples per logical pixel to a 4x pack, then about
2.4 output samples; GAPOWR starts near 3.89, is slightly resized to 4x, then sampled near 2.4.
Fine folds, thin weapons/pipes and small highlights lose separation when reduced. Native-mask clipping affects outer
edges; team remap reduces local color variation. GAPOWR activity covers part of the body. These are different causes,
not evidence of a second low-resolution world image. No production change is proposed by this review.</p>
'''
    (args.output / 'review.html').write_text(page + ''.join(sections) + '<p>Visual status: REVIEW_OPEN.</p></html>\n')
    print(json.dumps({'status': report['status'], 'frames': len(records), 'review': str(args.output / 'review.html')}))


if __name__ == '__main__':
    main()
