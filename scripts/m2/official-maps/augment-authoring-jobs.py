"""Add native object names to pending authoring prompts without relabeling existing masters."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--jobs', type=Path, default=Path('.artifacts/m2-3/authoring-jobs-v3.json'))
parser.add_argument('--prepared', type=Path, default=Path('.artifacts/m2-3/native-guides-v3'))
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = {item['member']: item for item in json.loads((args.prepared / 'source.json').read_text())['sources']}
document = json.loads(args.jobs.read_text())
for job in document['jobs']:
    if job['format'] != 'shp':
        continue
    descriptions = []
    for position, slot in enumerate(job['members'], 1):
        native = source[slot['member']]
        binding = native['bindings'][0]
        name = binding['nativeRules'].get('Name', binding['id'])
        descriptions.append(f"Cell {position}: {name}; {slot['member']} native frame {slot['frame']}, "
                            f"{slot['state']}, {binding['role']}.")
    job['prompt'] += (' Cell identities in row-major order (descriptive guidance, never rendered text): '
                     + ' '.join(descriptions) + ' Do not substitute a vehicle for a food cart, fire for '
                     'yellow cloth, or debris for an intact lamp. Keep the native silhouette and phase '
                     'above the illustrative style reference. Preserve bright fixed markings exactly; '
                     'do not add new painted marks or symbols.')
    job['nativeCellDescriptions'] = descriptions
document['parentJobsSha256'] = hashlib.sha256(args.jobs.read_bytes()).hexdigest()
document['preparedSourceSha256'] = hashlib.sha256((args.prepared / 'source.json').read_bytes()).hexdigest()
document['revisionPolicy'] = 'Use new prompts for pending jobs only. Existing master receipts retain their original prompts.'
with args.output.open('x') as stream:
    stream.write(json.dumps(document, indent=2) + '\n')
print(json.dumps({'jobs': len(document['jobs']), 'output': str(args.output.resolve())}))
