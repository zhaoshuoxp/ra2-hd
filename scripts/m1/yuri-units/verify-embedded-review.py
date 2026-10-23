"""Verify actual embedded media bytes and static structure without claiming browser playback."""
import argparse
import base64
import hashlib
import io
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('receipt', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--ffmpeg', type=Path, required=True)
a = p.parse_args()
receipt = json.loads(a.receipt.read_text())
file = Path(receipt['html'])
sha = lambda raw: hashlib.sha256(raw).hexdigest()
assert sha(file.read_bytes()) == receipt['sha256']


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.videos = [], []

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        if tag == 'img':
            self.images.append(attr['src'])
        if tag == 'video':
            assert 'controls' in attr and attr.get('preload') == 'metadata'
            self.videos.append(attr['src'])
            self.images.append(attr['poster'])
        if tag in ['link', 'script', 'iframe']:
            assert not attr.get('src') and not attr.get('href'), 'Unexpected external resource'


parser = Parser()
parser.feed(file.read_text())
assert len(parser.videos) == receipt['embeddedVideos']
assert len(parser.images) == receipt['imageCount'] + receipt['embeddedVideos']
a.output.mkdir(exist_ok=False)
sizes = []
for src in parser.images:
    assert src.startswith('data:image/png;base64,')
    with Image.open(io.BytesIO(base64.b64decode(src.split(',')[1], validate=True))) as im:
        im.load()
        sizes.append(list(im.size))
manifest = json.loads(Path(receipt['mediaManifest']).read_text())
expected = {c['sha256'] for c in manifest['clips']}
videos = []
for i, src in enumerate(parser.videos):
    assert src.startswith('data:video/mp4;base64,')
    raw = base64.b64decode(src.split(',')[1], validate=True)
    assert sha(raw) in expected
    clip = a.output / f'embedded-{i}.mp4'
    clip.write_bytes(raw)
    result = subprocess.run([str(a.ffmpeg), '-nostdin', '-hide_banner', '-i', str(clip), '-f', 'null', '-'],
                            capture_output=True, text=True, check=True)
    assert 'Video: h264' in result.stderr and '1400x900' in result.stderr
    videos.append({'sha256': sha(raw), 'bytes': len(raw), 'fullyDecoded': True,
                   'duration': re.search(r'Duration: ([\d:.]+)', result.stderr).group(1), 'size': [1400, 900]})
script = a.output / 'review-inline-script.js'
script.write_text(re.search(r'<script>(.*?)</script>', file.read_text(), re.S).group(1))
subprocess.run(['node', '--check', str(script)], check=True)
result = {'status': 'PASS_EMBEDDED_MEDIA_DECODE_AND_STATIC_STRUCTURE', 'html': str(file), 'sha256': sha(file.read_bytes()),
          'figureImageCount': receipt['imageCount'], 'embeddedImageSourcesDecoded': len(parser.images),
          'embeddedVideosDecoded': videos, 'imageDimensions': sizes, 'externalResources': 0, 'inlineScriptSyntax': 'PASS',
          'interactiveBrowserUi': 'NOT_RUN',
          'disclosure': 'Embedded bytes fully decoded; static structure checked. Browser UI playback was not tested.'}
(a.output / 'report.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'imagesDecoded': len(parser.images), 'videosDecoded': videos}))
