"""Audit all selected civil-building native owner regions at both densities."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scope', type=Path, required=True)
    parser.add_argument('--pack', type=Path, required=True)
    parser.add_argument('--contract', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert not args.output.exists(), 'Preserve earlier audit receipts.'
    scope = json.loads(args.scope.read_text())
    catalog = json.loads((args.pack / 'manifest.json').read_text())
    contract = json.loads(args.contract.read_text())
    members = {row['member']: row for family in catalog['families'].values() for row in family['members']}
    rows = []
    for source in scope['baselineBuildingSources']:
        name, native, guide = source['member'], source['source'], Path(source['root'])
        entry = members[name]
        file = args.pack / entry['path']
        assert digest(file) == entry['sha256']
        hd = json.loads(file.read_text())
        assert hd['source']['sha256'] == native['sha256']
        for variant in hd['variants']:
            density, pages = variant['density'], {}
            for frame in variant['frames']:
                number = frame['nativeFrame']
                original = native['frames'][number]
                width, height = original['size']
                declaration = next(page for page in variant['pages'] if page['id'] == frame['page'])
                if declaration['id'] not in pages:
                    folder = file.parent / str(density) / declaration['id']
                    base, data = folder / 'base.png', folder / 'data.png'
                    assert digest(base) == declaration['baseSha256']
                    assert digest(data) == declaration['dataSha256']
                    pages[declaration['id']] = tuple(np.asarray(Image.open(path).convert('RGBA')) for path in [base, data])
                base, data = pages[declaration['id']]
                x, y, _, _ = frame['contentRect']
                body = base[y:y + height * density, x:x + width * density]
                actual = data[y:y + height * density, x:x + width * density]
                index_file = guide / 'native' / original.get('indexFile', f'{name}-{number}.index')
                assert digest(index_file) == original['indexSha256']
                indices = np.frombuffer(index_file.read_bytes(), np.uint8).reshape(height, width)
                enlarged = indices.repeat(density, 0).repeat(density, 1)
                semantic = contract['sources'][name]
                remap = semantic.get('framePalettes', {}).get(str(number), semantic)['remapable']
                owner = (enlarged >= 16) & (enlarged <= 31) if remap else np.zeros(enlarged.shape, bool)
                mask = actual[..., 0] > 0
                rows.append({'member': name, 'density': density, 'frame': number,
                    'nativeOwnerPixels': int(owner.sum()), 'actualOwnerPixels': int(mask.sum()),
                    'missingOwnerPixels': int((owner & ~mask).sum()), 'extraOwnerPixels': int((mask & ~owner).sum()),
                    'shadeMismatches': int((actual[..., 1][owner] != enlarged[owner] - 16).sum()),
                    'ownerAlphaMissing': int((body[..., 3][owner] != 255).sum()),
                    'nativeIndexSha256': original['indexSha256']})
    failures = [row for row in rows if any(row[key] for key in [
        'missingOwnerPixels', 'extraOwnerPixels', 'shadeMismatches', 'ownerAlphaMissing'])]
    report = {'schema': 'm2-3-environment-building-owner-audit-v2',
        'status': 'PASS_EXACT_NATIVE_OWNER_MASKS_AND_SHADES' if not failures else 'FAIL_OWNER_MISMATCH',
        'buildingMembers': len(scope['baselineBuildingSources']), 'densityFrames': len(rows),
        'ownerFrames': sum(row['nativeOwnerPixels'] > 0 for row in rows), 'failures': failures, 'frames': rows,
        'reviewCompositionDefect': 'Original review displayed base.png without applying data.png native palette replacement.',
        'runtimeOwnerChangeVerification': 'PENDING'}
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: value for key, value in report.items() if key not in ['frames', 'failures']}))
    if failures:
        print(json.dumps({'failures': failures[:12], 'totalFailures': len(failures)}))


if __name__ == '__main__':
    main()
