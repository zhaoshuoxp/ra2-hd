"""Native-size evidence; runtime PNGs are only cropped, never composited or retouched."""
import base64
import json
import math
from pathlib import Path
import sys
import numpy as np
from PIL import Image

source = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=False)
report = json.loads((source / 'result.json').read_text())
art_path = Path('.artifacts/m1-3c/candidate/primary-4x.png')
art = np.asarray(Image.open(art_path).convert('RGBA'), dtype=np.float64) / 255
rgb = np.where(art[..., :3] <= .04045, art[..., :3] / 12.92, ((art[..., :3] + .055) / 1.055) ** 2.4)
rgba = np.concatenate([rgb * art[..., 3:], art[..., 3:]], axis=2)


def weights(count, left, width, samples):
    p = (np.arange(count) + .5 - left) * samples / width
    footprint = np.clip(samples / width, 1, 8)
    lo, hi = p - footprint / 2, p + footprint / 2
    cells = np.arange(samples)
    return np.maximum(0, np.minimum(hi[:, None], cells + 1) - np.maximum(lo[:, None], cells)) / footprint


def reference(background, bounds):
    height, width = background.shape[:2]
    x0, y0, x1, y1 = bounds
    wx, wy = weights(width, x0, x1 - x0, art.shape[1]), weights(height, y0, y1 - y0, art.shape[0])
    filtered = np.stack([wy @ rgba[..., c] @ wx.T for c in range(4)], axis=-1)
    alpha = filtered[..., 3:]
    color = filtered[..., :3] / np.maximum(alpha, 1e-9)
    srgb = np.where(color <= .0031308, color * 12.92, 1.055 * np.maximum(color, 0) ** (1 / 2.4) - .055)
    coverage = np.where(alpha >= .995, 1, np.where(alpha <= .001, 0, alpha))
    return np.rint(np.clip(srgb * coverage + background[..., :3] / 255 * (1 - coverage), 0, 1) * 255).astype(np.uint8), coverage[..., 0]


def embed(file, css=(420, 320)):
    data = base64.b64encode((out / file).read_bytes()).decode()
    return f'<a href="{file}"><img src="data:image/png;base64,{data}" width="{css[0]}" height="{css[1]}" alt="{file}"></a>'

sections, metrics = [], []
for group in report['rows']:
    rows = {r['mode']: r for r in group['rows']}
    row = rows['candidate']
    scale = row['buffer'][1] / row['logical'][1]
    density = row['buffer'][1] / row['display'][3]
    world = next(d['viewport'] for d in row['draws'] if d['defaultFramebuffer'])
    viewport = row['viewport']
    def actual_bounds(bounds):
        x0, y0, x1, y1 = bounds
        return np.array([world[0] + (x0 - viewport['x']) * world[2] / viewport['width'],
                         row['buffer'][1] - world[1] - world[3] + (y0 - viewport['y']) * world[3] / viewport['height'],
                         world[0] + (x1 - viewport['x']) * world[2] / viewport['width'],
                         row['buffer'][1] - world[1] - world[3] + (y1 - viewport['y']) * world[3] / viewport['height']])
    b = actual_bounds(row['rhinoBounds'][0])
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    w, h = round(420 * density), round(320 * density)
    box = (round(cx - w / 2), round(cy - h / 2), round(cx - w / 2) + w, round(cy - h / 2) + h)
    panels = {}
    for mode in ['original', 'background', 'candidate', 'restored']:
        image = Image.open(source / rows[mode]['file']).convert('RGB')
        panels[mode] = np.array(image.crop(box))
        Image.fromarray(panels[mode]).save(out / f"{group['name']}-{mode}.png")
    local = b - np.array([box[0], box[1], box[0], box[1]])
    ref, coverage = reference(panels['background'], local)
    Image.fromarray(ref).save(out / f"{group['name']}-reference.png")
    diff = np.max(np.abs(ref.astype(int) - panels['candidate'].astype(int)), axis=2)
    support = coverage > .001
    # Exact comparison outside all diagnostic quads protects existing C assets and UI.
    original = np.array(Image.open(source / rows['original']['file']).convert('RGB'))
    candidate = np.array(Image.open(source / rows['candidate']['file']).convert('RGB'))
    outside = np.ones(original.shape[:2], dtype=bool)
    for bounds in row['rhinoBounds']:
        x0, y0, x1, y1 = actual_bounds(bounds)
        outside[max(0, math.floor(y0) - 4):math.ceil(y1) + 4, max(0, math.floor(x0) - 4):math.ceil(x1) + 4] = False
    outside_changes = np.count_nonzero(np.any(original != candidate, axis=2) & outside)
    assert outside_changes == 0, 'Existing scene changed outside Rhino bounds'
    assert np.array_equal(panels['original'], panels['restored'])
    transparent_changes = int(np.count_nonzero(np.any(panels['background'] != panels['candidate'], axis=2) & ~support))
    metric = {'name': group['name'], 'tick': row['tick'], 'cropOutput': list(box), 'cropCss': [420, 320],
              'quadCss': [(b[2] - b[0]) / density, (b[3] - b[1]) / density], 'outputDensity': density, 'worldGlViewport': world,
              'referenceVsRuntimeMeanMaxChannel': float(diff[support].mean()),
              'withinTwoLevelsPercent': float((diff[support] <= 2).mean() * 100),
              'transparentCornerChangedPixels': transparent_changes, 'outsideRhinoChangedPixels': int(outside_changes)}
    metrics.append(metric)
    title = 'Historical target size — diagnostic only' if row['historical'] else f"Standard 900 reference — {group['name']}"
    panels_html = ''.join(f'<figure><figcaption>{label}</figcaption>{embed(group["name"] + "-" + mode + ".png")}</figure>'
                          for label, mode in [('A Original runtime', 'original'), ('2D REFERENCE — NOT RUNTIME', 'reference'), ('R World-rendered artwork', 'candidate')])
    sections.append(f'<h2>{title}</h2><p>Tick {row["tick"]}; {row["buffer"][0]}×{row["buffer"][1]} output; {density:g} output pixels/CSS pixel. '
                    f'Art quad {metric["quadCss"][0]:.2f}×{metric["quadCss"][1]:.2f} CSS. No fitted scale or placement.</p><div class="row">{panels_html}</div>')

