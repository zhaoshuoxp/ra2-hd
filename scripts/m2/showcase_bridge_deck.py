"""Sample one continuous authored bridge deck in original isometric coordinates."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


class ContinuousBridgeDeck:
    def __init__(self, declaration, source):
        assert declaration['schema'] == 'native-urban-bridge-continuous-deck-v1'
        assert source['canvas'] == [180, 120]
        number = int(source['member'][6:8])
        assert 1 <= number <= 26
        self.axis = 'x' if number <= 9 or 19 <= number <= 22 else 'y'
        assert declaration['axis'] == self.axis
        file = Path(declaration['material'])
        assert hashlib.sha256(file.read_bytes()).hexdigest() == declaration['sha256']
        self.rgb = np.asarray(Image.open(file).convert('RGB'))
        assert min(self.rgb.shape[:2]) >= 1024
        self.origin = source['frames'][1]['origin']
        self.intact = number in [1, 2, 3, 4, 10, 11, 12, 13, 19, 21, 23, 25]
        self.join = {5: 1, 6: -1, 8: 1, 9: -1, 14: -1, 15: 1, 17: -1, 18: 1}.get(number)
        self.road = None
        if 'roadProfile' in declaration:
            file = Path(declaration['roadProfile']['file'])
            assert hashlib.sha256(file.read_bytes()).hexdigest() == declaration['roadProfile']['sha256']
            self.road = json.loads(file.read_text())
            assert self.road['schema'] == 'source-pinned-bridge-road-paint-v1'
            self.paint = self.road['directions'][self.axis]
            self.end = self.road['ends'].get(source['member'])
            self.tone = np.asarray(self.road['pigments']['asphalt']) - np.median(self.rgb.reshape(-1, 3), axis=0)

    def rise(self, along):
        if not self.road or not self.end:
            return np.zeros_like(along)
        return self.end['slope'] * np.maximum(0, self.end['hinge'] - along
            if self.end['entry'] else along - self.end['hinge'])

    def sample(self, x, y):
        u, v = (x - 90) / 60 + (y - 49) / 30, -(x - 90) / 60 + (y - 49) / 30
        along, across = (u, v) if self.axis == 'x' else (v, u)
        # Both ends sample the same authored latitude, with a smooth derivative.
        # No native low-resolution RGB enters the authored material.
        ty = (1 - np.cos(along * 2 * np.pi)) / 2
        tx = .12 + (across + 1.35) / 2.7 * .76
        coordinates = (ty * (self.rgb.shape[0] - 1), np.clip(tx, 0, 1) * (self.rgb.shape[1] - 1))
        color = np.stack([ndimage.map_coordinates(self.rgb[..., c], coordinates, order=1, mode='nearest')
                          for c in range(3)], axis=-1)
        if self.road:
            color = np.uint8(np.clip(color.astype(float) + self.tone, 0, 255))
            surface = across - self.rise(along)
            for stroke in self.paint['yellow']:
                color[np.abs(surface - stroke['center']) < stroke['width'] / 2] = self.road['pigments']['yellow']
            for stroke in self.paint['white']:
                phase = (along - stroke['phase'] + stroke['period'] / 2) % stroke['period'] - stroke['period'] / 2
                mask = (np.abs(surface - stroke['center']) < stroke['width'] / 2) & (np.abs(phase) < stroke['length'] / 2)
                color[mask] = self.road['pigments']['white']
            return color, along, surface
        line = (np.abs(np.abs(across) - .027) < .012) | (np.abs(np.abs(across) - 1.28) < .014)
        white = (np.abs(np.abs(across) - .675) < .014) & (((along + .25) % 1) < .5)
        color[line] = [225, 185, 24]
        color[white] = [198, 205, 201]
        return color, along, across

    def apply(self, rgb, density):
        height, width = rgb.shape[:2]
        yy, xx = np.indices((height, width), dtype=float)
        x = (xx + .5) / density + self.origin[0]
        y = (yy + .5) / density + self.origin[1]
        color, along, across = self.sample(x, y)
        # Rebuild complete healthy road planes. Native adjacency identifies the
        # healthy joining end of a damaged neighbor; never paint collapsed spans.
        road = (np.abs(across) <= 1.34) & (np.abs(along) <= .55)
        if not self.intact:
            road &= False if self.join is None else (along * self.join >= .42)
            road &= (rgb.max(2) < 112) & (rgb.max(2) - rgb.min(2) < 28)
        output = rgb.copy()
        output[road] = color[road]
        return output
