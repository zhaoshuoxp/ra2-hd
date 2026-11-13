"""Run bounded original-world registration probes without selecting resources."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipes', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--reuse-first', type=Path)
parser.add_argument('--reuse-first-recipe', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
args.output.mkdir(exist_ok=False)
index = read(args.recipes / 'index.json')


def run(row):
    stem = row['mission'][:-4]
    recipe = (args.recipes / row['file']).resolve()
    output = args.output / stem
    reuse = None
    if stem == 'sov01umd' and args.reuse_first:
        assert args.reuse_first_recipe
        old, current = read(args.reuse_first_recipe), read(recipe)
        keys = ['originalPngSha256', 'atlasSha256', 'wrapLongitude', 'registrationProbe']
        assert all(old[key] == current[key] for key in keys), 'Registration input geometry changed'
        assert read(args.reuse_first / 'uniform-fit.json')['recipeSha256'] == sha(args.reuse_first_recipe)
        output.mkdir()
        for name in ['uniform-fit.json', 'fit-land-overlap.png']:
            shutil.copy2(args.reuse_first / name, output / name)
        reuse = dict(report=str(args.reuse_first / 'uniform-fit.json'), recipe=str(args.reuse_first_recipe),
            reason='Identical original image, accepted atlas, longitude policy and bounded registration probe.')
    else:
        result = subprocess.run(['python3', str(root / 'scripts/campaign-completion/fit-loading-world.py'),
            str(recipe), str(output.resolve())], cwd=root, capture_output=True, text=True)
        (args.output / (stem+'.log')).write_text(result.stdout+result.stderr)
        assert result.returncode == 0, (stem, result.stderr[-1000:])
    fit_file = output / 'uniform-fit.json'
    fit = read(fit_file)
    result = dict(mission=row['mission'], recipe=str(recipe), recipeSha256=sha(recipe),
        fit=str(fit_file), fitSha256=sha(fit_file), landDice=fit['landDice'],
        uniformScale=fit['uniformScale'], offset=fit['offset'], reused=reuse,
        qualification='REGISTRATION_CANDIDATE_COMPLETE_PAGE_NATIVE_AND_SOURCE_VISUAL_INSPECTION_REQUIRED')
    print(json.dumps(dict(mission=row['mission'], landDice=fit['landDice'], reused=bool(reuse))), flush=True)
    return result


rows = []
with ThreadPoolExecutor(max_workers=2) as executor:
    futures = {executor.submit(run, row): row for row in index['rows']}
    for future in as_completed(futures):
        rows.append(future.result())
        (args.output / 'index.json').write_text(json.dumps(dict(schema='yr-loading-world-registration-probes-v1',
            status='IN_PROGRESS' if len(rows) < len(index['rows']) else 'CANDIDATES_AWAITING_NATIVE_VISUAL_INSPECTION',
            rows=sorted(rows, key=lambda row: row['mission']), resourcesChanged=False), indent=2)+'\n')
