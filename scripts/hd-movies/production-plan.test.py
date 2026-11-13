"""Check frame identity, bounded context, cut isolation and overlap-add coverage."""
import unittest
from production_plan import windows, weights

class ProductionPlanTests(unittest.TestCase):
    def test_every_frame_survives_short_and_long_shots(self):
        for count in [1, 2, 39, 40, 41, 70, 71, 101, 1024]:
            plan = windows(count)
            contributions = [[] for _ in range(count)]
            emitted = []
            previous = 0
            for window in plan:
                self.assertLessEqual(window['end'] - window['start'], 40)
                for frame, weight in zip(range(window['start'], window['end']), weights(window)):
                    contributions[frame].append((frame * 7., weight))
                emitted.extend(range(previous, window['flushEnd']))
                previous = window['flushEnd']
            self.assertEqual(emitted, list(range(count)))
            for frame, values in enumerate(contributions):
                self.assertTrue(values)
                self.assertAlmostEqual(sum(value * weight for value, weight in values) / sum(weight for _, weight in values), frame * 7.)

    def test_cuts_reset_both_temporal_directions(self):
        cuts = [1, 41, 42, 149]
        boundaries = [0, *cuts, 177]
        for window in windows(177, cuts):
            first, last = boundaries[window['shot']:window['shot'] + 2]
            self.assertGreaterEqual(window['start'], first)
            self.assertLessEqual(window['end'], last)
            self.assertTrue(all(weight > 0 for weight in weights(window)))

    def test_invalid_clock_or_context_is_rejected(self):
        for args in [(0,), (20, [0]), (20, [20]), (20, [], 40, 40)]:
            with self.assertRaises(AssertionError):
                windows(*args)

if __name__ == '__main__':
    unittest.main()
