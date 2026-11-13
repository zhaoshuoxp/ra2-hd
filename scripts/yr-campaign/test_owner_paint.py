"""Regression checks for fixed salmon siding beside authored owner-red trim."""
import unittest

import numpy as np

from owner_paint import owner_paint_declaration, owner_red_candidates, limit_owner_region

POLICY = dict(schema='yr-authored-owner-red-v1', maximumNeutralChannelFraction=.22)


class OwnerPaintTests(unittest.TestCase):
    def source_region_policy(self, frames):
        source = dict(remapable=True, bodyFrames=frames, bindings=[dict(kind='building')],
            sha256='rocket', palette=dict(sha256='palette'),
            frames=[dict(indexSha256=str(frame)) for frame in range(frames)])
        declaration = dict(schema='yr-source-pinned-owner-region-v2', maximumNeutralChannelFraction=.67,
            maximumNativeOwnerDistance=2, sourceSha256='rocket', paletteSha256='palette',
            originalIndices=[str(frame) for frame in range(frames)])
        return source, declaration

    def test_salmon_siding_and_wood_shadows_stay_fixed(self):
        rgba = np.array([[
            [210, 145, 128, 255], [157, 84, 70, 255], [100, 48, 35, 255],
            [240, 8, 6, 255], [132, 9, 6, 255], [240, 8, 6, 0],
        ]], dtype=np.uint8)
        self.assertEqual(owner_red_candidates(rgba, POLICY).tolist(),
            [[False, False, False, True, True, False]])

    def test_declaration_keeps_the_original_building_source_and_states(self):
        source = dict(remapable=True, bodyFrames=4, bindings=[dict(kind='building')],
            sha256='body', palette=dict(sha256='palette'),
            frames=[dict(indexSha256=str(frame)) for frame in range(8)])
        declaration = owner_paint_declaration(source, POLICY)
        self.assertEqual(declaration['sourceSha256'], 'body')
        self.assertEqual(declaration['paletteSha256'], 'palette')
        self.assertEqual(declaration['originalIndices'], ['0', '1', '2', '3'])
        for changed in [dict(remapable=False), dict(bodyFrames=1), dict(bindings=[dict(kind='terrain')])]:
            with self.assertRaises(AssertionError):
                owner_paint_declaration({**source, **changed}, POLICY)

    def test_three_body_and_forty_active_frames_require_exact_source_controls(self):
        for frames in [3, 40]:
            source, declaration = self.source_region_policy(frames)
            self.assertEqual(owner_paint_declaration(source, declaration), declaration)
            for field, value in [('sourceSha256', 'other'), ('paletteSha256', 'other'),
                                 ('originalIndices', ['other']), ('maximumNativeOwnerDistance', 3)]:
                with self.assertRaises(AssertionError):
                    owner_paint_declaration(source, {**declaration, field: value})

    def test_fixed_red_gantry_details_cannot_borrow_distant_rim_ownership(self):
        _, declaration = self.source_region_policy(40)
        indices = np.zeros((16, 16), np.uint8)
        indices[7, 7] = 20
        for distance in [2, 4]:
            policy = {**declaration, 'maximumNativeOwnerDistance': distance}
            for density in [2, 4]:
                with self.subTest(distance=distance, density=density):
                    paint = np.zeros((16*density, 16*density), bool)
                    points = [(7*density, 7*density), (0, 0), (15*density, 15*density)]
                    for y, x in points:
                        paint[y, x] = True
                    result = limit_owner_region(paint, indices, density, policy)
                    self.assertTrue(result[points[0]])
                    self.assertFalse(result[points[1]])
                    self.assertFalse(result[points[2]])
                    self.assertEqual(limit_owner_region(paint, indices, density, POLICY).tolist(), paint.tolist())
                    self.assertFalse(limit_owner_region(paint, np.zeros_like(indices), density, policy).any())

    def test_source_bound_policy_retains_red_paint_highlights(self):
        _, declaration = self.source_region_policy(40)
        rgba = np.array([[[180, 60, 60, 255], [240, 150, 150, 255],
            [210, 145, 128, 255], [240, 150, 150, 0]]], np.uint8)
        self.assertEqual(owner_red_candidates(rgba, declaration).tolist(), [[True, True, False, False]])
        self.assertEqual(owner_red_candidates(rgba, POLICY).tolist(), [[False, False, False, False]])


if __name__ == '__main__':
    unittest.main()
