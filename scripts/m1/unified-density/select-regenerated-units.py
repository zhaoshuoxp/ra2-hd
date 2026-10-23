"""Bind newly authored deficient poses without changing accepted pose registration."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'allied-units'))
from authored_cells import isolated_cells

root = Path('.artifacts/4x-regeneration')
ledger = json.loads((root / 'unit-generation-jobs-v1.json').read_text())
work_path = root / 'production-shp-work-v1.json'
work = json.loads(work_path.read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
prompts = [record for path in sorted(root.glob('imagegen-prompts*.json'))
           for record in json.loads(path.read_text())['records']]
for prompt in prompts:
    if not prompt.get('job') or prompt.get('selected') is False:
        continue
    source = Path(prompt['output'])
    out = root / 'masters-v1' / (prompt['job'] + '.png')
    if not out.exists():
        shutil.copyfile(source, out)
    assert sha(source) == sha(out)
    bindings = prompt.get('bindings') or [{'job': prompt['job']}]
    for binding in bindings:
        job = next(j for j in ledger['jobs'] if j['job'] == binding['job'])
        grid = prompt.get('grid', job['grid'])
        occupied = prompt.get('occupied', len(job['frames']))
        subjects = isolated_cells(Image.open(out).convert('RGBA'), *grid, occupied=occupied)
        selected = binding.get('indices', list(range(len(job['frames']))))
        sampling = [min(subjects[i][0].width / p['nativeBodySize'][0], subjects[i][0].height / p['nativeBodySize'][1])
                    for i, p in zip(selected, job['poses'])]
        assert min(sampling) >= 4, (job['job'], sampling)
        member = next(m for m in work['families'][job['identity']]['members'] if m['sourceMember'] == job['member'])
        batch = next(b for b in member['batches'] if b['id'] == job['batch'])
        for i, frame in zip(selected, job['frames']):
            sample = next(s for s in batch['samples'] if s['frame'] == frame)
            sample.update(selectedArt=str(out), selectedArtSha256=sha(out), selectedArtGrid=grid,
                          selectedArtOccupied=occupied, selectedArtIndex=i, matte='generated-alpha',
                          regenerationJob=job['job'])
        job.update(output=str(out), outputSha256=sha(out), minAvailableDensity=min(sampling),
                   promptRecord=prompt, status='GENERATED_SAMPLING_PASS_VISUAL_REVIEW_PENDING')
        print(job['job'], round(min(sampling), 2))
(root / 'unit-generation-jobs-v1.json').write_text(json.dumps(ledger, indent=2) + '\n')
work_path.write_text(json.dumps(work, indent=2) + '\n')
