"""Plan the remaining authored frames after explicit representative approval."""
import hashlib
import json
from pathlib import Path
import subprocess

sample = Path('.artifacts/m1-2/art-samples-v1')
approval = json.loads((sample / 'direction-approval.json').read_text())
assert approval['status'] == 'USER_ACCEPTED_DIRECTION_ONLY'
assert hashlib.sha256((sample / 'generated.png').read_bytes()).hexdigest() == approval['artSha256']
out = Path('.artifacts/m1-2/full-art-v1')
out.mkdir(exist_ok=False)
accepted = {('ggpowr.shp', 0), ('ggpowr.shp', 1), ('ggpowr_a.shp', 0), ('ggpowr_a.shp', 8),
            ('gtpowrmk.shp', 5), ('gtpowrmk.shp', 18)}
remaining = [(member, frame, f'{role} {frame:02d}')
             for member, role, count in [('ggpowr.shp', 'Body', 3), ('ggpowr_a.shp', 'Active overlay', 16),
                                          ('gtpowrmk.shp', 'Construction', 25)]
             for frame in range(count) if (member, frame) not in accepted]
batches = []
for index, start in enumerate(range(0, len(remaining), 6)):
    spec = remaining[start:start + 6]
    batch = out / f'batch-{index:02d}'
    batch.mkdir()
    (batch / 'spec.json').write_text(json.dumps(spec, indent=2) + '\n')
    subprocess.run(['python3', 'scripts/m1/prepare-power-plant-samples.py', '--output', str(batch),
                    '--spec', str(batch / 'spec.json')], check=True)
    prompt = f'''Use case: precise-object-edit
Asset type: GAPOWR building sprite animation review board, {len(spec)} occupied cells.
Image 1: exact native frame positions, silhouettes, construction phases and crop boundaries to edit.
Image 2: user-approved authored material and architectural design reference. Copy its crisp silver-blue steel,
red owner-color panels, warm amber core, dark layered central machinery, rivets and restrained wear.
Repaint the original sprites in Image 1 with new high-resolution detail matching Image 2. Maintain the exact
1728x960 board, 3 columns and 2 rows, original labels and green background RGB(32,85,61); unused cells stay empty.
Frames: {json.dumps(spec)}.
Preserve native positions, apparent size, footprint, original isometric camera, all construction heights and
damaged tower angles. Normal active overlay frames 0..7 are different phases of the same machine; damaged
overlay frames 8..15 are phases of the same broken machine. Their narrow rectangle and transparent gaps are
constituent layers: do NOT complete them into whole buildings, add side bases, move towers, or widen them.
Construction frames 0..24 must follow the exact native phase: small foundation early, rising silver/red body,
central mechanism appearing later, extending towers last. Do not prematurely add a completed upper section.
Keep architecture and surface details consistent across cells. Preserve original red team-color regions.
Body frame 2 retains the exact native damaged silhouette, not a new rubble pile. No extra components,
characters, scenery, cast shadows, smoke, haze, floating particles, or glow outside the native silhouette.
Only add detail inside the supplied structure boundaries. These are review candidates, not active game assets.
'''
    (batch / 'prompt.txt').write_text(prompt)
    batches.append({'directory': str(batch), 'spec': spec, 'selectedArt': 'generated.png', 'selectedPrompt': 'prompt.txt'})
(out / 'worklist.json').write_text(json.dumps({'status': 'PENDING_COMPLETE_ART_REVIEW',
    'reusedSamples': [list(x) for x in sorted(accepted)], 'batches': batches, 'requiredAuthoredFrames': 44,
    'retainedOriginalFrames': {'ggpowr.shp': [3, 4, 5], 'ggpowr_a.shp': list(range(16, 32)),
                               'gtpowrmk.shp': list(range(25, 50))}}, indent=2) + '\n')
print(json.dumps({'remaining': len(remaining), 'batches': len(batches), 'output': str(out)}))