# Four decisive actual runtime crops, kept at the same CSS/output density.
depth_sections = []
for name in ['open-ground', 'yard-0-0', 'building--1--1', 'two-tank-overlap']:
    row = next((r for r in report.get('depth', {}).get('rows', []) if r['name'] == name), None)
    if not row or 'bounds' not in row:
        continue
    scale = row['buffer'][1] / row['logical'][1]
    b = np.array(row['bounds']) * scale
    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
    box = (round(cx - 420), round(cy - 320), round(cx - 420) + 840, round(cy - 320) + 640)
    filename = f'depth-{name}.png'
    Image.open(source / filename).crop(box).save(out / filename)
    (out / ('full-' + filename)).write_bytes((source / filename).read_bytes())
    depth_sections.append(f'<figure><figcaption>{name}</figcaption>{embed(filename)}</figure>')
if depth_sections:
    sections.append('<h2>Actual depth controls — High / standard 900</h2><p>Frozen diagnostic placements; no general slope or crowd acceptance. Original VXL supplies live shadows. The single-pose coverage proxy is an approximation.</p><div class="row">' + ''.join(depth_sections) + '</div>')

# Preserve a direct inspection copy at its actual export density; explicitly not native gameplay size.
Image.open(art_path).save(out / 'accepted-export-4x.png')
summary = {'status': 'TARGET_FIDELITY_REVIEW_PENDING / STANDARD_SCALE_REVIEW_PENDING', 'metrics': metrics,
           'depth': report.get('depth'), 'referenceMethod': 'CPU production-C box footprint: decode sRGB, alpha-weight linear colors, encode once, blend coverage over same-tick original shadow background. No runtime compositing.'}
(out / 'review.json').write_text(json.dumps(summary, indent=2) + '\n')
links = ''.join(f'<li><a href="../{source.name}/{r["file"]}">{g["name"]}: {r["mode"]} full scene</a></li>' for g in report['rows'] for r in g['rows'] if r['mode'] != 'restored')
# The review is self-contained; direct full scenes are also copied for stable links.
for group in report['rows']:
    for r in group['rows']:
        if r['mode'] != 'restored': (out / ('full-' + r['file'])).write_bytes((source / r['file']).read_bytes())
links = ''.join(f'<li><a href="full-{r["file"]}">{g["name"]}: {r["mode"]} full scene</a></li>' for g in report['rows'] for r in g['rows'] if r['mode'] != 'restored')
html = f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>Rhino M1.3c runtime fidelity</title>
<style>body{{font:18px/1.45 system-ui;background:#171b20;color:#e5e9ef;margin:24px}}h1{{font-size:30px}}h2{{font-size:24px;margin-top:36px}}a{{color:#a7caff}}.row{{display:flex;gap:16px;width:max-content}}figure{{margin:0;width:420px}}figcaption{{font-size:18px;height:32px}}img{{display:block;max-width:none}}p{{max-width:1200px}}</style>
<h1>Rhino: accepted artwork in the actual world renderer</h1>
<p>VISUAL REVIEW PENDING. Original Rhino remains the normal game asset. Single pose: body 0°, turret 0°, fixed red owner. Independent turret and full vehicle are not implemented. Existing production C and reference height 900 are unchanged.</p>
<p>Open at 100% browser zoom. Each panel stays 420×320 CSS; narrow windows scroll. High uses two output pixels per CSS pixel; 1080 uses one. The runtime column is a direct game capture. The middle column is an explicitly separate 2D reference.</p>
{''.join(sections)}<h2>Actual retained export — inspection only</h2><p>256×192 source pixels; this is not the standard gameplay display size.</p>{embed('accepted-export-4x.png', (256,192))}
<h2>Limits and evidence</h2><p>Depth: {report.get('depth', {}).get('status', 'NOT RUN')}. Ground-clamped split sprite depth, the separate near-opaque coverage depth proxy (0.985), and live original VXL shadow are approximations; the color image and C color/edge filter remain unchanged. Owner remap is unverified. Painted shading receives only a defined relative scalar light; no VPL lighting. Unsupported poses/states restore the complete original vehicle.</p>
<p>Run: <code>bun scripts/m1/play-rhino-sprite.mjs</code>. Compare A/R in the actual game, pan/select or resume gameplay to observe whole-vehicle fallback.</p><p><a href="review.json">Measurements</a></p><ul>{links}</ul></html>'''
(out / 'review.html').write_text(html)
print(json.dumps(metrics, indent=2))
