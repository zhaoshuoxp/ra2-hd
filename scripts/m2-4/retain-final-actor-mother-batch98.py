"""Retain a built-in generation and its exact workspace-bound invocation."""
import argparse
import shutil
from pathlib import Path
from PIL import Image
from newurban_batch89_io import pin, read, sha, write

parser = argparse.ArgumentParser()
parser.add_argument('identity')
parser.add_argument('generated', type=Path)
parser.add_argument('--jobs', default='mother-jobs-v2.json')
args = parser.parse_args()
root = Path('.artifacts/m2-4/newurban-final-actors-batch98-20261021')
job, = [j for j in read(root / args.jobs)['jobs'] if j['id'] == args.identity]
destination = Path(job['destination'])
if destination.exists():
    assert sha(destination) == sha(args.generated)
else:
    shutil.copyfile(args.generated, destination)
write(root / (args.identity + '-mother-receipt-v1.json'), dict(mode='BUILT_IN_IMAGEGEN',
    request=dict(prompt=job['prompt'], referenced_image_paths=[str(Path(reference['file']).resolve())
        for reference in [job['reference'], *job.get('additionalReferences', [])]],
        transparent_background=True), source=str(args.generated), retained=pin(destination),
    actualSize=list(Image.open(destination).size), requestJobs=pin(root / args.jobs),
    qualification='Generated mother only. Actual crop capacity, complete states, native bindings and visual acceptance are separate.'))
print(dict(identity=args.identity, size=list(Image.open(destination).size), retained=pin(destination)))
