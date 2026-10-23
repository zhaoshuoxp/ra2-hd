"""Collect native scene captures and complete terrain comparisons without rescaling."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--captures', type=Path, nargs=3, required=True, action='append',
                    metavar=('ORIGINAL', 'HD2', 'HD4'))
parser.add_argument('--comparisons', type=Path, nargs=2, required=True)
parser.add_argument('--title', required=True)
parser.add_argument('--summary', default='New batch Mac technical checks passed; artwork awaits visual review. M2.4 coverage remains incomplete.')
args = parser.parse_args()
args.output.mkdir(exist_ok=False)
media = args.output / 'media'
media.mkdir()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
files, scenes, comparisons = [], [], []
capture_roots = [root for case in args.captures for root in case]
reports = [json.loads((root / 'report.json').read_text()) for root in capture_roots]
assert all(report['status'] == 'PASS_SELECTED_NATIVE_CASES' for report in reports)


def copy_image(source, name):
    target = media / name
    shutil.copyfile(source, target)
    assert sha(source) == sha(target)
    files.append(dict(file='media/' + name, source=str(source.resolve()), sha256=sha(target),
                      size=list(Image.open(target).size), rescaled=False))
    return 'media/' + name


for case_index, captures in enumerate(args.captures):
    case_reports = reports[case_index * 3:case_index * 3 + 3]
    route = case_reports[1]['captureRoute']
    assert all(report['captureRoute'] == route for report in case_reports)
    case = case_reports[1]
    for index, row in enumerate(route):
        name = f'{index:02d}-{row["name"]}-framebuffer.png'
        images = {label: copy_image(root / name, f'{case_index:02d}-{label}-{name}')
                  for label, root in zip(['Original', '2X', '4X'], captures)}
        assert len({tuple(Image.open(args.output / file).size) for file in images.values()}) == 1
        scenes.append(dict(name=f'{case["edition"].upper()} / {case["selectedMap"]} / {row["name"]}',
                           tile=row['tile'], images=images))
for density, root in zip([2, 4], args.comparisons):
    index = json.loads((root / 'index.json').read_text())
    for entry in index['records']:
        source = Path(entry['file'])
        assert sha(source) == entry['sha256'] and entry['density'] == density
        comparisons.append(dict(name=f'{entry["member"]} / native and HD {density}X',
                                image=copy_image(source, f'atlas-{density}X-{source.name}')))
manifest = dict(schema='m2-4-terrain-production-batch-review-v1', title=args.title,
    summary=args.summary,
    scenes=scenes, states=[], comparisons=comparisons, files=files,
    technical='PASS_SELECTED_NATIVE_CASES', visualDirection='PENDING_NEW_BATCH_USER_REVIEW',
    visual='NEW_BATCH_REVIEW_PENDING', fullSnowCoverage=False, m24Complete=False,
    reports=[dict(path=str((root / 'report.json').resolve()), sha256=sha(root / 'report.json'))
             for root in capture_roots])
(args.output / 'review-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(args.output / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8">'
    '<title>Embedded review entry</title><p><a href="index-embedded.html">Open the standalone embedded review</a></p></html>\n')
print(json.dumps(dict(output=str(args.output.resolve()), images=len(files), scenes=len(scenes))))
