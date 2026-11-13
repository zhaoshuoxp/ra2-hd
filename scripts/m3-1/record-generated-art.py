"""Copy a built-in imagegen result and pin its exact job and source provenance."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
from PIL import Image

job_file, job_id, source = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
job = next(j for j in json.loads(job_file.read_text())['jobs'] if j['id'] == job_id)
destination = Path(job['destination'])
assert source.is_file() and not destination.exists()
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
for path, expected in zip(job['references'], job['referenceSha256s']):
    assert sha(Path(path)) == expected, path
shutil.copyfile(source, destination)
record = dict(schema='m3-1-built-in-imagegen-result-v1', tool='image_gen.imagegen', mode='built-in',
    jobFile=str(job_file.resolve()), jobFileSha256=sha(job_file), job=job, defaultOutput=str(source),
    destination=str(destination), sha256=sha(destination), dimensions=list(Image.open(destination).size),
    status='GENERATED_AWAITING_EXPORT_AND_RUNTIME_REVIEW')
with (job_file.parent / 'imagegen-clean-r2-runs.jsonl').open('a') as f:
    f.write(json.dumps(record) + '\n')
print(json.dumps({k: record[k] for k in ['destination', 'sha256', 'dimensions']}))
