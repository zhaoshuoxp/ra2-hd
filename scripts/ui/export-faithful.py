"""Export individually restored cameos at 4x native size; never activate a selection."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import shutil
import sys

ROOT = Path('.artifacts/menu-ui')
ART = ROOT / 'art-v4'
REVISION = sys.argv[1] if len(sys.argv) > 1 else 'direction-v5'
PACK = Path('.local/ui-packs') / REVISION
IDS = ['giicon', 'e2icon', 'htnkicon', 'gtnkicon', 'powricon', 'npwricon',
       'tslaicon', 'agisicon', 'v3icon', 'dogicon', 'harvicon', 'jjeticon']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    PACK.mkdir(parents=True, exist_ok=True)
    (ART / 'exports').mkdir(exist_ok=True)
    entries = []
    masters = {}
    for name in IDS:
        source = json.loads((ROOT / 'inventory-v1' / f'{name}.shp.json').read_text())
        logical = (source['width'], source['height'])
        original = ROOT / 'inventory-v1' / f'{name}.png'
        assert Image.open(original).size == logical
        target = tuple(value * 4 for value in logical)
        master = ART / f'{name}.png'
        image = Image.open(master).convert('RGBA')
        assert abs(image.width / image.height / (logical[0] / logical[1]) - 1) < .01
        output = ART / 'exports' / f'{name}.png'
        image.resize(target, Image.Resampling.LANCZOS).save(output)
        destination = PACK / output.name
        if destination.exists() and digest(destination) != digest(output):
            raise ValueError(f'Immutable review pack changed: {destination}')
        shutil.copyfile(output, destination)
        entries.append(dict(id=name + '.shp', file=output.name, sha256=digest(output),
                            width=target[0], height=target[1], logicalWidth=logical[0],
                            logicalHeight=logical[1]))
        masters[name] = dict(sha256=digest(master), originalSha256=digest(original))
    # Reuse the previous background direction without implying new approval.
    previous = Path('.local/ui-packs/direction-v1')
    manifest = json.loads((previous / 'manifest.json').read_text())
    for entry in manifest['assets']:
        if entry['id'] in ('menu-background', 'loading-background'):
            shutil.copyfile(previous / entry['file'], PACK / entry['file'])
            entries.append(entry)
    manifest = dict(schemaVersion=1, revision=REVISION, assets=entries)
    (PACK / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    ledger = dict(status='REPRESENTATIVE_REVIEW_PENDING', generation='built-in image_gen',
                  acceptedDirection='art-v3/reactor-material-candidate.png',
                  artApproval='CONSOLIDATED_REVIEW_PENDING', productionPromotion=False,
                  fullRosterExpanded=False, assets=entries, masters=masters,
                  export='4x native canvas, LANCZOS reduction, no crop or invented pixels in export',
                  corrections=['Source-referenced two-handed GI pose', 'Conscript gas mask', 'Natural bottom-region continuation',
                               '240x192 sidebar assets', 'Live outlined labels without a black strip'])
    (ART / 'ledger.json').write_text(json.dumps(ledger, indent=2) + '\n')
    print(json.dumps(dict(pack=str(PACK), cameos=len(IDS), manifestSha256=digest(PACK / 'manifest.json'),
                         cameoDecodedBytes=sum(a['width'] * a['height'] * 4 for a in entries if a['id'].endswith('.shp')))))


if __name__ == '__main__':
    main()
