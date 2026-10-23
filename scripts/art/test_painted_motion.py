"""Regression checks for stationary material, native movement and owner blending."""
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np

from painted_motion import blend_material, cohere_pose_materials, linearize, share_stationary_material
from painted_cutout import fit_painted_pose, extract_grid_poses
from PIL import Image
from buildup import retain_turret_dependencies, sha


class PaintedMotionTests(unittest.TestCase):
    def setUp(self):
        self.palette = np.full((256, 3), 64, np.uint8)
        self.palette[0] = 0
        self.palette[16:32] = np.column_stack((np.linspace(252, 32, 16), np.zeros((16, 2)))).astype(np.uint8)
        self.palette[60] = [20, 20, 20]
        self.palette[186] = [212, 120, 16]

    def test_stationary_material_with_new_and_moving_parts(self):
        native = [np.zeros((24, 24), np.uint8) for _ in range(3)]
        pairs = []
        for phase, guide in enumerate(native):
            guide[12:23, 2:22] = 60
            guide[1 + phase:6 + phase, 4:9] = 186
            if phase:
                guide[3:8, 17:21] = 186
            alpha = np.repeat(np.repeat(guide > 0, 4, axis=0), 4, axis=1)
            base = np.zeros((96, 96, 4), np.uint8)
            yy, xx = np.indices((96, 96))
            base[..., 0] = (xx * 3 + phase * 53) % 256
            base[..., 1] = (yy * 5 + phase * 31) % 256
            base[..., 2] = 170
            base[..., 3] = alpha * 255
            base[~alpha] = 0
            data = np.zeros_like(base)
            data[..., 3] = alpha * 255
            pairs.append([base, data])
        result, _ = cohere_pose_materials(native, pairs, self.palette)
        for phase in (0, 1):
            np.testing.assert_array_equal(result[phase][0][60:80, 24:64], result[phase+1][0][60:80, 24:64])
        for before, after in zip(pairs, result):
            np.testing.assert_array_equal(before[0][..., 3], after[0][..., 3])
        # The new component stays absent in the first pose; native motion keeps
        # its successive positions rather than freezing the terminal silhouette.
        self.assertEqual(int(result[0][0][12:32, 68:84, 3].sum()), 0)
        self.assertEqual(int(result[0][0][4:8, 16:36, 3].sum()), 4 * 20 * 255)
        self.assertEqual(int(result[2][0][4:8, 16:36, 3].sum()), 0)
        for a, b in zip(result[-1], pairs[-1]):
            np.testing.assert_array_equal(a, b)

    def test_owner_blend_preserves_shader_coefficients_and_endpoints(self):
        base = np.full((1, 3, 4), [100, 100, 100, 255], np.uint8)
        data = np.full((1, 3, 4), [170, 4, 0, 255], np.uint8)
        material = np.full((1, 3, 4), [25, 25, 25, 255], np.uint8)
        remap = np.full((1, 3, 4), [230, 8, 0, 255], np.uint8)
        before_base, before_data = base.copy(), data.copy()
        weight = np.array([[[0], [.5], [1]]])
        def render(b, d):
            w = d[..., :1] / 255
            return linearize(b[..., :3] / 255) * (1 - w) + linearize(self.palette[16 + d[..., 1]] / 255) * w
        expected = render(base, data) * (1 - weight) + render(material, remap) * weight
        blend_material(base, data, material, remap, weight, self.palette)
        np.testing.assert_array_equal(base[:, 0], before_base[:, 0])
        np.testing.assert_array_equal(data[:, 0], before_data[:, 0])
        np.testing.assert_array_equal(base[:, 2], material[:, 2])
        np.testing.assert_array_equal(data[:, 2], remap[:, 2])
        np.testing.assert_allclose(render(base, data), expected, atol=.025)
        self.assertLessEqual(int(data[..., 1].max()), 15)

    def test_faint_donor_cannot_become_opaque_receiver_material(self):
        guide = np.full((12, 12), 60, np.uint8)
        base = np.full((48, 48, 4), [180, 150, 120, 255], np.uint8)
        data = np.zeros_like(base)
        donor = np.full_like(base, [0, 0, 0, 1])
        donor[20:24, 20:24] = [80, 90, 100, 255]
        before = base.copy()
        share_stationary_material(guide, guide, [base, data], [donor, data.copy()], self.palette)
        np.testing.assert_array_equal(base[8:16, 8:16], before[8:16, 8:16])
        np.testing.assert_array_equal(base[20:24, 20:24], donor[20:24, 20:24])

    def test_cutout_keeps_object_protrusion_and_real_hole(self):
        rgba = np.full((20, 20, 4), [255, 0, 255, 0], np.uint8)
        rgba[4:18, 4:16] = [80, 90, 100, 255]
        rgba[1:8, 13:16] = [80, 90, 100, 255]  # Thin missile/antenna.
        rgba[9:13, 8:12, 3] = 0  # A real see-through opening.
        fitted = fit_painted_pose(Image.fromarray(rgba), (48, 68))
        self.assertGreater(int(fitted[:16, 38:48, 3].sum()), 10000)
        self.assertLess(int(fitted[36:44, 18:26, 3].max()), 32)
        solid = fitted[..., 3] >= 224
        self.assertLess(int(fitted[..., 0][solid].max()), 100)
        clean = rgba.copy()
        clean[..., :3][clean[..., 3] == 0] = 0
        np.testing.assert_array_equal(fitted, fit_painted_pose(Image.fromarray(clean), (48, 68)))
        self.assertGreater(int(fitted[..., 3].sum()), 400000)

    def test_neighbor_cell_fragment_cannot_shrink_the_object(self):
        rgba = np.zeros((40, 40, 4), np.uint8)
        rgba[4:30, 4:36] = [100, 110, 120, 255]
        rgba[39, 20:24] = [200, 210, 220, 255]  # Next row's dish tip.
        fitted = fit_painted_pose(Image.fromarray(rgba), (64, 52))
        self.assertEqual(int(fitted[..., 3].min()), 255)
        np.testing.assert_allclose(fitted[..., :3], np.full((52, 64, 3), [100, 110, 120]), atol=1)

    def test_separate_early_footings_are_preserved(self):
        rgba = np.zeros((40, 40, 4), np.uint8)
        rgba[8:32, 18:32] = [100, 110, 120, 255]
        rgba[8:12, 5:9] = [130, 140, 150, 255]
        fitted = fit_painted_pose(Image.fromarray(rgba), (54, 48))
        self.assertGreater(int(fitted[:8, :8, 3].sum()), 10000)

    def test_grid_decode_keeps_crossing_tip_without_neighbor_contamination(self):
        sheet = np.zeros((80, 40, 4), np.uint8)
        sheet[4:32, 4:36] = [100, 110, 120, 255]
        sheet[44:76, 4:36] = [150, 160, 170, 255]
        sheet[37:45, 18:22] = [150, 160, 170, 255]
        poses = extract_grid_poses(Image.fromarray(sheet), 1, 2)
        self.assertEqual(poses[0][1], [4, 4, 36, 32])
        self.assertEqual(poses[1][1], [4, 37, 36, 76])
        self.assertEqual(int(np.array(poses[0][0])[..., 3].min()), 255)
        self.assertEqual(int(np.array(poses[1][0])[:7, 14:18, 3].min()), 255)

    def test_immutable_prefix_anchors_new_material_without_changing_terminal(self):
        native = [np.full((12, 12), 60, np.uint8) for _ in range(4)]
        pairs = []
        for phase in range(4):
            base = np.full((48, 48, 4), [40 + phase * 45, 90, 110, 255], np.uint8)
            data = np.zeros_like(base)
            data[..., 3] = 255
            pairs.append([base, data])
        result, _ = cohere_pose_materials(native, pairs, self.palette, frozen=(0, 1))
        for phase in (0, 1, 3):
            for before, after in zip(pairs[phase], result[phase]):
                np.testing.assert_array_equal(before, after)
        np.testing.assert_array_equal(result[2][0][12:36, 12:36], result[1][0][12:36, 12:36])

    def test_new_family_keeps_complete_hash_pinned_relative_turret(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            old = root / "hd-packs/grand-cannon/old/turret"
            old.mkdir(parents=True)
            (old / "manifest.json").write_text('{"family":"GTGCAN"}\n')
            (old / "heading-0.png").write_bytes(b"retained turret fixture")
            expected = sha(old / "manifest.json")
            family = {"turret": {"path": "hd-packs/grand-cannon/old/turret/", "sha256": expected}}
            target = root / "hd-packs/grand-cannon/new/family.json"
            retain_turret_dependencies(family, target, root)
            self.assertEqual(family["turret"]["path"], "hd-packs/grand-cannon/new/turret/")
            self.assertEqual(family["turret"]["sha256"], expected)
            self.assertEqual(sha(target.parent / "turret/heading-0.png"), sha(old / "heading-0.png"))
            self.assertEqual(sha(target.parent / "turret/manifest.json"), expected)
            # An existing destination must never be replaced by a rerun.
            with self.assertRaises(FileExistsError):
                retain_turret_dependencies(family, target, root)


if __name__ == "__main__":
    unittest.main()
