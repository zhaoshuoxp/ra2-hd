"""Deterministic export helpers for accepted artwork and native SHP contracts."""
import hashlib
import os
import json
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'unified-density'))
from master_regeneration import resolve_master, master_provenance

ROOT = Path('.artifacts/soviet-remaining')
D = int(os.environ.get('RA2_EXPORT_DENSITY', '2'))
assert D in (2, 4)


def area(image, size):
    if image.size == size:
        return image.copy()
    a = np.asarray(image).astype(np.float32) / 255
    rgb = np.where(a[..., :3] <= .04045, a[..., :3] / 12.92, ((a[..., :3] + .055) / 1.055) ** 2.4)
    prem = np.dstack([rgb * a[..., 3:4], a[..., 3]])
    p = np.stack([np.asarray(Image.fromarray(prem[..., k]).resize(size, Image.Resampling.BOX)) for k in range(4)], axis=2)
    lin = np.divide(p[..., :3], p[..., 3:4], out=np.zeros_like(p[..., :3]), where=p[..., 3:4] > 0)
    p[..., :3] = np.where(lin <= .0031308, lin * 12.92, 1.055 * np.maximum(lin, 0) ** (1 / 2.4) - .055)
    return Image.fromarray(np.uint8(np.clip(np.rint(p * 255), 0, 255)))


def bounds(image):
    return image.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()


def cut(image, mask):
    out = image.copy()
    out.putalpha(Image.fromarray(np.uint8(np.asarray(image.getchannel('A'), dtype=float) * np.asarray(mask) / 255)))
    return out


