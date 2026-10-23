"""Record strict sampling results and hash-bound building master replacements."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from authored_cells import isolated_cells

root = Path('.artifacts/4x-regeneration')
ledger_path = root / 'building-generation-jobs-v1.json'
ledger = json.loads(ledger_path.read_text())
map_path = root / 'building-master-map-v1.json'
mapping = json.loads(map_path.read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
for path in sorted(root.glob('imagegen-building-prompts*.json')):
    for prompt in json.loads(path.read_text())['records']:
        if prompt.get('selected') is False:
            continue
        job = next(j for j in ledger['jobs'] if j['job'] == prompt['job'])
        sheet = root / 'masters-v1' / (job['job'] + '.png')
        if not sheet.exists():
            shutil.copyfile(prompt['output'], sheet)
        assert sha(sheet) == sha(prompt['output'])
        subjects = isolated_cells(Image.open(sheet).convert('RGBA'), *job['grid'], occupied=job['occupied'])
        for i, binding in enumerate(job['bindings']):
            image, crop = subjects[i]
            box = image.getchannel('A').point(lambda a: 255 if a > 64 else 0).getbbox()
            content = image.crop(box)
            assert content.width >= binding['targetSize'][0] and content.height >= binding['targetSize'][1], (
                job['job'], binding['family'], content.size, binding['targetSize'])
            out = root / 'masters-v1' / (binding['family'] + '-' + binding['key'][:12] + '.png')
            image.save(out)
            mapping[binding['key']] = dict(output=str(out), sha256=sha(out), originalSource= binding,
                authoredSheet=str(sheet), authoredSheetSha256=sha(sheet), sheetCrop=crop,
                contentSize=list(content.size), targetSize=binding['targetSize'], promptRecord=prompt,
                minAvailableDensity=4 * min(content.width / binding['targetSize'][0], content.height / binding['targetSize'][1]))
        job.update(output=str(sheet), outputSha256=sha(sheet), status='GENERATED_SAMPLING_PASS_VISUAL_REVIEW_PENDING')
        print(job['job'], 'STRICT_SAMPLING_PASS')
ledger_path.write_text(json.dumps(ledger, indent=2) + '\n')
map_path.write_text(json.dumps(mapping, indent=2) + '\n')
