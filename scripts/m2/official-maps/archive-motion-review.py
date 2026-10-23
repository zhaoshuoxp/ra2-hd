"""Verify exact embedded native media and archive all relative offline pages."""
import base64
import hashlib
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Elements(HTMLParser):
    def __init__(self):
        super().__init__()
        self.media, self.links = [], []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag in ['img', 'video']:
            self.media.append(values['src'])
        elif tag == 'a':
            self.links.append(values['href'])


folder, output = map(Path, sys.argv[1:3])
revision = sys.argv[3] if len(sys.argv) > 3 else 'R8'
assert revision in ('R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16')
assert not output.exists()
output.mkdir()
manifest = json.loads((folder/'review-manifest.json').read_text())
assert manifest['status'].startswith('PASS') and not manifest['networkRequired']
page_names = {manifest['entry'], *(p['file'] for p in manifest['pages'])}
counts = dict(images=0, videos=0, links=0)
for name in sorted(page_names):
    parser = Elements()
    parser.feed((folder/name).read_text())
    rows = [r for r in manifest['media'] if r['page'] == name]
    if name == 'phases.html':
        # The phase viewer embeds sprite sheets in a JSON object for canvas
        # drawing. Parse the data without executing the page's JavaScript.
        match = re.search(r'const sources\s*=\s*', (folder/name).read_text())
        assert match, 'Missing embedded phase source table'
        sources, _ = json.JSONDecoder().raw_decode((folder/name).read_text()[match.end():])
        assert isinstance(sources, dict) and len(sources) == 8
        assert all(re.fullmatch(r'(original|r16)-[24]-[01]', key) for key in sources)
        parser.media.extend(sources.values())
    assert len(parser.media) == len(rows)
    for encoded, row in zip(parser.media, rows):
        prefix = 'data:video/webm;base64,' if row['type'] == 'video' else 'data:image/png;base64,'
        assert encoded.startswith(prefix)
        data = base64.b64decode(encoded[len(prefix):], validate=True)
        assert len(data) == row['bytes'] and digest(data) == row['sha256']
        assert Path(row['source']).read_bytes() == data
        counts['videos' if row['type'] == 'video' else 'images'] += 1
    for href in parser.links:
        assert href in page_names and (folder/href).is_file(), href
        counts['links'] += 1
archive_name = f'M2.3-{revision}-Offline-Review-20261010'
archive = output/(archive_name+'.zip')
files = sorted(p for p in folder.iterdir() if p.is_file())
assert {p.name for p in files} == page_names | {'review-manifest.json'}
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED) as zipped:
    for file in files:
        zipped.write(file, archive_name+'/'+file.name)
with zipfile.ZipFile(archive) as zipped:
    assert len(zipped.infolist()) == len(files)
    for file in files:
        assert zipped.read(archive_name+'/'+file.name) == file.read_bytes()
receipt = dict(status='PASS_EXACT_EMBEDDED_MEDIA_AND_OFFLINE_ARCHIVE_BYTES',
               archive=str(archive.resolve()), bytes=archive.stat().st_size,
               sha256=digest(archive.read_bytes()), pages=len(page_names), **counts)
(output/'archive-receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt))