class Family:
    def __init__(self, name, revision='full-exports-v1'):
        self.name, self.revision = name, revision
        self.out = Path(os.environ['RA2_EXPORT_OUTPUT']) / name if os.environ.get('RA2_EXPORT_OUTPUT') else ROOT / revision / name
        self.out.mkdir(parents=True, exist_ok=False)
        self.check = json.loads((ROOT / 'production-checklist-v2.json').read_text())['families'][name]
        self.inventory = json.loads((ROOT / 'source-v1/inventory.json').read_text())['families'][name]
        self.sources = {m['member']: json.loads((ROOT / 'source-v1' / name / (m['member'] + '.json')).read_text()) for m in self.check['members']}
        self.size = tuple(next(iter(self.sources.values()))['canvas'])
        self.hdsize = tuple(v * D for v in self.size)
        self.frames, self.operations, self.registrations = {}, {}, {}
        self.rep = json.loads((ROOT / 'review-exports-v4/report.json').read_text())['families'][name]
        self.build_member = next((m['member'] for m in self.check['members'] if 'BUILDUP' in m['roles']), None)
        self.body_member = next(m['member'] for m in self.check['members'] if 'body' in m['roles'])
        self.build_count = len(next((m['authorFrames'] for m in self.check['members'] if m['member'] == self.build_member), []))

    def blank(self):
        return Image.new('RGBA', self.hdsize)

    def source_image(self, member, frame, remap=False):
        f = self.sources[member]['frames'][frame]
        image = Image.new('L', self.size)
        if f['width'] and f['height']:
            indices = np.array(f['pixels'], dtype=np.uint8).reshape(f['height'], f['width'])
            coverage = (indices >= 16) & (indices <= 31) if remap else indices > 0
            image.paste(Image.fromarray(np.uint8(coverage) * 255), (f['x'], f['y']))
        return image

    def guide(self, member, frame, dilate=1, remap=False):
        image = self.source_image(member, frame, remap)
        if dilate:
            image = image.filter(ImageFilter.MaxFilter(dilate * 2 + 1))
        image = image.resize(self.hdsize, Image.Resampling.NEAREST)
        return image if remap else image.filter(ImageFilter.GaussianBlur(.3 * D))

    def native_bounds(self, member, frame):
        return self.source_image(member, frame).getbbox()

    def load(self, path):
        path = Path(path)
        self.registrations.setdefault(str(path), dict(sha256=hashlib.sha256(path.read_bytes()).hexdigest(), uses=[]))
        return Image.open(path).convert('RGBA')

    def crop_path(self, label):
        return ROOT / 'full-art-crops-v4' / self.name / (label + '.png')

    def register(self, path, box, crop=None):
        image = self.load(path)
        if crop is not None:
            image = image.crop(crop)
        b = bounds(image)
        assert b and box, (self.name, str(path), 'missing registration bounds')
        source = image.crop(b)
        target = ((box[2] - box[0]) * D, (box[3] - box[1]) * D)
        density = min(source.width / (box[2] - box[0]), source.height / (box[3] - box[1]))
        source = resolve_master(source, target)
        density = min(source.width / (box[2] - box[0]), source.height / (box[3] - box[1]))
        out = self.blank()
        out.alpha_composite(area(source, target), (box[0] * D, box[1] * D))
        self.registrations[str(path)]['uses'].append(dict(crop=crop, alphaCrop=b, target=box, sourceDensity=density))
        return out

    def accepted(self):
        if D == 4:
            reg = self.rep['registration']
            path = Path(self.rep.get('master', ROOT / 'art-v1' / self.name / 'normal-raw.png'))
            image = self.load(path).crop(reg['crop'])
            sx, sy = reg.get('scaleXY', [reg['scale'], reg['scale']])
            assert max(sx, sy) * D <= 1, ('Insufficient accepted master', self.name)
            out = self.blank()
            out.alpha_composite(area(image, (round(image.width * sx * D), round(image.height * sy * D))),
                                tuple(round(v * D) for v in reg['translation']))
            return out
        path = ROOT / 'review-exports-v4' / self.name / 'normal-hd.png'
        result = self.load(path)
        assert result.size == self.hdsize
        self.registrations[str(path)]['acceptedExport'] = True
        return result

    def ref_bounds(self, state):
        return bounds(Image.open(ROOT / 'references-v1' / self.name / (state + '.png')).convert('RGBA'))

    def put(self, member, frame, image, operation, **details):
        assert image.size == self.hdsize
        self.frames[member, frame] = image
        self.operations[member, frame] = dict(member=member, nativeFrame=frame, operation=operation, **details)

    def export(self):
        exports = []
        for member in self.check['members']:
            name = member['member']; raw = self.sources[name]; sequence = []
            for n in member['authorFrames']:
                f = raw['frames'][n]
                full = self.frames[name, n]
                size = (max(1, (f['width'] + f['width'] % 2) * D), max(1, (f['height'] + f['height'] % 2) * D))
                image = Image.new('RGBA', size)
                if not f['empty']:
                    image.paste(full.crop((f['x'] * D, f['y'] * D, (f['x'] + f['width']) * D, (f['y'] + f['height']) * D)), (0, 0))
                a = np.asarray(image); rgb = a[..., :3].astype(float)
                allowed = np.zeros(size[::-1], bool)
                if f['width'] and f['height']:
                    support = self.guide(name, n, 3, remap=True)
                    allowed[:f['height'] * D, :f['width'] * D] = np.asarray(support.crop((f['x'] * D, f['y'] * D,
                        (f['x'] + f['width']) * D, (f['y'] + f['height']) * D))) > 0
                red = allowed & (rgb[..., 0] > rgb[..., 1] * 1.5) & (rgb[..., 0] > rgb[..., 2] * 1.5) & (a[..., 3] > 0)
                shades = np.abs(rgb[..., 0, None] - np.array([63, 59, 55, 52, 48, 44, 41, 37, 33, 30, 26, 22, 19, 15, 11, 8]) * 4).argmin(axis=2)
                data = np.zeros_like(a); data[..., 3] = 255; data[..., 0][red] = 255; data[..., 1][red] = shades[red]
                stem = f'{name[:-4]}-{n:02}-{D}x'
                image.save(self.out / (stem + '.png')); Image.fromarray(data).save(self.out / (stem + '-data.png'))
                exports.append(dict(member=name, nativeFrame=n, exports=[dict(density=D, base=stem + '.png', data=stem + '-data.png',
                    visiblePixels=int((a[..., 3] > 0).sum()), remapPixels=int(red.sum()), shades=np.unique(shades[red]).tolist())]))
                canvas = Image.new('RGBA', self.hdsize, '#34483d')
                if f['width'] and f['height']:
                    canvas.alpha_composite(image, (f['x'] * D, f['y'] * D))
                sequence.append(area(canvas, self.size).convert('RGB'))
            sheet = Image.new('RGB', (self.size[0] * 5, math.ceil(len(sequence) / 5) * (self.size[1] + 28)), '#34483d')
            draw = ImageDraw.Draw(sheet)
            for n, image in enumerate(sequence):
                x, y = n % 5 * self.size[0], n // 5 * (self.size[1] + 28)
                sheet.paste(image, (x, y + 28)); draw.text((x + 4, y + 2), str(n), fill='white', font_size=20)
            sheet.save(self.out / (name + '-contact.png'))
        status = 'BASE_EXPORT_RIGID_BUILD_CORRECTION_REQUIRED' if os.environ.get('SOVIET_RIGID_BUILD_PENDING') else 'COMPLETE_EXPORT_CANDIDATE_VISUAL_QA_PENDING'
        report = dict(status=status, family=self.name, density=D,
            frames=exports, composition=list(self.operations.values()), registrations=self.registrations,
            retainedOriginal={m['member']: m['retainedOriginalFrames'] for m in self.check['members']},
            approvalScope='Representatives accepted; complete-family visual and gameplay review pending',
            sourceUse='Native metadata, coverage and motion only; all RGB from recorded authored inputs', **master_provenance())
        (self.out / 'candidate-review.json').write_text(json.dumps(report, indent=2) + '\n')
        print(self.name, len(exports), report['status'], flush=True)
