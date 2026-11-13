"""Small metadata fixtures guard the visible bridge aggregate dependency."""
import copy
from pathlib import Path
import unittest
from campaign_bridge_art import bridge_aggregate_admission

ROOT = Path(__file__).resolve().parents[2]


def fixture():
    sources = []
    for number in range(1, 27):
        sources.append(dict(identity=f'LOBRDB{number:02d}', member=f'lobrdb{number:02d}.urb',
            format='shp', nativeObjectType=4, nativeKind='overlay', nativeRegistry='OverlayTypes',
            canvas=[180, 120], bodyFrames=3, totalFrames=6, hasShadow=True, remapable=False,
            framePalettes={}, palette=dict(member='isourb.pal',
                sha256='b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'),
            sha256=f'{number:064x}', nativeRules=dict(Land='Road', NoUseTileLandType='true'),
            frames=[dict(slot=slot, empty=slot != 1, origin=[30, 19], size=[120, 70],
                         indexSha256=f'{number * 6 + slot:064x}') for slot in range(6)]))
    return dict(theater='URBAN', mission='all08u.map', missionSha256='0' * 64, sources=sources,
        nativeRegistryQualification=dict(schema='retail-shp-object-kind-v1'))


class BridgeSourceTests(unittest.TestCase):
    def test_visible_frame1_is_required_even_when_file_frames0_and2_are_empty(self):
        admitted = bridge_aggregate_admission(fixture(), ROOT)
        self.assertEqual(len(admitted['members']), 26)
        self.assertEqual({member['nativeFrame'] for member in admitted['members']}, {1})
        self.assertEqual(admitted['nativeOverlayIds'], [205, 230])

    def test_incomplete_or_reordered_aggregate_is_rejected(self):
        for change in [lambda d: d['sources'].pop(), lambda d: d['sources'].reverse()]:
            original = fixture(); change(original)
            with self.assertRaises(AssertionError): bridge_aggregate_admission(original, ROOT)

    def test_empty_visible_frame_cannot_be_admitted(self):
        original = fixture(); original['sources'][4]['frames'][1]['empty'] = True
        with self.assertRaises(AssertionError): bridge_aggregate_admission(original, ROOT)

    def test_wrong_theater_palette_or_object_class_is_rejected(self):
        for change in [lambda d: d.update(theater='SNOW'),
                       lambda d: d['sources'][0]['palette'].update(member='isotem.pal'),
                       lambda d: d['sources'][0].update(nativeObjectType=2),
                       lambda d: d['sources'][0].update(remapable=True)]:
            original = fixture(); change(original)
            with self.assertRaises(AssertionError): bridge_aggregate_admission(original, ROOT)

    def test_member_and_native_slot_layout_are_pinned(self):
        for change in [lambda d: d['sources'][0].update(member='lobrdb01.tem'),
                       lambda d: d['sources'][0]['frames'][0].update(empty=False),
                       lambda d: d['sources'][0].update(bodyFrames=1)]:
            original = copy.deepcopy(fixture()); change(original)
            with self.assertRaises(AssertionError): bridge_aggregate_admission(original, ROOT)


if __name__ == '__main__':
    unittest.main()
