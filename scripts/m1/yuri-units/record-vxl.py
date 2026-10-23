"""Pin reviewed independent VXL headings without resampling authored masters."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

from authored_slots import isolated_cells


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(worklist, board_id, generated, inputs, note, qa, cell_order=None):
    work = json.loads(worklist.read_text())
    board = next(b for b in work['boards'] if b['id'] == board_id)
    assert not board.get('selectedArt'), 'Preserve existing selection'
    assert len(generated) == len(inputs) and len(generated) in (1, 4)
    assert [f['heading'] for f in board['frames']] == list(range(0, 360, 45))
    assert sha(Path(board['board'])) == board['boardSha256']
    folder = worklist.parent / 'masters' / board_id
    assert not folder.exists(), 'Preserve existing masters'
    receipts, cells = [], []
    for index, (source, input_file) in enumerate(zip(generated, inputs, strict=True)):
        image = Image.open(source).convert('RGBA')
        assert image.getchannel('A').getextrema()[0] == 0
        grid = (4, 2) if len(generated) == 1 else (2, 1)
        cells.extend(isolated_cells(image, *grid, occupied=8 if len(generated) == 1 else 2))
        destination = folder / f'generated-input-{index + 1}.png'
        metadata = json.loads(input_file.read_text())
        prompt = Path(metadata['promptFile'])
        receipts.append({
            'master': str(destination), 'sha256': sha(source),
            'generatedSource': str(source), 'prompt': str(prompt),
            'promptSha256': sha(prompt),
            'references': [{'path': p, 'sha256': sha(Path(p))}
                           for p in metadata['referencedImagePaths']],
        })
    assert len(cells) == 8
    order = cell_order or list(range(8))
    assert sorted(order) == list(range(8))
    checks = []
    for frame, (detail, bounds) in zip(board['frames'], [cells[i] for i in order], strict=True):
        x0, y0, x1, y1 = frame['sourceBounds']
        logical = [(x1 - x0) / frame['ratio'], (y1 - y0) / frame['ratio']]
        density = min(detail.width / logical[0], detail.height / logical[1])
        if qa == 'PASS':
            assert density >= 4, (board_id, frame['heading'], density)
        checks.append({'heading': frame['heading'], 'availableDensity': density,
                       'authoredSize': list(detail.size), 'inputBounds': bounds})
    destination = folder / 'authored-v1.png'
    # Validate all inputs and headings before creating an immutable selection.
    folder.mkdir(parents=True, exist_ok=False)
    for index, source in enumerate(generated):
        shutil.copyfile(source, folder / f'generated-input-{index + 1}.png')
    if len(generated) == 1:
        shutil.copyfile(generated[0], destination)
    else:
        # Assemble already isolated heading cells at their original pixel density.
        width = max(detail.width for detail, _ in cells) + 48
        height = max(detail.height for detail, _ in cells) + 48
        board_image = Image.new('RGBA', (width * 4, height * 2))
        for index, (detail, _) in enumerate(cells):
            x = index % 4 * width + (width - detail.width) // 2
            y = index // 4 * height + (height - detail.height) // 2
            board_image.alpha_composite(detail, (x, y))
        board_image.save(destination)
    board.update(selectedArt=str(destination), selectedArtSha256=sha(destination),
                 selectedArtGrid=[4, 2], authoredCellOrder=order, visualQa=qa, visualQaNote=note,
                 status='AUTHORED_HEADINGS_REVIEWED' if qa == 'PASS' else 'AUTHORED_CORRECTION_PENDING',
                 densityChecks=checks, generationReceipts=receipts,
                 runtimeActivation=False)
    work['status'] = 'APPROVED_PRODUCTION_IN_PROGRESS'
    worklist.write_text(json.dumps(work, indent=2) + '\n')
    (folder / 'selection.json').write_text(json.dumps(board, indent=2) + '\n')
    print(json.dumps({'board': board_id, 'headings': 8,
                      'minimumDensity': min(c['availableDensity'] for c in checks),
                      'qa': qa, 'path': str(destination)}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('board')
    parser.add_argument('generated', nargs='+', type=Path)
    parser.add_argument('--inputs', nargs='+', type=Path, required=True)
    parser.add_argument('--worklist', type=Path, required=True)
    parser.add_argument('--note', required=True)
    parser.add_argument('--qa', choices=['PASS', 'NEEDS_CORRECTION'], default='PASS')
    parser.add_argument('--cell-order', nargs=8, type=int)
    args = parser.parse_args()
    record(args.worklist, args.board, args.generated, args.inputs, args.note, args.qa, args.cell_order)
