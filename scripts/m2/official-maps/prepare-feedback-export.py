"""Require pinned corrected masters for every slot of each exported family."""
import argparse
import hashlib
import json
from pathlib import Path


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('authoring', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--families', nargs='+', required=True)
    parser.add_argument('--profile', type=Path, required=True)
    parser.add_argument('--job-overrides', type=Path)
    args = parser.parse_args()
    assert not args.output.exists(), 'Preserve earlier export inputs.'
    contract = json.loads(Path('desktop/environment-hd-contract.json').read_text())
    required = {name for family in args.families for name in contract['families'][family]['members']}
    work = json.loads((args.authoring / 'worklist.json').read_text())
    work['members'] = [row for row in work['members'] if row['member'] in required]
    work['slots'] = {key: row for key, row in work['slots'].items() if row['member'] in required}
    profile = json.loads(args.profile.read_text())
    marker_keys = {f'{name}-{int(number):03d}' for name, declaration in
        profile.get('nativePaletteMarkerFrames', {}).items() for number in declaration['frames']}
    replacements = json.loads(args.job_overrides.read_text()) if args.job_overrides else {}
    overrides, receipts, used_replacements = {}, [], set()
    for job in json.loads((args.authoring / 'jobs.json').read_text()):
        if job['member'] not in required:
            continue
        keys = {key for cell in job['cells'] for key in cell['duplicates']}
        if keys <= marker_keys:
            continue
        assert not keys & marker_keys, 'Split categorical marker cells from authored body jobs.'
        if job['id'] in replacements:
            replacement_file = Path(replacements[job['id']])
            replacement = json.loads(replacement_file.read_text())
            identity = lambda row: [(cell['key'], cell['duplicates'], cell['nativeBounds'])
                for cell in row['cells']]
            assert replacement['member'] == job['member'] and identity(replacement) == identity(job)
            used_replacements.add(job['id'])
            job = replacement
        folder = Path(job['folder'])
        file = folder / 'generation-v2.json'
        if not file.exists():
            file = folder / 'generation.json'
        receipt = json.loads(file.read_text())
        assert receipt['status'] == 'PASS_SOURCE_CAPACITY_PENDING_VISUAL_QA', job['id']
        assert receipt['references'] == job['references']
        master = Path(receipt['master'])
        assert sha(master) == receipt['masterSha256']
        assert sha(folder / receipt['promptFile']) == receipt['promptSha256']
        for reference in receipt['references']:
            assert sha(Path(reference['file'])) == reference['sha256']
        receipts.append(dict(file=str(file.resolve()), sha256=sha(file), job=job['id']))
        for cell in job['cells']:
            for key in cell['duplicates']:
                assert key not in overrides
                assert work['slots'][key]['nativeBounds'] == cell['nativeBounds']
                overrides[key] = dict(board=str(master.resolve()), boardSize=job['boardSize'],
                    occupied=job['occupied'], slotRect=cell['slotRect'], referenceRect=cell['referenceRect'])
    assert used_replacements == set(replacements), 'Every declared replacement must be selected.'
    assert set(overrides) == set(work['slots']) - marker_keys, sorted(
        set(work['slots']) - marker_keys - set(overrides))
    for part in profile.get('fixedNativeParts', []):
        if set(part['targets']) & required:
            key = f"{part['canonicalMember']}-{part['canonicalFrame']:03d}"
            assert key in overrides
            part['canonicalMasterSha256'] = sha(Path(overrides[key]['board']))
    args.output.mkdir(parents=True)
    for filename, value in [('worklist.json', work), ('slot-overrides.json', overrides),
                            ('material-profile.json', profile)]:
        (args.output / filename).write_text(json.dumps(value, indent=2) + '\n')
    (args.output / 'provenance.json').write_text(json.dumps(dict(schema='m2-3-feedback-export-input-v1',
        families=args.families, sourceWorklistSha256=sha(args.authoring / 'worklist.json'),
        sourceProfileSha256=sha(args.profile), receipts=receipts,
        nativePaletteMarkerSlots=sorted(marker_keys & set(work['slots'])),
        jobOverrides=dict(file=str(args.job_overrides.resolve()), sha256=sha(args.job_overrides))
            if args.job_overrides else None,
        status='PASS_AUTHORED_SLOTS_PINNED_NATIVE_CATEGORICAL_MARKERS_PRESERVED'), indent=2) + '\n')
    print(json.dumps(dict(families=len(args.families), members=len(required), slots=len(overrides))))


if __name__ == '__main__':
    main()
