"""Stage complete YR loading pages without modifying formal campaign manifests."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipes', type=Path)
parser.add_argument('worlds', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--revision', default='r11', choices=['r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11'])
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
index = read(args.recipes / 'index.json')
worlds = {row['mission']: row for row in read(args.worlds)['rows']}
assert len(index['rows']) == len(worlds) == 14
args.output.mkdir(exist_ok=False)
(args.output / 'recipes').mkdir()
(args.output / 'stages').mkdir()
moon = root / '.local/source-art/yr-campaign-v1/loading-r1/tactical-masters/loading-moon-master-r1.png'


def run(row):
    original = args.recipes / row['file']
    assert sha(original) == row['sha256']
    config = read(original)
    stem = row['mission'][:-4]
    world = worlds[row['mission']]
    assert sha(Path(world['receipt'])) == world['receiptSha256']
    config.update(revision='yr-loading-'+stem+'-'+args.revision, assetRevision='yr-'+args.revision)
    config['worldPreparation'] = dict(file=world['receipt'], sha256=world['receiptSha256'])
    if stem == 'sov06lmd':
        config['focusRaster'] = dict(file=str(moon), sha256=sha(moon), rect=[-8, -44, 208, 208],
            sourceRegion=[0, 0, 205, 170], clipCircle=[.5, .5, .478], miniature=[183, 12, 124, 124])
    recipe = args.output / 'recipes' / (stem+'.json')
    recipe.write_text(json.dumps(config, indent=2)+'\n')
    stage = args.output / 'stages' / stem
    result = subprocess.run(['node', str(root / 'scripts/campaign-completion/export-loading.mjs'),
        str(recipe.resolve()), '--stage='+str(stage.resolve())], cwd=root, capture_output=True, text=True)
    (args.output / (stem+'.log')).write_text(result.stdout+result.stderr)
    assert result.returncode == 0, (stem, result.stderr[-2000:])
    receipt = stage / 'receipt.json'
    value = read(receipt)
    assert value['configSha256'] == sha(recipe)
    print(json.dumps(dict(mission=row['mission'], stage=str(stage), existingUnitPhotos=row['reusedExistingUnitPhotos'])), flush=True)
    return dict(mission=row['mission'], recipe=str(recipe.resolve()), recipeSha256=sha(recipe),
        stage=str(stage.resolve()), receiptSha256=sha(receipt), source=value['source'],
        originalPngSha256=value['originalPngSha256'], files=value['files'])


rows = []
with ThreadPoolExecutor(max_workers=2) as executor:
    futures = {executor.submit(run, row): row for row in index['rows']}
    for future in as_completed(futures):
        rows.append(future.result())
        (args.output / 'index.json').write_text(json.dumps(dict(schema='yr-staged-loading-pages-v1',
            status='IN_PROGRESS' if len(rows) < 14 else 'STAGED_NOT_REGISTERED_NATIVE_VISUAL_REVIEW_PENDING',
            rows=sorted(rows, key=lambda row: row['mission']), reusedUnitPhotoSlots=39, newUnitPhotos=0,
            formalCampaignManifestsChanged=False), indent=2)+'\n')
