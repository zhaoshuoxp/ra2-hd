"""Verify every embedded PNG and static offline control without browser execution."""
import argparse
import base64
import hashlib
import io
import json
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', nargs='?', type=Path,
    default=Path('.artifacts/m2-4/ground-effects-review-batches67-68-v2'))
parser.add_argument('--stem', default='M2.4-NewUrban-Desert-Ground-Effects-Batches67-68-Embedded')
args = parser.parse_args()
root, name = args.root, args.stem
manifest = json.loads((root / (name + '.json')).read_text())
file = root / (name + '.html')
digest = lambda data: hashlib.sha256(data).hexdigest()
assert digest(file.read_bytes()) == manifest['html']['sha256']


class ReviewParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.inputs, self.labels, self.ids = [], {}, set(), set()

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        assert tag not in ('script', 'iframe', 'object', 'embed', 'link', 'video', 'audio')
        assert not any(key.startswith('on') for key in values)
        if 'id' in values:
            assert values['id'] not in self.ids
            self.ids.add(values['id'])
        if tag == 'img':
            self.images.append(values)
        if tag == 'input':
            self.inputs[values['id']] = values
        if tag == 'label':
            self.labels.add(values['for'])
        if tag == 'a':
            assert values['href'].startswith('#')


document = file.read_text()
parser = ReviewParser()
parser.feed(document)
assert len(parser.images) == len(manifest['images']) == manifest['embeddedPngs']
for image, expected in zip(parser.images, manifest['images'], strict=True):
    prefix = 'data:image/png;base64,'
    assert image['src'].startswith(prefix)
    data = base64.b64decode(image['src'][len(prefix):], validate=True)
    assert len(data) == expected['bytes'] and digest(data) == expected['sha256']
    assert data == Path(expected['file']).read_bytes()
    with Image.open(io.BytesIO(data)) as pixels:
        pixels.load()
        assert pixels.format == 'PNG' and list(pixels.size) == expected['size']
        assert [int(image['width']), int(image['height'])] == list(pixels.size)
    assert image['alt'] == expected['label'] and image['loading'] == 'lazy'
controls = {'view-original', 'view-2', 'view-4', 'view-all', 'fit'}
assert set(parser.inputs) == parser.labels == controls
assert 'checked' in parser.inputs['view-4'] and 'checked' not in parser.inputs['fit']
assert [name for name in controls if 'checked' in parser.inputs[name]] == ['view-4']
assert 'max-width:none' in document and 'max-width:100%' in document
for mode in ['original', '2', '4']:
    assert f'#view-{mode}:checked~main .panel:not(.mode-{mode})' in document
report = dict(status='PASS_ALL_EMBEDDED_PNG_HASHES_DECODE_DIMENSIONS_AND_STATIC_CONTROLS',
    htmlSha256=manifest['html']['sha256'], htmlBytes=file.stat().st_size,
    decodedPngs=len(parser.images), defaultView='4X', defaultFit=False,
    browserInteraction='NOT_RUN_LOCAL_FILE_PROTOCOL_BLOCKED_BY_BROWSER_TOOL',
    boundary='Static markup, exact source/embedded bytes and decoded dimensions only; no browser interaction claim.')
with (root / 'static-qa-v1.json').open('x') as stream:
    stream.write(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
