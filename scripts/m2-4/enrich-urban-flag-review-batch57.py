"""Add exact Original phase controls and bounded animated native-capture previews."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('review', type=Path)
args = parser.parse_args()
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
root = Path('.artifacts/m2-4/urban-city-flags-batch57-v1')
manifest_file = args.review / 'review-manifest.json'
manifest = read(manifest_file)
assert not manifest.get('nativeFlagPreviews')
rows = {r['name']: r for r in manifest['states']}
previews, preview_rows = [], []
for label, suffix in [('Original', 'original'), ('2X', '2x'), ('4X', '4x')]:
    folder = root / f'native-flags-r2-{suffix}-v1'
    report_file = folder / 'report.json'
    report = read(report_file)
    assert report['status'] == 'PASS_SELECTED_NATIVE_CASES' and not report['errors']
    for cycle in report['linkedBuildingCycles']:
        assert cycle['status'] == 'PASS_ALL_ORIGINAL_PHASES_AND_NATIVE_LOOP_RETURN'
        assert cycle['expectedPhases'] == list(range(15))
        captures = sorted(cycle['captures'], key=lambda r: r['phase'])
        frames = []
        for capture in captures:
            source = folder / capture['file']
            assert not capture['rescaled']
            frames.append(Image.open(source).convert('RGBA'))
            if label == 'Original':
                name = f'flags-{label}-{capture["file"]}'
                target = args.review / 'media' / name
                assert not target.exists()
                shutil.copyfile(source, target)
                assert sha(source) == sha(target)
                relative = 'media/' + name
                row = rows[f'flags / {cycle["name"]} / linked flag phase {capture["phase"]}']
                row['images'] = dict(Original=relative, **row['images'])
                manifest['files'].append(dict(file=relative, source=str(source.resolve()),
                    sha256=sha(target), size=list(frames[-1].size), rescaled=False))
        name = f'{cycle["member"]}-{label}-native-phase-preview.png'
        target = args.review / 'media' / name
        assert not target.exists()
        # Review pacing is explicit; native clock/timing evidence stays in the source report.
        frames[0].save(target, save_all=True, append_images=frames[1:], duration=100,
            loop=0, disposal=0, blend=0)
        with Image.open(target) as check:
            assert check.n_frames == 15
            for index, frame in enumerate(frames):
                check.seek(index)
                assert check.convert('RGBA').tobytes() == frame.tobytes()
        relative = 'media/' + name
        manifest['files'].append(dict(file=relative, source=str(report_file.resolve()),
            sha256=sha(target), size=list(frames[0].size), rescaled=False, animated=True,
            phaseOrder=list(range(15)), reviewDurationPerPhaseMs=100,
            method='Lossless APNG of actual unscaled native captures; explicit review pacing, not a real-time recording.'))
        name_key = cycle['name']
        row = next((r for r in preview_rows if r['identity'] == name_key), None)
        if row is None:
            row = dict(identity=name_key,
                name=f'flags / {name_key} / animated phase preview (100 ms per phase)', images={})
            preview_rows.append(row)
        row['images'][label] = relative
        previews.append(dict(identity=name_key, density=label, file=relative,
            sourceReport=dict(file=str(report_file), sha256=sha(report_file)),
            sourceCaptures=[dict(file=c['file'], sha256=sha(folder / c['file'])) for c in captures]))
assert len(previews) == 12 and len(preview_rows) == 4
for row in preview_rows:
    row.pop('identity')
manifest['states'] = preview_rows + manifest['states']
manifest['nativeFlagPreviews'] = previews
manifest['disclosure'] += (' Each flag has same-phase Original/2X/4X native captures. Animated PNG previews retain '
    'all captured pixels and use explicit 100 ms per phase review pacing; they are not real-time recordings. '
    'Actual native phase transitions, ticks and loop-return results are pinned in the source reports. '
    'All 16 source phases are present in atlas boards; original rules animate phases 0–14 and retain phase 15 unused. '
    'The four city buildings and four poles reuse accepted art and require no new visual decision.')
manifest_file.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(dict(images=len(manifest['files']), phaseRows=60, animatedPreviews=12)))
