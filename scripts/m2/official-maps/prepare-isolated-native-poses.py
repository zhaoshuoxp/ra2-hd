"""Prepare immutable enlarged native pose references, without authoring new pixels."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--prepared', type=Path, required=True)
parser.add_argument('--member', required=True)
parser.add_argument('--frames', nargs='+', type=int, required=True)
args = parser.parse_args()
assert not args.output.exists(), 'Preserve previous native guide receipts'
source_file = args.prepared / 'source.json'
source = next(item for item in json.loads(source_file.read_text())['sources']
              if item['member'] == args.member)
args.output.mkdir(parents=True)
records = []
for number in args.frames:
    frame = source['frames'][number]
    width, height = frame['size']
    rgba_file = args.prepared / 'native' / frame['file']
    index_file = args.prepared / 'native' / frame['indexFile']
    assert sha(rgba_file) == frame['rgbaSha256']
    assert sha(index_file) == frame['indexSha256']
    pixels = np.frombuffer(rgba_file.read_bytes(), np.uint8).reshape(height, width, 4).copy()
    indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(height, width)
    body = (indices != 0) & (indices != 12)
    pixels[~body] = 0
    ys, xs = np.where(body)
    bounds = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    pose = Image.fromarray(pixels).crop(bounds)
    scale = min(800 // pose.width, 1200 // pose.height)
    assert scale >= 4
    enlarged = pose.resize((pose.width * scale, pose.height * scale), Image.Resampling.NEAREST)
    guide = Image.new('RGBA', (1024, 1536))
    position = [(guide.width - enlarged.width) // 2, (guide.height - enlarged.height) // 2]
    guide.paste(enlarged, position)
    file = args.output / f'{args.member}-{number:03d}-reference.png'
    guide.save(file)
    records.append(dict(frame=number, file=str(file), sha256=sha(file), nativeBounds=bounds,
                        nativeFrame=frame, scale=scale, position=position,
                        excludedIndices=[0, 12]))
receipt = dict(schema='m2-3-isolated-native-pose-guides-v1', member=args.member,
               sourceSha256=source['sha256'], palette=source['palette'],
               preparedSourceSha256=sha(source_file), boardSize=[1024, 1536], frames=records,
               operation='Native RGBA enlarged with nearest-neighbor; no authored pixels')
(args.output / 'recipe.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(dict(output=str(args.output), frames=len(records))))
