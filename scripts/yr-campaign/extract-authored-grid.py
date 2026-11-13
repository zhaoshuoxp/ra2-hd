"""Extract unchanged RGBA cells from source-pinned authored animation sheets."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('declaration', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
read = lambda file: json.loads(file.read_text())
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
declaration = read(args.declaration)
assert declaration['schema'] == 'yr-authored-animation-grid-v1'
source_file = root / declaration['source']['file']
assert sha(source_file) == declaration['source']['sha256']
original = read(source_file)
source, = [s for s in original['sources'] if s['member'] == declaration['source']['member']]
assert source['sha256'] == declaration['source']['memberSha256']
assert set(declaration['authoredFrames']).issubset(range(source['bodyFrames']))
output = args.output.resolve()
output.mkdir(exist_ok=False)
masters, extraction = {}, []
for grid in declaration['grids']:
    file = root / grid['file']
    assert sha(file) == grid['sha256']
    image = Image.open(file).convert('RGBA')
    columns, rows = grid['columns'], grid['rows']
    assert len(grid['frames']) == columns * rows
    boundaries = []
    for length, count, key in [(image.width, columns, 'columnBoundaries'),
                               (image.height, rows, 'rowBoundaries')]:
        edges = grid.get(key)
        if edges is None:
            assert length % count == 0, 'An odd-sized sheet needs explicit integer cell boundaries'
            edges = [cell * (length // count) for cell in range(count + 1)]
        assert len(edges) == count + 1 and edges[0] == 0 and edges[-1] == length
        assert all(isinstance(edge, int) for edge in edges)
        widths = np.diff(edges)
        assert widths.min() > 0 and widths.max() - widths.min() <= 1
        boundaries.append(edges)
    x_edges, y_edges = boundaries
    for cell, frame_number in enumerate(grid['frames']):
        assert str(frame_number) not in masters
        assert frame_number in declaration['authoredFrames']
        column, row = cell % columns, cell // columns
        rect = [x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1]]
        sprite = image.crop(rect)
        alpha = np.asarray(sprite.getchannel('A'))
        boundary = np.concatenate([alpha[0], alpha[-1], alpha[:, 0], alpha[:, -1]])
        assert boundary.max() < 4, 'A visible sprite crosses its declared cell boundary'
        assert alpha.min() == 0 and alpha.max() == 255
        bounds = sprite.getchannel('A').point(lambda a: 255 if a >= 4 else 0).getbbox()
        assert bounds
        frame = source['frames'][frame_number]
        indices_file = source_file.parent / 'native' / f"{source['member']}-{frame_number}.index"
        assert sha(indices_file) == frame['indexSha256']
        indices = np.frombuffer(indices_file.read_bytes(), np.uint8).reshape(frame['size'][::-1])
        body = (indices != 0) & (indices != 12)
        native_bounds = Image.fromarray(body.astype(np.uint8) * 255).getbbox()
        assert native_bounds
        capacity = min((bounds[2] - bounds[0]) / (native_bounds[2] - native_bounds[0]),
                       (bounds[3] - bounds[1]) / (native_bounds[3] - native_bounds[1]))
        assert capacity >= 4, (frame_number, capacity)
        destination = output / f'frame-{frame_number}.png'
        sprite.save(destination)
        assert Image.open(destination).convert('RGBA').tobytes() == sprite.tobytes()
        masters[str(frame_number)] = dict(file=str(destination.relative_to(root)), sha256=sha(destination))
        extraction.append(dict(frame=frame_number, sourceIndexSha256=frame['indexSha256'],
            sheet=grid['file'], sheetSha256=grid['sha256'], cell=cell, rect=rect,
            alphaBoundaryMaximum=int(boundary.max()), independentDensityCapacity=capacity,
            masterRgbaSha256=hashlib.sha256(sprite.tobytes()).hexdigest()))
assert set(masters) == {str(f) for f in declaration['authoredFrames']}
assert len({row['masterRgbaSha256'] for row in extraction}) == len(extraction)
result = dict(schema='yr-extracted-authored-animation-grid-v1', sourceSha256=source['sha256'],
    declaration=str(args.declaration), declarationSha256=sha(args.declaration),
    masters=masters, extraction=extraction, userVisualAcceptance='PENDING',
    qualification='Exact RGBA cell extraction only. No painting, resizing or normalization. '
        'Original frame indices, geometry, palettes, shadows and timing remain source-bound. '
        'Independent exports and native animation continuity require subsequent inspection.')
(output / 'extraction.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(dict(frames=len(masters), minimumDensityCapacity=min(
    row['independentDensityCapacity'] for row in extraction), output=str(output))))
