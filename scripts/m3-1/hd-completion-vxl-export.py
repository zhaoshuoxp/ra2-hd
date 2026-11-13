"""Export complete native VXL families from clean ships and the user's retained units."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from PIL import Image

base = Path(sys.argv[1]).resolve()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
read = lambda p: json.loads(p.read_text())
work = read(base / 'authoring-vxl/worklist.json')
output = base / 'vxl-final'
output.mkdir(exist_ok=False)
disposition = read(base / 'user-art-disposition-20261024.json')
for row in disposition['retainedByUser']:
    assert sha(base / row['path']) == row['sha256']

# Repack eight independent authored views without resizing any input texels.
masters = [Image.open(base / 'authoring-vxl-clean-r3' / f'cruise-headings-{i:02d}-master.png').convert('RGBA')
           for i in range(1, 5)]
assert all(image.size == (1774, 887) for image in masters)
combined = Image.new('RGBA', (3548, 1774))
for row, master in enumerate(masters):
    for column in range(2):
        index = row * 2 + column
        cell = master.crop((column * 887, 0, (column + 1) * 887, 887))
        combined.alpha_composite(cell, (index % 4 * 887, index // 4 * 887))
cruise = output / 'cruise-eight-headings-master.png'
combined.save(cruise)
for board in work['boards']:
    identity = board['identity']
    selected = cruise if identity == 'CRUISE' else base / 'authoring-vxl' / (identity.lower() + '-headings-01-master.png')
    board.update(selectedArt=str(selected), selectedArtSha256=sha(selected),
        selectedArtGrid=[2, 4] if identity == 'PDPLANE' else [4, 2], visualQa='PASS',
        status='AUTHOR_FINISH_CHECK_PASSED_NATIVE_REVIEW_PENDING',
        visualQaScope='Sheet composition, complete headings and finish only; native binding and user acceptance are separate.')
work_file = output / 'worklist.json'
work_file.write_text(json.dumps(work, indent=2) + '\n')
records = []
for board in work['boards']:
    identity = board['identity']
    for density in [2, 4]:
        revision = f'urban-sov01-r7-clean-r2-{density}x'
        pack = base / 'resources/hd-packs' / ('campaign-sov01-' + identity.lower() + '-vxl') / revision
        review = output / (identity.lower() + '-' + str(density) + 'x')
        cmd = [sys.executable, 'scripts/m1/yuri-units/export-vxl.py', identity, str(work_file), revision, str(review),
            '--ownership-references', str(base / 'original-reference-v2'), '--output', str(pack),
            '--density', str(density), '--theater', 'URBAN',
            '--acceptance', 'SOURCE_DERIVED_CANDIDATE_VISUAL_REVIEW_PENDING',
            '--inventory', str(base / 'authoring-vxl/inventory.json'), '--reference-report', 'report.json']
        with (output / (identity.lower() + '-' + str(density) + 'x.log')).open('x') as log:
            subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, check=True)
        records.append(dict(identity=identity, density=density, manifest=str(pack / 'manifest.json'),
            sha256=sha(pack / 'manifest.json'), review=str(review)))
        print(json.dumps(records[-1]), flush=True)
with (output / 'exports.json').open('x') as f:
    json.dump(dict(status='PASS_COMPLETE_INDEPENDENT_2X_4X_EXPORTS_NATIVE_PENDING', records=records), f, indent=2)
    f.write('\n')
