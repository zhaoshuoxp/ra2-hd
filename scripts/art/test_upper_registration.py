"""Check painted continuity and alpha through shared attachment triangles."""
import unittest

import numpy as np

from upper_registration import warp_landmarks


class AttachmentMeshTests(unittest.TestCase):
    def test_identity_keeps_dark_openings_and_every_painted_texel(self):
        image = np.zeros((160, 160, 4), np.uint8)
        image[32:128, 32:128] = [92, 110, 133, 255]
        image[50:74, 60:100] = [3, 4, 5, 255]
        image[90:108, 80:98] = 0
        points = [[0, 0], [40, 0], [40, 40], [0, 40], [13, 18], [29, 20]]
        actual, _ = warp_landmarks(image, points, points)
        np.testing.assert_array_equal(actual, image)

    def test_shared_triangles_keep_a_complete_translated_part(self):
        image = np.zeros((192, 192, 4), np.uint8)
        image[40:120, 40:120] = [171, 124, 79, 255]
        image[48:56, 48:112] = [9, 15, 20, 255]
        source = np.array([[10, 10], [30, 10], [30, 30], [10, 30], [17, 18], [24, 25]], float)
        actual, receipt = warp_landmarks(image, source, source+[4, 3])
        expected = np.zeros_like(image)
        expected[52:132, 56:136] = image[40:120, 40:120]
        np.testing.assert_array_equal(actual, expected)
        self.assertAlmostEqual(receipt['minimumAreaRatio'], 1)


if __name__ == '__main__':
    unittest.main()
