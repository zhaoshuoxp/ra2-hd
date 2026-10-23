"""Verify every embedded review image/video, native dimensions, controls and offline references."""
import argparse
import base64
import hashlib
import io
import json
import subprocess
import sys
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('html', type=Path)
parser.add_argument('metadata', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
sha = lambda data: hashlib.sha256(data).hexdigest()
metadata = json.loads(args.metadata.read_text())
assert sha(args.html.read_bytes()) == metadata['review']['sha256']
expected_pngs = Counter(row['sha256'] for row in metadata['images'])
expected_pngs.update(row['poster']['sha256'] for row in metadata['videos'])
expected_videos = Counter(row['sha256'] for row in metadata['videos'])
pngs, videos, script = [], [], []
dimensions = {row['sha256']: row['size'] for row in metadata['images']}
for row in metadata['videos']:
    file = Path(row['poster']['file'])
    assert sha(file.read_bytes()) == row['poster']['sha256']
    dimensions[row['poster']['sha256']] = list(Image.open(file).size)


def decode(value, mime):
    prefix = f'data:{mime};base64,'
    assert value.startswith(prefix)
    data = base64.b64decode(value[len(prefix):], validate=True)
    digest = sha(data)
    if mime == 'image/png':
        assert digest in expected_pngs
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            assert list(image.size) == dimensions[digest]
        pngs.append(digest)
    else:
        assert digest in expected_videos
        videos.append(digest)
    return digest


class ReviewParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.details, self.figure, self.controls, self.video_contexts = [], None, [], []
        self.in_script = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'details':
            self.details.append('open' in attrs)
        if tag == 'figure':
            assert 'data-density' in attrs and 'data-view' in attrs
            self.figure = attrs
        if tag == 'img':
            digest = decode(attrs['src'], 'image/png')
            assert [int(attrs['width']), int(attrs['height'])] == dimensions[digest]
        if tag == 'video':
            assert self.figure
            decode(attrs['src'], 'video/webm')
            decode(attrs['poster'], 'image/png')
            assert attrs['width'] == '720' and attrs['height'] == '640' and 'controls' in attrs
            self.video_contexts.append(dict(figure=self.figure, collapsed=not all(self.details)))
        if tag == 'a':
            assert attrs.get('href', '').startswith('#')
        if tag in ['script', 'link', 'iframe', 'source']:
            assert 'src' not in attrs and 'href' not in attrs
        if tag == 'button':
            self.controls.append(attrs)
        if tag == 'script':
            self.in_script = True

    def handle_endtag(self, tag):
        if tag == 'details':
            self.details.pop()
        if tag == 'figure':
            self.figure = None
        if tag == 'script':
            self.in_script = False

    def handle_data(self, value):
        if self.in_script:
            script.append(value)


review = ReviewParser()
review.feed(args.html.read_text())
assert Counter(pngs) == expected_pngs and Counter(videos) == expected_videos
assert len(pngs) == metadata['embeddedPngs'] == 70
assert len(videos) == metadata['embeddedVideos'] == 6
assert {row.get('data-d') for row in review.controls if 'data-d' in row} == {'2', '4'}
assert {row.get('data-v') for row in review.controls if 'data-v' in row} == {'new', 'original', 'all'}
for density in ['2', '4']:
    for view in ['new', 'original', 'all']:
        visible = [row for row in review.video_contexts if not row['collapsed']
            and row['figure']['data-density'] in ['any', density]
            and (view == 'all' or row['figure']['data-view'] == view)]
        assert len(visible) == (4 if view == 'all' else 2), (density, view)
script_file = args.output / 'embedded-script.js'
script_file.write_text('\n'.join(script))
subprocess.run(['node', '--check', str(script_file)], check=True, capture_output=True)
sys.path.insert(0, str(Path('.artifacts/m2-4/media-verifier-tools-v1').resolve()))
import av
video_checks = []
for row in metadata['videos']:
    file = Path(row['file'])
    assert sha(file.read_bytes()) == row['sha256']
    count, first_time, last_time = 0, None, None
    with av.open(str(file)) as container:
        stream, = container.streams.video
        assert stream.width == 720 and stream.height == 640 and stream.codec_context.name == 'vp9'
        for frame in container.decode(stream):
            assert frame.width == 720 and frame.height == 640
            timestamp = float(frame.pts * frame.time_base)
            if first_time is None:
                first_time = timestamp
            assert last_time is None or timestamp >= last_time
            last_time = timestamp
            count += 1
    assert count > 1 and last_time > first_time
    video_checks.append(dict(file=str(file), sha256=row['sha256'], decodedFrames=count,
        size=[720, 640], codec='vp9', firstTime=first_time, lastTime=last_time,
        decoder='Isolated PyAV ' + av.__version__))
result = dict(status='PASS_ALL_EMBEDDED_MEDIA_DIMENSIONS_HASHES_OFFLINE_REFERENCES_AND_CONTROL_STRUCTURE',
    html=dict(file=str(args.html), sha256=sha(args.html.read_bytes()), bytes=args.html.stat().st_size),
    decodedPngs=len(pngs), verifiedNativeVideos=len(videos), videoChecks=video_checks,
    scriptSyntax='PASS', defaultVisibleNew4xVideos=2,
    browserInteractive='NOT_RUN_PREVIOUS_LOCAL_PROTOCOL_RESTRICTION_REUSED_NO_BYPASS',
    userAcceptance='PENDING', windows='NOT_RUN')
with (args.output / 'report.json').open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'videoChecks'}))
