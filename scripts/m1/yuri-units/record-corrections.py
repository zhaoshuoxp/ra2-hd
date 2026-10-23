"""Select reviewed correction cells without changing unrelated native slots."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image
from authored_slots import isolated_cells


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(folder, generated, note, inputs_file=None):
    correction = json.loads((folder / 'manifest.json').read_text())
    worklist_path = Path(correction['worklist'])
    work = json.loads(worklist_path.read_text())
    member = work['families'][correction['identity']]['members'][0]
    destination = folder / 'authored-v1.png'
    assert not destination.exists(), 'Preserve earlier correction masters'
    image = Image.open(generated).convert('RGBA')
    assert image.getchannel('A').getextrema()[0] == 0
    occupied = correction.get('generatedOccupied', len(correction['frames']))
    cells = isolated_cells(image, *correction['grid'], occupied)
    updates = []
    for record in correction['frames']:
        detail, bounds = cells[record['cellIndex']]
        batch = next(b for b in member['batches'] if b['id'] == record['batch'])
        sample = next(s for s in batch['samples'] if s['frame'] == record['frame'])
        previous = Path(sample.get('selectedArt', batch['selectedArt']))
        assert str(previous) == record['previousMaster'] and sha(previous) == record['previousMasterSha256']
        x0, y0, x1, y1 = sample['bodyColorBounds']
        available = min(detail.width / (x1 - x0), detail.height / (y1 - y0))
        assert available >= 4, (record['frame'], available)
        updates.append((batch, sample, record, bounds, available))
    shutil.copyfile(generated, destination)
    for batch, sample, record, bounds, available in updates:
        sample.update(selectedArt=str(destination), selectedArtSha256=sha(destination),
                      selectedArtGrid=correction['grid'], selectedArtOccupied=len(cells),
                      selectedArtIndex=record['cellIndex'], correctionNote=note)
        record.update(authoredBounds=bounds, availableDensity=available)
        pending = set(batch.get('pendingCorrectionFrames', []))
        pending.discard(record['frame'])
        batch['pendingCorrectionFrames'] = sorted(pending)
        batch.update(visualQa='NEEDS_CORRECTION' if pending else 'PASS',
                     status='AUTHORED_CORRECTION_PENDING' if pending else 'AUTHORED_NATIVE_POSE_REVIEWED',
                     visualQaNote=note)
    worklist_path.write_text(json.dumps(work, indent=2) + '\n')
    correction.update(selectedArt=str(destination), sha256=sha(destination), tool='built-in image_gen',
                      generatedSource=str(generated), visualQa='PASS', visualQaNote=note,
                      otherSlotsPreserved=True, runtimeActivation=False)
    if inputs_file:
        inputs = json.loads(inputs_file.read_text())
        prompt = Path(inputs['promptFile'])
        correction.update(selectedPrompt=str(prompt), selectedPromptSha256=sha(prompt),
                          selectedReferences=[{'path': p, 'sha256': sha(Path(p))}
                                              for p in inputs['referencedImagePaths']])
    (folder / 'selection.json').write_text(json.dumps(correction, indent=2) + '\n')
    print(json.dumps({'path': str(destination), 'frames': len(updates),
                      'minimumDensity': min(u[4] for u in updates)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('folder', type=Path)
    parser.add_argument('generated', type=Path)
    parser.add_argument('--note', required=True)
    parser.add_argument('--inputs-file', type=Path)
    args = parser.parse_args()
    record(args.folder, args.generated, args.note, args.inputs_file)
