"""Pin selected built-in artwork after structural and native-pose review."""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from authored_slots import isolated_cells


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(worklist_path, identity, batch_id, generated, note, qa, prompt_file=None, inputs_file=None):
    work = json.loads(worklist_path.read_text())
    member = next(m for m in work['families'][identity]['members'] if any(b['id'] == batch_id for b in m['batches']))
    batch = next(b for b in member['batches'] if b['id'] == batch_id)
    assert not batch.get('selectedArt'), 'Preserve the previous selection; use a new revision for corrections'
    destination = Path(batch['prompt']).parent / 'authored-v1.png'
    assert not destination.exists()
    prompt_file = prompt_file or Path(batch['prompt'])
    assert prompt_file.is_file()
    references = [batch['reference'], *batch['styles']]
    if inputs_file:
        inputs = json.loads(inputs_file.read_text())
        assert Path(inputs['promptFile']).resolve() == prompt_file.resolve()
        references = inputs['referencedImagePaths']
    reference_hashes = [{'path': str(p), 'sha256': sha(Path(p))} for p in references]
    image = Image.open(generated).convert('RGBA')
    assert image.getextrema()[3][0] == 0, 'Opaque or painted transparency background'
    columns, rows = batch['grid']
    cells = isolated_cells(image, columns, rows, len(batch['samples']))
    assert len(cells) == len(batch['samples'])
    # Unoccupied cells must not contain a generated additional subject.
    density_checks = []
    for sample, (detail, bounds) in zip(batch['samples'], cells, strict=False):
        x0, y0, x1, y1 = sample['bodyColorBounds']
        available = min(detail.width / (x1 - x0), detail.height / (y1 - y0))
        assert available >= 4, f'Insufficient true 4x detail for frame {sample["frame"]}'
        density_checks.append({'frame': sample['frame'], 'authoredBounds': bounds, 'availableDensity': available,
                               'sourceBodySize': [x1 - x0, y1 - y0], 'authoredSize': detail.size})
    assert len(density_checks) == len(batch['samples'])
    shutil.copyfile(generated, destination)
    batch.update(status='AUTHORED_NATIVE_POSE_REVIEWED' if qa == 'PASS' else 'AUTHORED_CORRECTION_PENDING', selectedArt=str(destination), selectedArtSha256=sha(destination),
                 generatedSource=str(generated), tool='built-in image_gen', visualQa=qa, visualQaNote=note,
                 selectedPrompt=str(prompt_file), selectedPromptSha256=sha(prompt_file),
                 selectedReferences=reference_hashes,
                 densityChecks=density_checks, outputSize=image.size)
    receipt = Path(batch['prompt']).parent / 'selection.json'
    receipt.write_text(json.dumps(batch, indent=2) + '\n')
    worklist_path.write_text(json.dumps(work, indent=2) + '\n')
    print(json.dumps({'identity': identity, 'batch': batch_id, 'frames': len(density_checks), 'minimumDensity': min(c['availableDensity'] for c in density_checks), 'path': str(destination)}))


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('identity')
    p.add_argument('batch')
    p.add_argument('generated', type=Path)
    p.add_argument('--worklist', type=Path, default=Path('.artifacts/yuri-units/shp-production-v1/worklist.json'))
    p.add_argument('--note', required=True)
    p.add_argument('--qa', choices=['PASS', 'NEEDS_CORRECTION'], default='PASS')
    p.add_argument('--prompt-file', type=Path)
    p.add_argument('--inputs-file', type=Path)
    a = p.parse_args()
    record(a.worklist, a.identity, a.batch, a.generated, a.note, a.qa, a.prompt_file, a.inputs_file)
