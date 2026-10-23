"""Source-pinned Desert airport components with stable paving and native light phases."""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from showcase_registration import capacity, independently_sample, register, sha

ACTIVE = 'cdairp_a.shp'
BODY = 'cdairp.shp'
ACTIVE_SHA = 'ddba2d36ceec1d077112f385796649bad57d1802672f65abefff569d4622f29a'
BODY_SHA = '829c3a4cb7cd91c97324ff472c42d835711d6e2012dd568dcec3a57c17f628bc'


class RegisteredAirport:
    """Keep authored surface detail stationary; native data supplies pose and light timing."""

    def __init__(self, profile, native, prepared):
        self.declaration = profile.get('nativeDesertAirportMotion')
        self.materials, self.paving, self.indices, self.audit = {}, {}, {}, []
        self.registered_pedestal = {}
        if not self.declaration:
            return
        declaration = self.declaration
        assert declaration['schema'] == 'source-pinned-desert-airport-components-v1'
        assert declaration['sourceSha256'] == native[ACTIVE]['sha256'] == ACTIVE_SHA
        assert declaration['bodySourceSha256'] == native[BODY]['sha256'] == BODY_SHA
        assert declaration['lightSigmaNativePixels'] == 1.25
        assert native[ACTIVE]['canvas'] == native[BODY]['canvas'] == [188, 186]
        assert native[ACTIVE]['totalFrames'] == 20 and not native[ACTIVE]['hasShadow']
        assert declaration['frames'] == {str(i): native[ACTIVE]['frames'][i]['indexSha256'] for i in range(10)}
        assert all(binding['role'] == 'ACTIVE' and binding['nativeArt']['LoopStart'] == '0'
                   and binding['nativeArt']['LoopEnd'] == '9' and binding['nativeArt']['Rate'] == '50'
                   for binding in native[ACTIVE]['bindings'] if binding['nativeArt'].get('LoopStart') == '0')
        prepared = Path(prepared)
        for name, numbers in [(ACTIVE, range(10)), (BODY, [0])]:
            for number in numbers:
                frame = native[name]['frames'][number]
                file = prepared / 'native' / frame['indexFile']
                assert sha(file) == frame['indexSha256']
                canvas = np.zeros((186, 188), np.uint8)
                x, y = frame['origin']
                width, height = frame['size']
                canvas[y:y + height, x:x + width] = np.fromfile(file, np.uint8).reshape(height, width)
                self.indices[name, number] = canvas
        palette_file = prepared / 'native' / (native[ACTIVE]['palette']['sha256'] + '.pal')
        assert sha(palette_file) == declaration['paletteSha256'] == native[ACTIVE]['palette']['sha256']
        palette = np.fromfile(palette_file, np.uint8).reshape(256, 3).astype(np.float64) * 4
        paving_mask = (self.indices[ACTIVE, 0] != 0) & (self.indices[ACTIVE, 0] != 12)
        paving_mask[:100] = False
        self.paving_mask = paving_mask
        pedestal_mask = (self.indices[ACTIVE, 0] != 0) & (self.indices[ACTIVE, 0] != 12)
        pedestal_mask[75:] = False
        for number in range(1, 10):
            pedestal_mask &= self.indices[ACTIVE, number] == self.indices[ACTIVE, 0]
        assert pedestal_mask.sum() > 20
        self.pedestal_mask = pedestal_mask
        floor_material, radar_materials = {}, {}
        for part in declaration['parts']:
            file = Path(part['master'])
            assert sha(file) == part['masterSha256']
            with Image.open(file) as master:
                master = master.convert('RGBA')
                assert list(master.size) == part['boardSize']
                for row in part['rows']:
                    rect, plate = register(master, row, part['boardSize'], isolated=len(part['rows']) == 1)
                    available = capacity(rect, row['nativeBounds'])
                    assert available >= 4
                    self.audit.append(dict(master=str(file), sha256=part['masterSha256'],
                        part=part['part'], nativeFrame=row['nativeFrame'], sourceRect=rect,
                        availableDensity=available))
                    x, y, _, _ = row['nativeCanvasRect']
                    left, top, right, bottom = row['nativeBounds']
                    for density in [2, 4]:
                        canvas = np.zeros((186 * density, 188 * density, 3), np.uint8)
                        canvas[(y + top) * density:(y + bottom) * density,
                               (x + left) * density:(x + right) * density] = independently_sample(
                            plate, ((right - left) * density, (bottom - top) * density))
                        if part['part'] == 'paving':
                            assert row['nativeFrame'] == 0 and density not in floor_material
                            floor_material[density] = canvas
                        else:
                            identity = row['nativeFrame'], density
                            assert identity not in radar_materials
                            radar_materials[identity] = canvas
        assert set(floor_material) == {2, 4}
        assert set(radar_materials) == {(number, density) for number in range(10) for density in [2, 4]}
        sigma = declaration['lightSigmaNativePixels']
        original = self.indices[ACTIVE, 0]
        # Original RGB contributes only a smooth phase illumination delta, never material detail.
        # Native alpha, data/owner indices and all frame metadata remain in the normal exporter.
        self.light_fields = {}
        for number in range(10):
            indices = self.indices[ACTIVE, number]
            valid = paving_mask & (indices != 0) & (indices != 12)
            delta = (palette[indices] - palette[original]) * valid[..., None]
            weight = ndimage.gaussian_filter(valid.astype(np.float64), sigma)
            light = ndimage.gaussian_filter(delta, (sigma, sigma, 0)) / np.maximum(weight[..., None], .001)
            light[weight < .001] = 0
            self.light_fields[number] = light
            for density in [2, 4]:
                expanded = np.stack([np.asarray(Image.fromarray(light[..., channel].astype(np.float32)).resize(
                    (188 * density, 186 * density), Image.Resampling.BICUBIC)) for channel in range(3)], axis=-1)
                paving = np.clip(floor_material[density].astype(np.float64) + expanded, 0, 255).round().astype(np.uint8)
                self.paving[number, density] = paving
                radar = radar_materials[number, density].copy()
                fixed = np.repeat(np.repeat(pedestal_mask, density, 0), density, 1)
                radar[fixed] = radar_materials[0, density][fixed]
                canvas = paving.copy()
                canvas[:100 * density] = radar[:100 * density]
                self.materials[number, density] = canvas

    def owns(self, name, number):
        return bool(self.declaration) and name == ACTIVE and 0 <= number < 10

    def frame_rgb(self, frame, density):
        canvas = self.materials[frame['slot'], density]
        x, y = frame['origin']
        width, height = frame['size']
        return canvas[y * density:(y + height) * density, x * density:(x + width) * density].copy()

    def fixed_body_paving(self, rgb, name, frame, density):
        if not self.declaration or name != BODY or frame['slot'] != 0:
            return rgb
        x, y = frame['origin']
        width, height = frame['size']
        mask = self.paving_mask & (self.indices[BODY, 0] != 0) & (self.indices[BODY, 0] != 12)
        mask = np.repeat(np.repeat(mask[y:y + height, x:x + width], density, 0), density, 1)
        paving = self.paving[0, density][y * density:(y + height) * density, x * density:(x + width) * density]
        rgb[mask] = paving[mask]
        return rgb

    def freeze_registered_pedestal(self, base, name, frame, density):
        """Freeze fixed metal after fractional owner-boundary underpaint has finished."""
        if not self.owns(name, frame['slot']):
            return base
        x, y = frame['origin']
        width, height = frame['size']
        if frame['slot'] == 0:
            assert density not in self.registered_pedestal
            canvas = np.zeros((186 * density, 188 * density, 3), np.uint8)
            canvas[y * density:(y + height) * density, x * density:(x + width) * density] = base[
                :height * density, :width * density, :3]
            self.registered_pedestal[density] = canvas
        else:
            mask = np.repeat(np.repeat(self.pedestal_mask[y:y + height, x:x + width], density, 0), density, 1)
            reference = self.registered_pedestal[density][y * density:(y + height) * density,
                                                       x * density:(x + width) * density]
            rgb = base[:height * density, :width * density, :3]
            rgb[mask] = reference[mask]
        return base
