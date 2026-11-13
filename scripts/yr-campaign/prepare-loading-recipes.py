"""Prepare source-pinned YR loading recipes using existing HD unit photographs."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
source_root = root / '.local/source-art/yr-campaign-v1/loading-r1'
source = read(source_root / 'original/source.json')
audit = read(root / '.artifacts/yr-campaign/loading-photo-reuse-audit-r1/audit.json')
ui_selection = read(root / '.local/ui-selection.json')
ui_root = root / '.local/ui-packs' / ui_selection['revision']
assert sha(ui_root / 'manifest.json') == ui_selection['sha256']
ui = {item['id']: item for item in read(ui_root / 'manifest.json')['assets']}
art = root.parent / 'project-history/ra2-campaign-completion-20261026/Art'
master_files = {}
for file in art.rglob('*.png'):
    master_files.setdefault(file.name, []).append(file)

# Match the loading subject to existing accepted pictures. The source aircraft
# is the Spy Plane; its accepted cameo already reproduces this promotional view.
subjects = {
    'sov01umd': ['brisicon', 'engnicon', 'htnkicon'],
    'sov02smd': ['v3icon', 'zepicon', 'mtnkicon'],
    'sov03umd': ['brisicon', 'ttnkicon', 'spypicon'],
    'sov04dmd': ['trkaicon', 'ironicon'],
    'sov05umd': ['schpicon', 'ironicon', 'subicon'],
    'sov06lmd': ['lunricon', 'htnkicon', 'mtnkicon'],
    'sov07tmd': ['mtnkicon', 'schpicon', 'msslicon'],
    'all01umd': ['tanyicon', 'engnicon', 'gdgiicon'],
    'all02umd': ['bfrticon', 'csphicon'],
    'all03umd': ['engnicon', 'snipicon', 'wethicon'],
    'all04dmd': ['tanyicon', 'tnkdicon'],
    'all05umd': ['desticon', 'roboicon', 'beagicon'],
    'all06umd': ['bfrticon', 'rtnkicon', 'sreficon'],
    'all07smd': ['roboicon', 'csphicon', 'wethicon'],
}
parents = {
    'engnicon': ('all01t', 1), 'v3icon': ('sov03u', 0), 'zepicon': ('sov11s', 0),
    'mtnkicon': ('sov07s', 2), 'ironicon': ('sov12s', 1), 'subicon': ('sov06t', 2),
    'msslicon': ('sov11s', 1), 'tanyicon': ('all01t', 0), 'csphicon': ('all11t', 0),
    'wethicon': ('all12s', 0), 'desticon': ('all04u', 0), 'rtnkicon': ('all06u', 1),
    'sreficon': ('all08u', 1),
}
accepted = {}
for subject, (mission, index) in parents.items():
    parent = root / '.local/campaign/ra2' / mission / 'interface-hd.json'
    master = read(parent)['loading']['masters'][index]
    matches = [p for p in master_files.get(Path(master['name']).name, []) if sha(p) == master['sha256']]
    assert matches, (subject, master)
    accepted[subject] = (matches[0].resolve(), dict(kind='ACCEPTED_RA2_LOADING_MASTER',
        interface=str(parent.relative_to(root)), interfaceSha256=sha(parent), master=master))
tank = root.parent / 'project-history/m3-1-accepted-main-20261025/Evidence/objects' \
    / 'f7b821dbc63232b6d3d1595d186e79aaa50a501fb93bd0082daab4e9a078c53e.png'
assert sha(tank) == tank.stem
accepted['htnkicon'] = (tank.resolve(), dict(kind='ACCEPTED_M3_1_LOADING_MASTER', masterSha256=tank.stem))
authority = root / 'docs/campaign-art/yr-v1/authorization.json'


def locator(image):
    rgb = np.asarray(image.convert('RGB')).astype(int)
    neutral = (rgb.min(2) >= 120) & (np.ptp(rgb, axis=2) < 50)
    candidates = []
    for y in range(75, 365):
        ends = np.flatnonzero(np.diff(np.r_[False, neutral[y, 220:315], False])) + 220
        for left, right in zip(ends[::2], ends[1::2]):
            if not 31 <= right-left <= 42:
                continue
            for height in range(31, 42):
                if neutral[y+height, left:right].mean() > .9 \
                        and neutral[y:y+height+1, left].mean() > .85 \
                        and neutral[y:y+height+1, right-1].mean() > .85:
                    candidates.append([int(left), y, int(right-left), height+1])
    assert candidates, 'Source world locator was not resolved'
    return max(candidates, key=lambda rect: rect[2]*rect[3])


args.output.mkdir(exist_ok=False)
rows = []
for row in source['rows']:
    stem = row['mission'][:-4]
    original = source_root / 'original' / row['original']
    assert sha(original) == row['originalPngSha256']
    slots = sorted([r for r in audit['rows'] if r['mission'] == row['mission']], key=lambda r: r['index'])
    assert len(slots) == len(subjects[stem])
    photos, reused_ui, provenance = [], [], []
    for index, subject in enumerate(subjects[stem]):
        if subject in accepted:
            file, evidence = accepted[subject]
        else:
            asset = ui[subject + '.shp']
            file = (ui_root / asset['file']).resolve()
            assert sha(file) == asset['sha256']
            evidence = dict(kind='ACCEPTED_HD_CAMEO', selection=ui_selection, asset=asset)
            reused_ui.append(dict(index=index, id=asset['id'], revision=ui_selection['revision'],
                manifestSha256=ui_selection['sha256'], sha256=asset['sha256']))
        photos.append(str(file))
        provenance.append(dict(index=index, subject=subject, file=str(file), sha256=sha(file), **evidence))
    scene = source_root / 'tactical-masters' / (stem + '-tactical-master-' + ('r2' if stem == 'sov01umd' else 'r1') + '.png')
    assert scene.exists(), scene
    photos.append(str(scene.resolve()))
    x, y, width, height = locator(Image.open(original))
    faction = row['faction']
    parent = root / '.local/campaign/ra2' / ('all01t' if faction == 'allied' else 'sov01t')
    shared = read(parent / 'interface-hd.json')['loading']['file']
    emblem_rect = [20, 344, 227, 140] if faction == 'allied' else \
        ([39, 254, 198, 198] if stem == 'sov06lmd' else [29, 303, 198, 198])
    config = dict(edition='yr', mission=row['mission'], faction=faction,
        revision='yr-loading-' + stem + '-r1', assetRevision='yr-r1',
        original=str(original.resolve()), originalPngSha256=row['originalPngSha256'], source=row['source'],
        rects=[r['rect'] for r in slots] + [[542, 266, 238, 242]], photos=photos,
        acceptedUiPhotos=reused_ui, existingPhotoProvenance=provenance,
        productionAuthorization=dict(file=str(authority), sha256=sha(authority)),
        emblemReuse=dict(edition='ra2', mission=parent.name+'.map', file=shared,
            sha256=sha(parent / shared), rect=emblem_rect),
        layout=dict(focus=[350, 58, 282, 278], frame=[347, 54, 289, 286],
            pipe='M640 177H715V266M235 414H542',
            projection=f'M347 54L{x} {y}V{y+height}L347 340M{x} {y}H{x+width}V{y+height}H{x}',
            tacticalClip='M638 266H780V508H542V342H638Z',
            frameInk='#b9bbb4', pipeInk='#191644' if faction == 'allied' else '#481512'),
        sourceWorldLocator=[x, y, width, height], userVisualAcceptance='PENDING')
    target = args.output / (stem + '.json')
    target.write_text(json.dumps(config, indent=2) + '\n')
    rows.append(dict(mission=row['mission'], file=target.name, sha256=sha(target),
        reusedExistingUnitPhotos=len(slots), reusedCameos=len(reused_ui), newUnitPhotos=0,
        tacticalMasterSha256=sha(scene), sourceWorldLocator=config['sourceWorldLocator']))
report = dict(schema='yr-source-pinned-loading-recipes-v1', rows=rows, reusedExistingUnitPhotos=sum(r['reusedExistingUnitPhotos'] for r in rows),
    newUnitPhotos=0, unitBodyResourcesChanged=False, acceptedUiResourcesChanged=False,
    registration='NOT_REGISTERED_COMPLETE_PAGE_EXPORT_AND_NATIVE_REVIEW_PENDING')
(args.output / 'index.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({key: report[key] for key in ['reusedExistingUnitPhotos', 'newUnitPhotos', 'registration']}))
