"""Replace only explicitly reopened complete families in an immutable catalog."""
import argparse
import copy
import json
import shutil
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('base', type=Path)
    parser.add_argument('patch', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('scope', type=Path)
    parser.add_argument('receipt', type=Path)
    args = parser.parse_args()
    assert not args.destination.exists() and not args.receipt.exists()
    base = json.loads((args.base / 'manifest.json').read_text())
    patch = json.loads((args.patch / 'manifest.json').read_text())
    allowed = set(json.loads(args.scope.read_text())['materialFamilies'])
    assert set(patch['families']) == allowed <= set(base['families'])
    result = copy.deepcopy(base)
    result['revision'] = args.destination.name
    args.destination.mkdir(parents=True)
    copied, replaced, preserved = [], [], []
    for family, old in base['families'].items():
        changed = family in allowed
        record = patch['families'][family] if changed else old
        folder = args.patch if changed else args.base
        if changed:
            assert [row['member'] for row in record['members']] == [row['member'] for row in old['members']]
            for previous, member in zip(old['members'], record['members']):
                before = json.loads((args.base / previous['path']).read_text())
                after = json.loads((args.patch / member['path']).read_text())
                assert before['source'] == after['source'] and before['logical'] == after['logical']
                assert {row['density'] for row in after['variants']} == {2, 4}
        result['families'][family] = record
        for member in record['members']:
            file = folder / member['path']
            assert sha(file) == member['sha256']
            target = args.destination / Path(member['path']).parent
            assert not target.exists(), 'A member must belong to exactly one complete family.'
            shutil.copytree(file.parent, target)
            for source in sorted(file.parent.rglob('*')):
                if source.is_file():
                    copied_file = target / source.relative_to(file.parent)
                    assert sha(copied_file) == sha(source)
                    copied.append(dict(file=str(copied_file.relative_to(args.destination)),
                        sha256=sha(source), bytes=source.stat().st_size, changed=changed))
        (replaced if changed else preserved).append(family)
    assert len(result['families']) == len(base['families']) == 238
    assert sum(len(row['members']) for row in result['families'].values()) == 333
    manifest = args.destination / 'manifest.json'
    manifest.write_text(json.dumps(result, separators=(',', ':')) + '\n')
    receipt = dict(schema='m2-3-feedback-environment-assembly-v1',
        status='PASS_COMPLETE_FAMILY_REPLACEMENT_EXACT_UNAFFECTED_BYTES',
        base=dict(path=str(args.base.resolve()), sha256=sha(args.base / 'manifest.json')),
        patch=dict(path=str(args.patch.resolve()), sha256=sha(args.patch / 'manifest.json')),
        selectedPack=dict(schemaVersion=1, revision=args.destination.name, sha256=sha(manifest)),
        scopeSha256=sha(args.scope), replaced=replaced, exactPreserved=preserved, files=copied)
    args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(dict(status=receipt['status'], pack=receipt['selectedPack'],
        replaced=len(replaced), preserved=len(preserved), files=len(copied))))


if __name__ == '__main__':
    main()
