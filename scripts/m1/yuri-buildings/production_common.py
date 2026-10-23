"""Task C fixed-coordinate composition and complete native slot exports."""
import hashlib
import json
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path('scripts/m1/owner-color').resolve()))
from paint import complete_data
from material_policy import intended_core, paint_envelope, RATIONALE

ROOT = Path('.artifacts/yuri-buildings')
SOURCE = ROOT / 'source-v1'
INVENTORY = json.loads((SOURCE / 'inventory.json').read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def row_for(identity, theater='TEMPERATE'):
    return next(r for r in INVENTORY['matrix'] if (r['id'], r['theater']) == (identity, theater))


@lru_cache(maxsize=160)
def raw_for(member_hash):
    return json.loads((SOURCE / 'members' / (member_hash + '.json')).read_text())


def indices(member, n):
    raw = raw_for(member['source']['sha256'])
    frame = raw['frames'][n]
    out = np.zeros(raw['canvas'][::-1], np.uint8)
    x, y, width, height = (frame[k] for k in ('x', 'y', 'width', 'height'))
    out[y:y + height, x:x + width] = np.array(frame['pixels'], np.uint8).reshape(height, width)
    return out


def decode(row, member, n):
    pixels = indices(member, n)
    rgb = np.array(row['palette']['colors'], np.uint8)[pixels]
    rgb[pixels == 0] = 0
    return Image.fromarray(np.dstack((rgb, np.uint8(pixels != 0) * 255)))


def resting(row, damaged=False):
    body = next(m for m in row['members'] if 'body' in m['roles'])
    result = Image.new('RGBA', body['canvas'])
    for role in ('bib', 'body'):
        for member in row['members']:
            if role in member['roles']:
                n = (21 if damaged else 5) if row['id'] == 'GAFWLL' else int(damaged)
                part = decode(row, member, n)
                offset = tuple((body['canvas'][i] - part.size[i]) // 2 for i in range(2))
                result.alpha_composite(part, offset)
    animations = [a for a in row['animations'] if a['type'] in ('ACTIVE', 'IDLE')]
    if not animations:
        animations = [a for a in row['animations'] if a['type'] == 'SUPER'][:1]
    for animation in animations:
        member = next(m for m in row['members'] if m['source']['member'] == animation['member'])
        props = animation.get('damaged') or animation['normal'] if damaged else animation['normal']
        part = decode(row, member, props['start'])
        offset = tuple((body['canvas'][i] - part.size[i]) // 2 + list(animation['offset'].values())[i] for i in range(2))
        result.alpha_composite(part, offset)
    return result


def material_coverage(image, primary_component=False):
    """Keep solid authored material and its immediate AA edge, excluding haze.

    This is an explicit sprite-export coverage mask. Raw generated alpha is
    retained in masters; no revised image is passed off as the service output.
    """
    rgba = np.array(image.convert('RGBA'))
    solid = rgba[..., 3] >= 240
    if primary_component:
        labels, number = ndimage.label(solid, np.ones((3, 3)))
        sizes = np.bincount(labels.ravel())
        assert number and sizes[1:].max() > 1000
        solid = labels == (1 + sizes[1:].argmax())
    supported = ndimage.binary_dilation(solid, iterations=1)
    rgba[..., 3][~supported] = 0
    rgba[..., :3][rgba[..., 3] == 0] = 0
    return Image.fromarray(rgba)


def cells(path, count):
    image = Image.open(path).convert('RGBA')
    rgba = np.array(image)
    labels, number = ndimage.label(rgba[..., 3] >= 240)
    sizes = np.bincount(labels.ravel())
    boxes = ndimage.find_objects(labels)
    selected = sorted(range(1, number + 1), key=lambda i: sizes[i], reverse=True)[:count]
    assert len(selected) == count and min(sizes[i] for i in selected) > 5000
    selected.sort(key=lambda i: boxes[i - 1][0].start)
    result = []
    for i in selected:
        yy, xx = boxes[i - 1]
        bbox = (max(0, xx.start - 2), max(0, yy.start - 2), min(image.width, xx.stop + 2), min(image.height, yy.stop + 2))
        # Adjacent keys can overlap in vertical extent without touching. Keep
        # only this connected solid and its AA edge, never the next key's tip.
        supported = ndimage.binary_dilation(labels == i, iterations=1)
        pixels = rgba.copy()
        pixels[..., 3][~supported] = 0
        pixels[..., :3][pixels[..., 3] == 0] = 0
        result.append((Image.fromarray(pixels).crop(bbox), bbox))
    return result


def clip(image, mask):
    rgba = np.array(image)
    rgba[..., 3] = np.uint8(rgba[..., 3].astype(float) * np.array(mask) / 255)
    rgba[..., :3][rgba[..., 3] == 0] = 0
    return Image.fromarray(rgba)


class Family:
    def __init__(self, identity, theater, density, output):
        assert density in (2, 4)
        assert (ROOT / 'representative-acceptance-v1.json').exists()
        self.row = row_for(identity, theater)
        self.identity, self.theater, self.density = identity, theater, density
        self.body = next(m for m in self.row['members'] if 'body' in m['roles'])
        self.size = tuple(v * density for v in self.body['canvas'])
        self.out = ROOT / output / f'{identity}-{theater}-{density}x'
        self.out.mkdir(parents=True, exist_ok=False)
        self.frames, self.operations, self.registrations, self.data_overrides = {}, {}, [], {}
        self.local_parts = []
        self.construction_motion = []
        retained = next((v.split('=', 1)[1] for v in sys.argv if v.startswith('--retain-states=')), None)
        self.retained_folder = ROOT / retained / f'{identity}-{theater}-{density}x' if retained else None
        roles = next((v.split('=', 1)[1] for v in sys.argv if v.startswith('--retain-roles=')), None)
        self.retained_roles = set(roles.split(',')) if roles else None
        self.retained = json.loads((self.retained_folder / 'candidate-review.json').read_text()) if retained else None

    def blank(self):
        return Image.new('RGBA', self.size)

    def register(self, image, bounds, source, proportional=False, source_region=None):
        image = material_coverage(image)
        bbox = image.getchannel('A').point(lambda a: 255 if a >= 240 else 0).getbbox()
        assert bbox
        image = image.crop(bbox)
        width, height = (bounds[2] - bounds[0]) * self.density, (bounds[3] - bounds[1]) * self.density
        if proportional:
            scale = min(width / image.width, height / image.height)
            width, height = round(image.width * scale), round(image.height * scale)
        assert image.width >= width and image.height >= height, ('Deficient source subject', source, image.size, [width, height])
        offset = (round((bounds[0] + bounds[2]) * self.density / 2 - width / 2), bounds[3] * self.density - height)
        result = self.blank()
        resized = image.convert('RGBa').resize((width, height), Image.Resampling.LANCZOS).convert('RGBA')
        result.alpha_composite(resized, offset)
        self.registrations.append({'source': str(source), 'sourceHash': sha(source), 'subjectCrop': list(bbox),
            'sourceRegion': list(source_region) if source_region else [0, 0, *Image.open(source).size],
            'sourceSubject': list(image.size), 'physicalSize': [width, height], 'physicalOffset': list(offset),
            'scale': [width / image.width, height / image.height], 'upsampling': False,
            'rule': 'One fixed registration per authored key; never per-frame whole-building envelope'})
        return result

    def polygon(self, image, points):
        mask = Image.new('L', self.size)
        ImageDraw.Draw(mask).polygon([(round(x * self.density), round(y * self.density)) for x, y in points], fill=255)
        return clip(image, mask)

    def rectangle(self, image, bounds):
        x0, y0, x1, y1 = bounds
        return self.polygon(image, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

    def translate(self, image, dx=0, dy=0):
        result = self.blank()
        result.alpha_composite(image, (round(dx * self.density), round(dy * self.density)))
        return result

    def native_mask(self, member, n, expand=1):
        mask = Image.fromarray(np.uint8(indices(member, n) != 0) * 255)
        if expand:
            mask = mask.filter(ImageFilter.MaxFilter(expand * 2 + 1))
        centered = Image.new('L', self.body['canvas'])
        offset = tuple((self.body['canvas'][i] - member['canvas'][i]) // 2 for i in range(2))
        centered.paste(mask, offset)
        return centered.resize(self.size, Image.Resampling.LANCZOS)

    def snow(self, member, n, image):
        if self.theater != 'SNOW':
            return image
        dry = row_for(self.identity)
        peer = dry['members'][self.row['members'].index(member)]
        reference_frame = n
        if self.identity == 'YAPSYT' and 'ACTIVE' in member['roles'] and 52 <= n < 78:
            # The snow archive has another 26 colored damaged poses outside
            # the native loops. Temperate slots 52+ are already shadows.
            # Reuse matching damaged-pose geometry rather than comparing to
            # shadow indices and incorrectly whitening ordinary silver caps.
            wet_slot, dry_slot = raw_for(member['source']['sha256'])['frames'][n], raw_for(peer['source']['sha256'])['frames'][n - 26]
            assert all(wet_slot[k] == dry_slot[k] for k in ('x', 'y', 'width', 'height', 'legacyRenderSize'))
            reference_frame = n - 26
        wet_image, dry_image = decode(self.row, member, n), decode(dry, peer, reference_frame)
        if wet_image.size != dry_image.size:
            delta = tuple((dry_image.size[i] - wet_image.size[i]) // 2 for i in range(2))
            assert all(v % 2 == 0 for v in (dry_image.size[i] - wet_image.size[i] for i in range(2)))
            dry_image = dry_image.crop((*delta, delta[0] + wet_image.width, delta[1] + wet_image.height))
        a, b = np.array(wet_image), np.array(dry_image)
        rgb = a[..., :3].astype(float)
        support = (rgb.min(axis=2) > 180) & (rgb.max(axis=2) - rgb.min(axis=2) < 45)
        support &= np.max(np.abs(rgb - b[..., :3].astype(float)), axis=2) > 30
        source = ROOT / 'art-v1/YACNST-SNOW/normal-raw.png'
        master = np.array(Image.open(source).convert('RGBA'))
        samples = master[(master[..., :3].min(axis=2) > 210) & (master[..., 3] >= 240)]
        assert len(samples) > 200
        yy, xx = np.indices(self.size[::-1])
        layer = samples[(yy * 71 + xx * 13) % len(samples)].copy()
        coverage = Image.new('L', self.body['canvas'])
        coverage.paste(Image.fromarray(np.uint8(support) * 255),
                       tuple((self.body['canvas'][i] - member['canvas'][i]) // 2 for i in range(2)))
        layer[..., 3] = np.array(coverage.resize(self.size, Image.Resampling.LANCZOS))
        layer[..., 3] = np.minimum(layer[..., 3], np.array(image.getchannel('A')))
        result = image.copy()
        result.alpha_composite(Image.fromarray(layer))
        return result

    def put(self, member, n, image, operation, data=None):
        if self.retained and (bool(self.retained_roles.intersection(member['roles']))
                             if self.retained_roles is not None else 'BUILDUP' not in member['roles']):
            record = next(r for r in self.retained['frames']
                          if (r['member'], r['nativeFrame']) == (member['source']['member'], n))
            image = Image.new('RGBA', tuple(v * self.density for v in member['canvas']))
            data = Image.new('RGBA', image.size, (0, 0, 0, 255))
            if record['base']:
                offset = tuple(record['native'][k] * self.density for k in ('x', 'y'))
                image.paste(Image.open(self.retained_folder / record['base']), offset)
                data.paste(Image.open(self.retained_folder / record['data']), offset)
            operation = record['operation']
        target_size = tuple(v * self.density for v in member['canvas'])
        if image.size == self.size and target_size != self.size:
            offset = tuple((target_size[i] - self.size[i]) // 2 for i in range(2))
            mapped = Image.new('RGBA', target_size)
            mapped.alpha_composite(image, offset)
            image = mapped
            if data is not None:
                mapped_data = Image.new('RGBA', target_size, (0, 0, 0, 255))
                mapped_data.paste(data, offset)
                data = mapped_data
        assert image.size == tuple(v * self.density for v in member['canvas'])
        key = (member['source']['member'], n)
        assert key not in self.frames
        self.frames[key] = image
        self.operations[key] = operation
        if data is not None:
            assert data.size == image.size
            self.data_overrides[key] = data

    def export(self):
        records = []
        for member in self.row['members']:
            raw = raw_for(member['source']['sha256'])
            has_native_paint = any(16 <= p <= 31 for frame in raw['frames'][:member['visibleFrames']] for p in frame['pixels'])
            for n, native in enumerate(raw['frames'][:member['visibleFrames']]):
                key = (member['source']['member'], n)
                image = self.frames[key]
                width, height = (v * self.density for v in native['legacyRenderSize'])
                stem = f'{member["source"]["member"][:-4]}-{n:03}-{self.density}x'
                record = {'member': member['source']['member'], 'nativeFrame': n, 'density': self.density,
                          'native': {k: native[k] for k in ('x', 'y', 'width', 'height', 'legacyRenderSize', 'empty')},
                          'operation': self.operations[key], 'base': None, 'data': None}
                if width and height:
                    exported = Image.new('RGBA', (width, height))
                    if not native['empty']:
                        x, y = native['x'] * self.density, native['y'] * self.density
                        exported.paste(image.crop((x, y, x + native['width'] * self.density, y + native['height'] * self.density)))
                    rgba = np.array(exported)
                    data = np.zeros_like(rgba)
                    data[..., 3] = 255
                    if key in self.data_overrides and not native['empty']:
                        authored_data = self.data_overrides[key].crop((x, y, x + native['width'] * self.density,
                                                                     y + native['height'] * self.density))
                        data_image = Image.fromarray(data)
                        data_image.paste(authored_data)
                        data = np.array(data_image)
                        data[..., 0][rgba[..., 3] == 0] = 0
                        data[..., 1][rgba[..., 3] == 0] = 0
                    elif (has_native_paint or self.identity == 'YAYARD') and self.identity != 'GAFWLL':
                        # Seed authored paint that agrees with native palette
                        # ownership. Native support is evidence, not a final
                        # silhouette clamp: the helper then follows the entire
                        # connected authored panel beyond that support.
                        source_indices = indices(member, n)
                        owner = (source_indices >= 16) & (source_indices <= 31)
                        owner = Image.fromarray(np.uint8(owner) * 255).crop((native['x'], native['y'],
                            native['x'] + native['width'], native['y'] + native['height']))
                        seed = Image.new('L', (width, height))
                        seed.paste(owner.resize((native['width'] * self.density, native['height'] * self.density),
                                                Image.Resampling.NEAREST))
                        from audit import red_paint
                        supported_paint = (np.array(seed) != 0) & red_paint(rgba)
                        if self.identity in RATIONALE:
                            authored_core, fixed_core = intended_core(self.identity, rgba, native, self.density)
                            supported_paint |= authored_core
                        ramp = np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4
                        shades = abs(rgba[..., 0, None].astype(float) - ramp).argmin(axis=2)
                        data[..., 0][supported_paint] = 255
                        data[..., 1][supported_paint] = shades[supported_paint]
                        data, _, neutral = complete_data(rgba, data, self.density, self.identity, member['source']['member'])
                        if self.identity in RATIONALE:
                            fixed = ~paint_envelope(self.identity, rgba.shape[:2], native, self.density)
                            data[..., 0][fixed] = 0
                            data[..., 1][fixed] = 0
                    assert not data[..., 0][rgba[..., 3] == 0].any()
                    assert data[..., 1].max() <= 15 and not data[..., 2].any()
                    exported.save(self.out / (stem + '.png'))
                    Image.fromarray(data).save(self.out / (stem + '-data.png'))
                    record.update(base=stem + '.png', data=stem + '-data.png',
                                  ownerPixels=int((data[..., 0] >= 128).sum()))
                else:
                    assert native['empty'], 'Zero-extent native slots are retained without 1x1 sprites'
                    record['ownerPixels'] = 0
                records.append(record)
        report = {'status': 'COMPLETE_SLOT_EXPORT_VISUAL_AND_RUNTIME_PENDING', 'identity': self.identity,
            'theater': self.theater, 'density': self.density, 'frames': records, 'registrations': self.registrations,
            'localPartTransforms': self.local_parts,
            'constructionMotion': self.construction_motion,
            'approvalHash': sha(ROOT / 'representative-acceptance-v1.json'),
            'nativeShadows': 'RETAINED_ORIGINAL', 'geometry': 'Native canvas, trim, empty slots and logical timing retained',
            'coverage': 'Authored solid material and one-pixel AA support; exterior generated haze excluded from exports',
            'materialIntent': RATIONALE.get(self.identity, 'Material-specific owner intent/native gameplay review pending'),
            'ownerEvidence': 'MATERIAL_MASK_CANDIDATE_NATIVE_VALIDATION_PENDING'}
        (self.out / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
        print(self.identity, self.theater, self.density, len(records), report['status'], flush=True)
