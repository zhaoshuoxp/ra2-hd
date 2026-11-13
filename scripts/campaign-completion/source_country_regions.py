"""Extend unambiguous original political votes within accepted country boundaries."""
import hashlib

import numpy as np
from scipy import ndimage


def source_country_regions(base, red, blue, specification):
    assert specification['schema'] == 'visible-source-country-regions-v1'
    votes = specification['minimumVotes']
    dominance = specification['minimumDominance']
    fraction = specification['minimumFraction']
    assert 16 <= votes <= 256 and .8 <= dominance <= 1 and .001 <= fraction <= .1
    assert base.ndim == 3 and base.shape[2] == 3 and red.shape == blue.shape == base.shape[:2]
    r, g, b = np.moveaxis(base.astype(float), -1, 0)
    land = ndimage.binary_fill_holes(ndimage.binary_closing(base.max(2) > 20, iterations=2))
    green = (g > 5) & (g > r * 1.2) & (g > b * .8)
    barrier = ndimage.binary_closing(green, iterations=1) | green
    labels, count = ndimage.label(land & ~ndimage.binary_dilation(barrier, iterations=1))
    area = np.bincount(labels.ravel(), minlength=count + 1)
    red_votes = np.bincount(labels.ravel(), weights=red.ravel(), minlength=count + 1)
    blue_votes = np.bincount(labels.ravel(), weights=blue.ravel(), minlength=count + 1)
    total = red_votes + blue_votes
    qualified = (total >= np.maximum(votes, area * fraction)) & (np.maximum(red_votes, blue_votes) >= total * dominance)
    qualified[0] = False
    state = np.zeros(count + 1, dtype=np.uint8)
    state[qualified & (red_votes > blue_votes)] = 1
    state[qualified & (blue_votes > red_votes)] = 2
    distance, nearest = ndimage.distance_transform_edt(labels == 0, return_indices=True)
    extended = labels[tuple(nearest)]
    extended[(distance > 4) | ~land | green] = 0
    declared = state[extended]
    output_red, output_blue = red.copy(), blue.copy()
    completed = qualified[extended] & (red + blue < .01)
    output_red[completed] = (declared[completed] == 1).astype(float)
    output_blue[completed] = (declared[completed] == 2).astype(float)
    output_red[green] = 0; output_blue[green] = 0
    records = [{'region': int(index), 'pixels': int(area[index]),
                'redVotes': round(float(red_votes[index]), 3), 'blueVotes': round(float(blue_votes[index]), 3),
                'state': ['unchanged', 'red', 'blue'][int(state[index])]}
               for index in np.flatnonzero(total > 0) if index]
    report = {'schema': specification['schema'], 'regions': int(count),
              'qualifiedRegions': int(qualified.sum()), 'retainedUnqualifiedRegions': int(count - qualified.sum()),
              'greenBoundaryPixelsPreserved': int(green.sum()),
              'regionLabelsSha256': hashlib.sha256(labels.astype('<i4').tobytes()).hexdigest(),
              'sourceVotes': records,
              'policy': 'Unambiguous visible source votes complete only unobserved areas separated by accepted green borders. Every local original political mask has priority, including minority state/province colors. Conflicted regions keep local original masks without whole-region inference; unobserved regions retain accepted color. Material, coastline, grid registration and green boundary RGB are unchanged.'}
    return output_red, output_blue, report
