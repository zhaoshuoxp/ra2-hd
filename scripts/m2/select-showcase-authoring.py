"""Pin visually inspected candidates while retaining rejected raw artwork."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('kind', choices=['shp', 'vxl'])
args = parser.parse_args()
base = Path('.artifacts/m2-2')
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
if args.kind == 'shp':
    root = base / 'authoring-shp-v1'
    work = json.loads((root / 'worklist.json').read_text())
    overrides = json.loads((root / 'slot-overrides.json').read_text())
    records = []
    for folder in ['authoring-shp-material-repairs-v1', 'authoring-shp-state-repairs-v1']:
        repair = base / folder
        for record in json.loads((repair / 'audit.json').read_text())['boards']:
            name = record['name']
            file = repair / (name + '-master.png')
            assert file.exists(), file
            batch = next(b for b in work['batches'] if b['name'] == name)
            for key in batch['slots']:
                overrides[key] = dict(board=str(file.resolve()), boardSize=batch['boardSize'],
                                      occupied=len(batch['slots']))
            records.append(dict(name=name, selected=str(file), sha256=sha(file),
                                status='PASS_NATIVE_SUBJECT_MATERIAL_AND_STATE',
                                rejected=record['rejectedMaster'], rejectedSha256=record['sha256']))
    name = 'shp-building-1254-1x3-002'
    file = base / 'authoring-final-repairs-v1' / (name + '-master.png')
    assert file.exists(), file
    batch = next(b for b in work['batches'] if b['name'] == name)
    for key in batch['slots']:
        overrides[key] = dict(board=str(file.resolve()), boardSize=batch['boardSize'], occupied=3)
    records.append(dict(name=name, selected=str(file), sha256=sha(file),
                        status='PASS_NATIVE_SUBJECT_MATERIAL_AND_STATE',
                        rejected=str(root / (name + '-master.png'))))
    for member in ['tib01', 'tib12']:
        file = base / 'authoring-shp-repairs-v2' / (member + '-tem-000-repair1-master.png')
        assert file.exists(), file
        overrides[member + '.tem-000'] = dict(board=str(file.resolve()), boardSize=[1254, 1254],
                                             slotRect=[0, 0, 1254, 1254], occupied=1)
    (root / 'slot-overrides.json').write_text(json.dumps(overrides, indent=2) + '\n')
    (base / 'shp-selected-visual-audit-v1.json').write_text(json.dumps(dict(
        schema='m2-2-shp-selected-visual-audit-v1', initialBoardsReviewed=130,
        initialIndexes=['shp-visual-review-v1/index.json', 'shp-visual-review-v3/index.json',
                        'shp-visual-review-v4/index.json'], repaired=records,
        boundary='Native subject, material and state reviewed; registration, exported output, runtime and combined user acceptance are separate.'), indent=2) + '\n')
    print(json.dumps(dict(overrides=len(overrides), repairedBoards=len(records))))
else:
    work = json.loads((base / 'authoring-vxl-v2/worklist.json').read_text())
    for board in work['boards']:
        identity = board['identity']
        folder = ('authoring-vxl-v1' if identity in ['CAR', 'BUS', 'LIMO'] else
                  'authoring-vxl-v3' if identity == 'STANG' else 'authoring-vxl-v2')
        file = base / folder / (board['id'] + '-master.png')
        assert file.exists(), file
        board.update(selectedArt=str(file), selectedArtSha256=sha(file), selectedArtGrid=[4, 2],
                     visualQa='PASS', status='NATIVE_SUBJECT_AND_BEARINGS_REVIEWED')
        if identity in ['TAXI', 'EUROC']:
            board['authoredCellOrder'] = [4, 5, 6, 3, 0, 1, 2, 7]
        if identity == 'PTRUCK':
            board['authoredFrameOverrides'] = {}
            for heading in [45, 225]:
                file = base / 'authoring-final-repairs-v1' / f'PTRUCK-{heading}-bearing-repair-master.png'
                if not file.exists():
                    board.update(visualQa='PENDING', status='INDIVIDUAL_HEADING_REPAIR_PENDING')
                    continue
                board['authoredFrameOverrides'][str(heading)] = dict(path=str(file),
                    sha256=sha(file), grid=[1, 1], occupied=1, index=0)
    output = base / 'selected-vxl-worklist-v1.json'
    output.write_text(json.dumps(work, indent=2) + '\n')
    print(json.dumps(dict(output=str(output), ready=[b['identity'] for b in work['boards']
                                                   if b['visualQa'] == 'PASS'])))
