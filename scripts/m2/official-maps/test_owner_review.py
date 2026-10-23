"""Check fractional palette and alpha composition against the native sRGB path."""
import unittest

import numpy as np
from PIL import Image

from owner_review import compose_owner, paste_linear_preview


class OwnerPreviewTests(unittest.TestCase):
    def test_half_coverage_blends_in_linear_light(self):
        base=Image.fromarray(np.array([[[0,0,0,255]]],np.uint8))
        data=Image.fromarray(np.array([[[128,0,0,255]]],np.uint8))
        palette=np.zeros((256,3),np.uint8)
        palette[16]=255
        self.assertEqual(tuple(np.asarray(compose_owner(base,data,palette,linear_light=True))[0,0]),(188,188,188,255))

    def test_binary_native_shades_stay_exact(self):
        palette=np.zeros((256,3),np.uint8)
        palette[16:32]=np.arange(48,dtype=np.uint8).reshape(16,3)*5
        base=Image.fromarray(np.full((1,16,4),255,np.uint8))
        data=np.zeros((1,16,4),np.uint8)
        data[...,0]=255;data[...,1]=np.arange(16);data[...,3]=255
        picture=compose_owner(base,Image.fromarray(data),palette,linear_light=True)
        np.testing.assert_array_equal(np.asarray(picture)[0,:,:3],palette[16:32])

    def test_alpha_preview_uses_same_linear_blend(self):
        board=Image.new('RGB',(1,1),(0,0,0))
        picture=Image.fromarray(np.array([[[255,255,255,128]]],np.uint8))
        paste_linear_preview(board,picture,(0,0))
        self.assertEqual(board.getpixel((0,0)),(188,188,188))


if __name__=='__main__':
    unittest.main()
