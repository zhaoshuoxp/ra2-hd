"""Check actual original NPC body-ink omissions and complete foot-shadow retention."""
import hashlib
import json
from pathlib import Path
import sys
import unittest

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts/m1/yuri-units'))
from task_npc_ground import source_foot_shadow


class OriginalNpcGroundTests(unittest.TestCase):
    def inspect(self, directory, identity, slot):
        base = ROOT / '.local/source-art/yr-campaign-v1/task-infantry' / directory
        original = json.loads((base/'source.json').read_text())
        source, = [source for source in original['sources'] if source['identity'] == identity]
        frame = source['frames'][slot]
        raw = (base/'native'/f"{source['member']}-{slot}.index").read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), frame['indexSha256'])
        indices = np.frombuffer(raw, np.uint8).reshape(frame['size'][1], frame['size'][0])
        body = Image.fromarray(np.uint8((indices != 0) & (indices != 12))*255).getbbox()
        mask = source_foot_shadow(indices, body)
        self.assertFalse(np.any(mask & (indices != 12)))
        return indices, mask

    def test_scientist_head_and_coat_ink_do_not_return_as_isolated_native_blocks(self):
        indices, mask = self.inspect('original-desert-r1', 'EINS', 1)
        self.assertEqual(int(indices[1,9]), 12); self.assertFalse(mask[1,9])
        self.assertEqual(int(indices[18,2]), 12); self.assertFalse(mask[18,2])
        self.assertEqual(int(mask.sum()), 47)
        np.testing.assert_array_equal(mask[21:], indices[21:] == 12)

    def test_general_cap_ink_is_omitted_and_both_original_shoe_shadows_remain(self):
        indices, mask = self.inspect('original-newurban-r1', 'PENTGEN', 3)
        self.assertEqual(int(indices[2,8]), 12); self.assertFalse(mask[2,8])
        self.assertEqual(int(mask.sum()), 24)
        np.testing.assert_array_equal(mask[23:], indices[23:] == 12)

    def test_camel_keeps_the_entire_connected_diagonal_cast_shadow(self):
        indices, mask = self.inspect('original-desert-r1', 'CAML', 4)
        self.assertEqual(int(indices[20,10]), 12); self.assertFalse(mask[20,10])
        self.assertEqual(int(mask.sum()), 116)
        self.assertTrue(np.any(mask[18:22]))


if __name__ == '__main__':
    unittest.main()
