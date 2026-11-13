"""Bake independently pinned YR loading backgrounds from qualified registration candidates."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipes', type=Path)
parser.add_argument('fits', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
recipes = read(args.recipes / 'index.json')
fits = {row['mission']: row for row in read(args.fits)['rows']}
assert len(recipes['rows']) == len(fits) == 14
args.output.mkdir(exist_ok=False)
(args.output / 'calibrated').mkdir()
(args.output / 'worlds').mkdir()


def run(row):
    stem = row['mission'][:-4]
    file = args.recipes / row['file']
    fit_row = fits[row['mission']]
    assert sha(file) == row['sha256'] == fit_row['recipeSha256'], ('Recipe changed', stem)
    fit_file = Path(fit_row['fit'])
    assert sha(fit_file) == fit_row['fitSha256']
    recipe, fit = read(file), read(fit_file)
    assert recipe['originalPngSha256'] == fit['originalPngSha256']
    assert recipe['atlasSha256'] == fit['atlasSha256']
    recipe['registration'].update(scale=fit['uniformScale'], sourceLocator=fit['masterLocator'],
        nativeLocator=fit['targetLocator'])
    recipe['registrationEvidence'] = dict(report=str(fit_file.resolve()), sha256=sha(fit_file),
        landDice=fit['landDice'], qualification=fit_row['qualification'],
        **({'landmarkAdmission': fit_row['landmarkAdmission']} if fit_row.get('landmarkAdmission') else {}))
    calibrated = args.output / 'calibrated' / (stem+'.json')
    calibrated.write_text(json.dumps(recipe, indent=2)+'\n')
    output = args.output / 'worlds' / stem
    result = subprocess.run(['node', str(root / 'scripts/campaign-completion/prepare-loading-world.mjs'),
        str(calibrated.resolve()), str(output.resolve())], cwd=root, capture_output=True, text=True)
    (args.output / (stem+'.log')).write_text(result.stdout+result.stderr)
    assert result.returncode == 0, (stem, result.stderr[-1500:])
    receipt_file = output / 'receipt.json'
    receipt = read(receipt_file)
    assert receipt['recipeSha256'] == sha(calibrated)
    assert sha(output / receipt['asset']['file']) == receipt['asset']['sha256']
    print(json.dumps(dict(mission=row['mission'], assetSha256=receipt['asset']['sha256'])), flush=True)
    return dict(mission=row['mission'], recipe=str(calibrated.resolve()), recipeSha256=sha(calibrated),
        receipt=str(receipt_file.resolve()), receiptSha256=sha(receipt_file), asset=receipt['asset'],
        binding=receipt['binding'], monochrome=receipt['monochrome'], source=recipe['source'],
        originalPngSha256=recipe['originalPngSha256'])


rows = []
with ThreadPoolExecutor(max_workers=2) as executor:
    futures = {executor.submit(run, row): row for row in recipes['rows']}
    for future in as_completed(futures):
        rows.append(future.result())
        (args.output / 'index.json').write_text(json.dumps(dict(schema='yr-loading-world-preparations-v1',
            status='IN_PROGRESS' if len(rows) < 14 else 'STAGED_NOT_REGISTERED_NATIVE_VISUAL_REVIEW_PENDING',
            rows=sorted(rows, key=lambda row: row['mission']), acceptedAtlasChanged=False), indent=2)+'\n')
