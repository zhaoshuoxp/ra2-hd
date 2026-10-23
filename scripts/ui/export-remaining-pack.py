"""Assemble an immutable, unselected review pack with shared cameo rank layers."""
from pathlib import Path
from PIL import Image
import hashlib
import io
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / '.artifacts/menu-ui/remaining-v1'
BASE = ROOT / '.local/ui-packs/original-screens-v4'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    revision = sys.argv[1]
    assert revision.startswith('remaining-ui-') and all(c.isalnum() or c == '-' for c in revision)
    pack = ROOT / '.local/ui-packs' / revision
    pack.mkdir(exist_ok=True)

    def save(name, data):
        path = pack / name
        if path.exists() and path.read_bytes() != data:
            raise ValueError(f'Immutable output differs: {path}')
        path.write_bytes(data)

    manifest = json.loads((BASE / 'manifest.json').read_text())
    entries = {entry['id']: entry for entry in manifest['assets']}
    for path in BASE.iterdir():
        if path.is_file() and path.name != 'manifest.json':
            save(path.name, path.read_bytes())
    selected = json.loads((ART / 'selected-masters.json').read_text())
    for name, choice in selected.items():
        image = Image.open(ART / choice['master']).convert('RGBA')
        assert abs(image.width / image.height - 1.25) < .01
        assert image.getchannel('A').getextrema() == (255, 255)
        buffer = io.BytesIO()
        image.resize((240, 192), Image.Resampling.LANCZOS).save(buffer, format='PNG')
        data = buffer.getvalue()
        file = name + '.png'
        save(file, data)
        entries[name + '.shp'] = dict(id=name + '.shp', file=file, sha256=digest(data),
                                    width=240, height=192, logicalWidth=60, logicalHeight=48)
    rank = (ART / 'source-fidelity-review-v1/cameo-rank.png').read_bytes()
    save('cameo-rank.png', rank)
    entries['cameo-rank'] = dict(id='cameo-rank', file='cameo-rank.png', sha256=digest(rank),
                                width=240, height=192, logicalWidth=60, logicalHeight=48)
    pairs = json.loads((ROOT / 'scripts/ui/cameo-aliases.json').read_text())
    reused = {}
    for alternate, normal in pairs.items():
        if normal in entries:
            entries[alternate] = {**entries[normal], 'id': alternate, 'overlay': 'cameo-rank'}
            reused[alternate] = normal
    small = ART / 'small-ui-v1'
    for entry in json.loads((small / 'manifest-fragment.json').read_text()):
        data = (small / entry['file']).read_bytes()
        assert digest(data) == entry['sha256']
        save(entry['file'], data)
        entries[entry['id']] = entry
    manifest.update(revision=revision, assets=list(entries.values()))
    data = (json.dumps(manifest, indent=2) + '\n').encode()
    save('manifest.json', data)
    receipt = dict(status='UNSELECTED_REVIEW_PACK', promoted=False, revision=revision,
                   manifestSha256=digest(data), entries=len(entries), sharedPairs=reused,
                   selectedCanonical=len(selected), preservedBase=BASE.name)
    save('production-receipt.json', (json.dumps(receipt, indent=2) + '\n').encode())
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
