"""Check embedded review bytes, PNG dimensions and offline dependencies without a browser."""
import argparse
import base64
import hashlib
import io
import json
import subprocess
import tempfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image

args = argparse.ArgumentParser(description=__doc__)
args.add_argument('html', type=Path)
args.add_argument('metadata', type=Path)
args.add_argument('output', type=Path)
options = args.parse_args()
metadata = json.loads(options.metadata.read_text())
sha = lambda value: hashlib.sha256(value).hexdigest()
document = options.html.read_text()
assert sha(options.html.read_bytes()) == metadata['review']['sha256']


class ReviewParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images, self.controls, self.ids, self.anchors = [], [], set(), []
        self.scripts, self.in_script = [], False

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        assert tag not in ['iframe', 'object', 'embed', 'link', 'video', 'audio', 'base']
        assert not any(key.startswith('on') for key in values)
        if 'id' in values:
            assert values['id'] not in self.ids
            self.ids.add(values['id'])
        if tag == 'img':
            self.images.append(values)
        if tag == 'button':
            self.controls.append(values)
        if tag == 'a':
            assert values['href'].startswith('#')
            self.anchors.append(values['href'][1:])
        if tag == 'script':
            assert 'src' not in values
            self.in_script = True

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


parser = ReviewParser()
parser.feed(document)
assert len(parser.images) == metadata['embeddedPngs'] == len(metadata['images'])
expected_by_hash = {row['sha256']: row for row in metadata['images']}
decoded_hashes = []
for image in parser.images:
    assert image['src'].startswith('data:image/png;base64,') and image['alt']
    data = base64.b64decode(image['src'].split(',', 1)[1], validate=True)
    digest = sha(data)
    decoded_hashes.append(digest)
    expected = expected_by_hash[digest]
    assert sha(data) == expected['sha256'] and len(data) == expected['bytes']
    assert Path(expected['file']).read_bytes() == data
    with Image.open(io.BytesIO(data)) as decoded:
        decoded.load()
        assert decoded.format == 'PNG' and list(decoded.size) == expected['size']
        assert [int(image['width']), int(image['height'])] == list(decoded.size)
assert Counter(decoded_hashes) == Counter(row['sha256'] for row in metadata['images'])
assert set(parser.anchors) <= parser.ids
assert {b['data-d'] for b in parser.controls if 'data-d' in b} == {'2', '4'}
assert {b['data-v'] for b in parser.controls if 'data-v' in b} == {'original', 'new', 'all'}
assert len(parser.scripts) == 1 and 'max-width:none' in document
assert 'url(' not in document.lower() and 'fetch(' not in parser.scripts[0]
with tempfile.TemporaryDirectory(prefix='m24-review-syntax-') as directory:
    file = Path(directory) / 'review.js'
    file.write_text(parser.scripts[0])
    subprocess.run(['node', '--check', str(file)], check=True, capture_output=True)
result = dict(status='PASS_EMBEDDED_PNG_HASHES_DECODE_DIMENSIONS_OFFLINE_REFERENCES_AND_SCRIPT_SYNTAX',
    html=str(options.html), htmlSha256=metadata['review']['sha256'], htmlBytes=options.html.stat().st_size,
    decodedPngs=len(parser.images), externalDependencies=0, scriptSyntax='PASS_NODE_CHECK_ONLY',
    browserInteraction='NOT_RUN_PRIOR_LOCAL_PROTOCOL_DENIAL_PRESERVED_NO_BYPASS',
    boundary='Static markup, exact embedded/source bytes and decoded dimensions only; no browser interaction claim.')
with options.output.open('x') as stream:
    stream.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
