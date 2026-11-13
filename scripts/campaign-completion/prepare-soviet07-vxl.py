"""Pin the approved truck artwork and original eight-view exporter inputs."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
history = root.parent / 'project-history/ra2-campaign-completion-20261026/Art'
source_root = history / 'Soviet07RemainingSource-v37-r2'
samples = history / 'Soviet07RemainingSamples-v37-r1'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
write = lambda p, value: p.write_text(json.dumps(value, indent=2) + '\n')
approval_file = samples / 'direction-approval-20261030.json'
approval = read(approval_file)
assert approval['status'] == 'USER_MATERIAL_DIRECTIONS_ACCEPTED_FULL_PRODUCTION_AUTHORIZED'
approved = next(row for row in approval['accepted'] if row['identity'].startswith('PROPA '))
assert sha(root.parent / approved['sample']) == approved['sha256']
source = read(source_root / 'source.json')
assert source['mission'] == 'sov07s.map' and source['theater'] == 'SNOW'
truck = next(row for row in source['sources'] if row['identity'] == 'PROPA')
assert truck['format'] == 'vxl' and not truck['additionalSources']
assets = {}
for row in [truck, truck['hva'], truck['vpl'], truck['palette']]:
    assert sha(source_root / 'native' / row['member']) == row['sha256']
    assets[row['member']] = {key: row[key] for key in ['sha256', 'archive'] if key in row}
work = read(source_root / 'authoring/worklist.json')
assert len(work['boards']) == 1 and work['boards'][0]['identity'] == 'PROPA'
board = work['boards'][0]
assert sha(Path(board['board'])) == board['boardSha256']
assert [frame['heading'] for frame in board['frames']] == list(range(0, 360, 45))
master = samples / 'propa-eight-headings-r1.png'
assert sha(master) == '15d18732bff905c844b152518a34eb5e0092920ca68b79f8c8ed0a04253dc8cc'
assert Image.open(master).getchannel('A').getextrema()[0] == 0
board.update(selectedArt=str(master), selectedArtSha256=sha(master), selectedArtGrid=[4, 2],
    visualQa='PASS', visualQaScope='Approved material direction and complete native-view sheet; final export/native/user inspection remains required.')
work['reused'] = []
args.output.mkdir(parents=True, exist_ok=False)
write(args.output / 'worklist.json', work)
write(args.output / 'inventory.json', dict(assets=assets, families=[dict(id='PROPA',
    members=['propa.vxl', 'propa.hva'], children=[])]))
write(args.output / 'preparation.json', dict(status='PASS_SOURCE_PINNED_APPROVED_DIRECTION_EXPORT_INPUTS',
    mission=source['mission'], theater=source['theater'], sourceSha256=sha(source_root / 'source.json'),
    approvalSha256=sha(approval_file), masterSha256=sha(master),
    sourcePalette=truck['palette'], sourceVpl=truck['vpl'],
    qualification='Original VXL/HVA, projection, pivots and control references are unchanged. Authored masters are referenced without image modification. Independent exports and native/full-group review are subsequent checks.'))
print(json.dumps(dict(output=str(args.output), identity='PROPA', originalHeadings=8)))
