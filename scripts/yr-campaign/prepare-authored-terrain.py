"""Bind immutable authored terrain mothers to complete original TMP members."""
import argparse
import copy
import hashlib
import json
import os
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'm2'))
from showcase_snow_scope import admit_snow_scope

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('recipe', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
read = lambda path: json.loads(path.read_text())
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
write = lambda path, value: path.write_text(json.dumps(value, indent=2) + '\n')
recipe = read(args.recipe)
assert recipe['schema'] == 'yr-authored-terrain-recipe-v1'
assert recipe['editions'] == ['yr'] and recipe['userVisualAcceptance'] == 'PENDING'
prior = Path(recipe['referenceAuthoring']['directory'])
prepared = Path(recipe['originalGuides']['directory'])
for path, expected in [(prior / 'source.json', recipe['referenceAuthoring']['sourceSha256']),
                       (prior / 'layout.json', recipe['referenceAuthoring']['layoutSha256']),
                       (prepared / 'source.json', recipe['originalGuides']['sourceSha256'])]:
    assert sha(path) == expected, 'Original authoring evidence changed'
source, layout = read(prior / 'source.json'), read(prior / 'layout.json')
assert source['preparedSourceSha256'] == sha(prepared / 'source.json')
assert source['theater'] == recipe['theater']
masters = {item['member']: item for item in recipe['masters']}
assert len(masters) == len(recipe['masters']) and masters
members = [member for member in source['members'] if member['member'] in masters]
assert {member['member'] for member in members} == set(masters)
snow_contract = None
if recipe['theater'] == 'SNOW':
    snow_contract, _, _ = admit_snow_scope(recipe['materialProfile'],
        {**source, 'members': members, 'editions': recipe['editions']})
for member in members:
    declaration = masters[member['member']]
    assert declaration['sourceSha256'] == member['native']['sha256']
    master = Path(declaration['file'])
    assert master.is_file() and sha(master) == declaration['sha256']
    with Image.open(master) as image:
        assert image.mode in ('RGB', 'RGBA') and list(image.size) == declaration['boardSize']
    x, y, width, height = declaration['slotRect']
    assert all(type(value) is int for value in declaration['slotRect'])
    assert min(x, y) >= 0 and min(width, height) > 0
    assert x + width <= declaration['boardSize'][0] and y + height <= declaration['boardSize'][1]
assert not args.output.exists()
args.output.mkdir(parents=True)
source = copy.deepcopy(source)
source.update(members=members, editions=['yr'])
layout = {name: copy.deepcopy(layout[name]) for name in masters}
boards = {}
for member in members:
    name = member['member']
    declaration = masters[name]
    master = Path(declaration['file']).resolve()
    board = 'authored-' + declaration['sha256'][:16] + '-master.png'
    if board not in boards:
        os.link(master, args.output / board)
        boards[board] = dict(name=board.removesuffix('-master.png'), boardSize=declaration['boardSize'],
            members=[], columns=declaration.get('columns', 1), rows=declaration.get('rows', 1))
    boards[board]['members'].append(name)
    os.link(prior / (name + '-native.png'), args.output / (name + '-native.png'))
    layout[name].update(board=board, boardSize=declaration['boardSize'],
        slotRect=declaration['slotRect'], occupied=declaration['occupied'], alphaCutoff=180)
    if continuation := declaration.get('exteriorSurfaceContinuation'):
        if recipe['theater'] == 'SNOW':
            assert snow_contract['members'].get(name) == member['native']['sha256']
        else:
            assert recipe['theater'] == 'NEWURBAN'
            assert name in {'rampx05.ubn', 'rampx06.ubn', 'rampx08.ubn', 'rampx07.ubn',
                            'rampx09.ubn', 'rampx10.ubn', 'wclifx06.ubn', 'wclifx09.ubn'}
        assert continuation['schema'] == 'hd-authored-exterior-color-continuation-v1'
        assert continuation['maximumNativeInset'] == 1
        assert hashlib.sha256(Image.open(master).convert('RGBA').tobytes()).hexdigest() == continuation['masterRgbaSha256']
        layout[name]['exteriorSurfaceContinuation'] = continuation
write(args.output / 'source.json', source)
write(args.output / 'layout.json', layout)
write(args.output / 'batches.json', list(boards.values()))
write(args.output / 'material-profile.json', recipe.get('materialProfile', dict(continuousAuthoredRgb={
    member['member']: member['native']['sha256'] for member in members})))
write(args.output / 'preparation.json', dict(status='PREPARED_COMPLETE_ORIGINAL_MEMBERS_EXPORT_PENDING',
    recipe=str(args.recipe.resolve()), recipeSha256=sha(args.recipe),
    originalSourceSha256=sha(prepared / 'source.json'), members=list(masters),
    linkedMothers=len(boards), motherPixelsModified=False, nativeGeometryModified=False,
    userVisualAcceptance='PENDING'))
print(json.dumps(dict(output=str(args.output), members=len(members), mothers=len(boards))))
