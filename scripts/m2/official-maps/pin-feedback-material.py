"""Pin a builtin ImageGen result and verify independent native-density capacity."""
import argparse
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from showcase_registration import capacity, register, sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    args = parser.parse_args()
    receipt = json.loads(args.receipt.read_text())
    folder = args.receipt.parent
    job = json.loads((folder / 'job.json').read_text())
    source = Path(receipt['source'])
    assert re.fullmatch(r'/Users/Aone/\.codex/generated_images/[\w-]+/exec-[\w-]+\.png', str(source))
    master = folder / 'master.png'
    assert not master.exists(), 'Preserve previous authored results.'
    shutil.copyfile(source, master)
    image = Image.open(master).convert('RGBA')
    rows = []
    for cell in job['cells']:
        rect, _ = register(image, cell, job['boardSize'], isolated=job['occupied'] == 1)
        rows.append(dict(key=cell['key'], sourceRect=rect,
            availableDensity=capacity(rect, cell['nativeBounds'])))
    status = 'PASS_SOURCE_CAPACITY_PENDING_VISUAL_QA' if all(row['availableDensity'] >= 4 for row in rows) else 'REJECTED_INSUFFICIENT_4X_SOURCE_RESOLUTION'
    (folder / 'generation.json').write_text(json.dumps(dict(schema='m2-3-feedback-imagegen-result-v1',
        tool='image_gen.imagegen', source=str(source), master=str(master.resolve()), masterSha256=sha(master),
        size=image.size, promptFile=receipt.get('promptFile', 'prompt.txt'),
        promptSha256=sha(folder / receipt.get('promptFile', 'prompt.txt')), references=job['references'],
        sampling=rows, status=status), indent=2) + '\n')
    print(json.dumps(dict(id=job['id'], status=status, sampling=rows)))


if __name__ == '__main__':
    main()
