"""Regression checks using original frame indices supplied from formal resources."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_contours import coverage
from showcase_curved_arch import CurvedArchGeometry, NORMAL_INDEX

source = json.loads(Path(sys.argv.pop()).read_text())
frames = [np.frombuffer(base64.b64decode(frame['indices']), np.uint8).reshape(frame['height'], frame['width'])
          for frame in source['frames']]


class CurvedArchRegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.geometry = CurvedArchGeometry(frames[0])

    def test_real_source_and_unrelated_geometry_guard(self):
        self.assertEqual(hashlib.sha256(frames[0].tobytes()).hexdigest(), NORMAL_INDEX)
        changed = frames[0].copy()
        changed[0, 0] ^= 1
        with self.assertRaises(AssertionError):
            CurvedArchGeometry(changed)

    def test_native_sampling_steps_do_not_return_in_the_four_x_contour(self):
        def left_positions(alpha):
            rows = alpha[400:920]
            edge = np.argmax(rows > 0, axis=1)
            return edge + 1 - rows[np.arange(len(rows)), edge] / 255

        previous = coverage(frames[0] != 0, 4)
        current = self.geometry.alpha(frames[0], 0, 4)
        self.assertGreater(np.abs(np.diff(left_positions(previous))).max(), .9)
        self.assertLess(np.abs(np.diff(left_positions(current))).max(), .65)

    def test_independent_densities_preserve_state_area_bounds_voids_and_original_logical_sizes(self):
        for density in [2, 4]:
            for slot, frame in enumerate(frames):
                alpha = self.geometry.alpha(frame, slot, density)
                self.assertEqual(alpha.shape, tuple(np.array(frame.shape) * density))
                area = alpha.sum() / 255 / density ** 2
                self.assertLess(abs(area / np.count_nonzero(frame) - 1), .025)
                self.assertGreater(np.count_nonzero((alpha > 0) & (alpha < 255)), 100)
        for proof in self.geometry.proof:
            self.assertLessEqual(proof['maximumNativeDeviation'], .95)


unittest.main()
