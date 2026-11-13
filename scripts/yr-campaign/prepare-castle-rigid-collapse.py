"""Reconstruct source-timed collapse from coherent HD masonry and native effects."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.local/tooling/castle-motion-r5'))
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

read = lambda p: json.loads(p.read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
source_file = ROOT / '.local/source-art/yr-campaign-v1/transylvania-castle-collapse/original/source.json'
source, = read(source_file)['sources']
width, height = source['canvas']
palette = np.frombuffer((source_file.parent / 'native' / source['palette']['member']).read_bytes(),
    np.uint8).reshape(256, 3).astype(np.float32) * 4
native = []
for slot, frame in enumerate(source['frames'][:87]):
    data = (source_file.parent / 'native' / f'{source["member"]}-{slot}.index').read_bytes()
    assert sha(data) == frame['indexSha256']
    pixels = np.frombuffer(data, np.uint8).reshape(frame['size'][::-1])
    whole = np.zeros((height, width), np.uint8)
    x, y = frame['origin']
    whole[y:y+pixels.shape[0], x:x+pixels.shape[1]] = pixels
    native.append(whole)

# Each piece retains its authored masonry. The source event intervals separate
# crest loss, upper tower failure, main wall collapse and the final low towers.
pieces = [
    ('front-facade', 39, 62, 0, 16, 0, [(67,133),(174,131),(183,183),(156,198),(92,185),(61,167)]),
    ('right-wing', 48, 65, -3, 13, -.05, [(157,134),(200,137),(209,171),(178,191),(157,183)]),
    ('back-wall', 29, 55, 2, 17, .035, [(146,72),(182,83),(188,148),(159,163),(143,139)]),
    ('left-square-tower', 22, 45, -2, 18, -.045, [(92,79),(111,78),(116,129),(98,146),(87,127)]),
    ('upper-central-tower', 17, 39, 1, 23, .025, [(109,77),(152,76),(164,108),(148,140),(107,130),(102,108)]),
    ('crest', 5, 18, 2, 6, .08, [(118,35),(141,35),(153,80),(121,86),(116,68)]),
    ('left-broken-tower', 46, 62, 3, 16, .045, [(69,99),(91,100),(98,138),(88,172),(68,164),(64,134)]),
    ('right-back-tower', 44, 63, -2, 16, -.035, [(188,88),(203,89),(210,132),(205,160),(186,161),(184,125)]),
    ('front-left-spire', 50, 65, 1, 13, .035, [(122,121),(141,121),(146,157),(144,189),(125,187),(120,150)]),
    ('front-right-spire', 52, 66, -2, 12, -.03, [(142,112),(162,111),(168,151),(165,185),(144,190),(140,151)]),
    ('front-extension', 54, 67, 1, 11, .035, [(160,144),(184,140),(195,164),(194,183),(176,192),(159,181)]),
]
registration = {row['frame']: row for row in read(ROOT /
    'docs/yr-campaign-castle-animation-registration-20261108.json')['frames']
    if row['identity'] == 'CATR03DM'}
output = ROOT / '.artifacts/yr-campaign/castle-rigid-r10'
output.mkdir(exist_ok=False)
exports = []
for density in [2, 4]:
    size = width*density, height*density
    target = output / str(density)
    target.mkdir()
    paint = [np.asarray(Image.open(ROOT / '.artifacts/yr-campaign/castle-footing-r3' /
        f'catr03dm-{density}x' / f'{slot:03}.png').convert('RGBA')).astype(np.float32)/255 for slot in range(87)]
    for rgba in paint:
        rgba[..., :3] *= rgba[..., 3:4]
    initial, rubble = paint[0], paint[86]
    masks = []
    for _, _, _, _, _, _, polygon in pieces:
        mask = Image.new('L', size)
        ImageDraw.Draw(mask).polygon([(round(x*density), round(y*density)) for x, y in polygon], fill=255)
        masks.append(np.asarray(mask).astype(np.float32)/255)
    # Partition the original structure once, including overlap, so the intact
    # state reconstructs exact source paint without stacked edge fringes.
    assigned = np.zeros(size[::-1], np.float32)
    partitions = []
    for mask in reversed(masks):
        piece = mask*(1-assigned)
        partitions.append(piece)
        assigned = np.maximum(assigned, mask)
    partitions.reverse()
    outer = 1-assigned
    for slot in range(87):
        result = rubble.copy()
        for spec, mask in zip(pieces, partitions, strict=True):
            _, start, end, dx, dy, turn, polygon = spec
            p = np.clip((slot-start)/(end-start), 0, 1)
            if p >= 1:
                continue
            movement = p*p
            pivot = np.mean(polygon, axis=0)*density
            matrix = cv2.getRotationMatrix2D(tuple(pivot), turn*180/np.pi*movement, 1)
            matrix[:, 2] += np.array([dx, dy])*density*movement
            layer = initial*mask[..., None]
            layer = cv2.warpAffine(layer, matrix, size, flags=cv2.INTER_LANCZOS4,
                borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            layer = np.clip(layer, 0, 1)
            layer[..., :3] = np.minimum(layer[..., :3], layer[..., 3:4])
            opacity = np.clip((1-p)*5, 0, 1)
            layer *= opacity
            result = layer + result*(1-layer[..., 3:4])
            if p == 0:
                result[mask > 0] = initial[mask > 0]
        result[outer > 0] = initial[outer > 0]
        # Isolate transient source effects. Permanent brass and stone never
        # enter this gate; their material comes exclusively from the two states.
        rgb, old = palette[native[slot]], palette[native[0]]
        delta = np.linalg.norm(rgb-old, axis=2)
        warm = (rgb[..., 0] > 170) & (rgb[..., 1] > 85) & (rgb[..., 0] > rgb[..., 2]*1.7) & (delta > 75)
        neutral = (np.max(rgb, axis=2)-np.min(rgb, axis=2) < 32) & (rgb.mean(axis=2) > 65) & (delta > 45)
        # Smoke is accepted only near an actual original blast or outside the
        # original structural silhouette; this excludes grey roof shingles.
        smoke_area = ndimage.binary_dilation(warm, iterations=12)
        smoke = neutral & (smoke_area | (native[0] == 0))
        effects = warm | smoke
        labels, count = ndimage.label(effects)
        gate_native = np.zeros((height, width), np.float32)
        for label in range(1, count+1):
            component = labels == label
            if component.sum() >= 3:
                gate_native = np.maximum(gate_native, ndimage.gaussian_filter(component.astype(np.float32), .8))
        gate_native = ndimage.gaussian_filter(ndimage.maximum_filter(gate_native, size=5), 1.1)
        gate = np.clip(cv2.resize(np.clip(gate_native*1.6, 0, 1), size,
            interpolation=cv2.INTER_CUBIC), 0, 1)[..., None]
        # Sample effects directly from the sufficiently resolved master. The
        # previous export clipped smoke to low-resolution pixel contours.
        record = registration[slot]
        file = ROOT / record['master']
        assert sha(file.read_bytes()) == record['masterSha256']
        master = np.asarray(Image.open(file).convert('RGBA')).astype(np.float32)/255
        master[..., :3] *= master[..., 3:4]
        hd_effects = cv2.warpAffine(master, np.asarray(record['sourceCanvasTransform'])*density,
            size, flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        hd_effects = np.clip(hd_effects, 0, 1)
        hd_effects[..., :3] = np.minimum(hd_effects[..., :3], hd_effects[..., 3:4])
        effect = hd_effects*gate
        result = effect + result*(1-effect[..., 3:4])
        if slot == 0:
            result = initial.copy()
        result = np.clip(result, 0, 1)
        result[..., :3] /= np.maximum(result[..., 3:4], 1e-7)
        file = target / f'{slot:03}.png'
        encoded = np.rint(np.clip(result, 0, 1)*255).astype(np.uint8)
        encoded[encoded[..., 3] == 0] = 0
        Image.fromarray(encoded).save(file)
        exports.append(dict(density=density, frame=slot, sha256=sha(file.read_bytes())))
report = dict(schema='yr-castle-rigid-material-continuity-v1',
    status='UNSELECTED_RIGID_CANDIDATE_VISUAL_REVIEW_PENDING', sourceSha256=source['sha256'],
    frames=87, independentDensities=[2, 4], originalRgbUsedAsPaint=False,
    retainedMaterialFrames=[0, 86], effectMasterRegistration='docs/yr-campaign-castle-animation-registration-20261108.json',
    sourceFrameContours='Coherent rigid HD parts and clean master effects retain the original logical trim; low-resolution pixel contours are not copied into the revised alpha.',
    originalGeometryPivotsShadowsAndTimingUnchanged=True, pieces=pieces, exports=exports,
    userVisualAcceptance='PENDING')
(output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(dict(output=str(output), densityFrames=len(exports))))
