"""Retain original NPC foot shadows without restoring low-resolution body ink."""
import math

import numpy as np
from scipy import ndimage


def source_foot_shadow(indices, body):
    native = indices == 12
    labels, _ = ndimage.label(native, np.ones((3, 3)))
    foot_start = max(body[1], body[3] - max(2, math.ceil((body[3]-body[1]) * .15)))
    retained = np.unique(labels[foot_start:][native[foot_start:]])
    return native & np.isin(labels, retained)
