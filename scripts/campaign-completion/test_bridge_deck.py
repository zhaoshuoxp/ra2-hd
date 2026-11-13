"""Synthetic materials verify original-axis joins without copying game artwork."""
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_bridge_deck import ContinuousBridgeDeck


class BridgeDeckTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='ra2-bridge-deck-')
        self.file = Path(self.temporary.name) / 'material.png'
        y, x = np.indices((1024, 1024))
        Image.fromarray(np.stack([30 + x // 32, 35 + y // 32, 40 + x // 64], axis=2).astype(np.uint8)).save(self.file)
        self.sha = hashlib.sha256(self.file.read_bytes()).hexdigest()

    def tearDown(self):
        self.temporary.cleanup()

    def deck(self, number, axis=None, profile=False):
        source = dict(canvas=[180, 120], member=f'lobrdb{number:02d}.urb', frames=[{}, dict(origin=[30, 19])])
        declaration = dict(schema='native-urban-bridge-continuous-deck-v1', material=str(self.file),
                           sha256=self.sha, axis=axis or ('x' if number <= 9 or 19 <= number <= 22 else 'y'))
        if profile:
            paint = dict(yellow=[dict(center=c, width=.024) for c in [-1.28, -.027, .027, 1.28]],
                         white=[dict(center=c, width=.035, period=1/3, phase=0, length=.215) for c in [-.675, .675]])
            file = self.file.parent / 'road.json'
            file.write_text(json.dumps(dict(schema='source-pinned-bridge-road-paint-v1',
                pigments=dict(asphalt=[48, 52, 52], yellow=[190, 170, 90], white=[180, 178, 172]),
                directions=dict(x=paint, y=paint), ends={f'lobrdb{n:02d}.urb': dict(entry=True, hinge=.1, slope=.75)
                    for n in [21, 23]})))
            declaration['roadProfile'] = dict(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest())
        return ContinuousBridgeDeck(declaration, source)

    def test_both_native_directions_join_with_identical_surface_and_paint(self):
        across = np.linspace(-1.33, 1.33, 1001)
        for number in [1, 10]:
            deck = self.deck(number)
            samples = []
            for along in [-.5, .5]:
                u, v = (np.full_like(across, along), across) if number == 1 else (across, np.full_like(across, along))
                color, _, _ = deck.sample(90 + 30 * u - 30 * v, 49 + 15 * u + 15 * v)
                samples.append(color)
            np.testing.assert_array_equal(*samples)

    def test_axis_mapping_rejects_the_old16_and26_montage_error(self):
        for number in [16, 26]:
            self.assertEqual(self.deck(number).axis, 'y')
            with self.assertRaises(AssertionError):
                self.deck(number, 'x')

    def test_collapsed_and_disconnected_artwork_is_never_painted_over(self):
        y, x = np.indices((140, 240))
        rgb = np.stack([32 + x % 70, 32 + y % 70, 32 + (x + y) % 70], axis=2).astype(np.uint8)
        for number in [7, 16, 20, 22, 24, 26]:
            for profile in [False, True]:
                np.testing.assert_array_equal(self.deck(number, profile=profile).apply(rgb, 2), rgb)

    def test_profile_retains_three_dashes_and_end_rise_in_both_directions(self):
        along = np.linspace(-.5, .5, 1201)
        for number in [1, 10, 21, 23]:
            deck = self.deck(number, profile=True)
            across = np.full_like(along, -.675) + deck.rise(along)
            u, v = (along, across) if deck.axis == 'x' else (across, along)
            color, _, _ = deck.sample(90 + 30*u - 30*v, 49 + 15*u + 15*v)
            white = np.all(color == [180, 178, 172], axis=1)
            starts = np.count_nonzero(np.diff(np.r_[False, white].astype(int)) == 1)
            self.assertEqual(starts, 3)
            if number in [21, 23]:
                self.assertAlmostEqual(deck.rise(np.array([-.5]))[0], .45)
                self.assertEqual(deck.rise(np.array([.5]))[0], 0)
            else:
                self.assertTrue(np.all(deck.rise(along) == 0))

    def test_only_the_original_healthy_end_of_a_damaged_neighbor_changes(self):
        rgb = np.full((70, 120, 3), 52, np.uint8)
        result = self.deck(14).apply(rgb, 1)
        self.assertGreater(np.count_nonzero(result != rgb), 0)
        np.testing.assert_array_equal(result[37, 45], rgb[37, 45])
        self.assertFalse(np.array_equal(result[22, 75], rgb[22, 75]))

    def test_material_identity_is_pinned(self):
        self.file.write_bytes(b'changed material')
        with self.assertRaises(AssertionError):
            self.deck(1)


if __name__ == '__main__':
    unittest.main()
