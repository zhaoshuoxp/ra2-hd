"""Optional hash-bound master replacements and non-publishable sampling audits."""
import hashlib
import inspect
import json
import os
from pathlib import Path
from PIL import Image

_uses = {}


def master_provenance():
    return dict(masterReplacementUses=list(_uses.values()), samplingAuditOnly=bool(os.environ.get('RA2_MASTER_SAMPLING_AUDIT')))


def pixel_sha(image):
    image = image.convert('RGBA')
    return hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()


def resolve_master(source, target):
    """Preserve the accepted target geometry; never enlarge a published master."""
    key = pixel_sha(source)
    mapping = os.environ.get('RA2_REGENERATED_MASTERS')
    entry = json.loads(Path(mapping).read_text()).get(key) if mapping else None
    if entry:
        path = Path(entry['output'])
        assert hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']
        image = Image.open(path).convert('RGBA')
        image = image.crop(image.getchannel('A').point(lambda a: 255 if a > 64 else 0).getbbox())
        _uses[key] = dict(referenceKey=key, output=str(path), sha256=entry['sha256'], sourceSize=list(image.size))
    else:
        image = source
    if image.width >= target[0] and image.height >= target[1]:
        return image
    audit = os.environ.get('RA2_MASTER_SAMPLING_AUDIT')
    assert audit and not entry, ('Insufficient authored master sampling', key, image.size, target)
    root = Path(audit)
    root.mkdir(parents=True, exist_ok=True)
    reference = root / (key + '.png')
    source.save(reference)
    record = dict(key=key, reference=str(reference), referenceSha256=hashlib.sha256(reference.read_bytes()).hexdigest(),
                  sourceSize=list(source.size), targetSize=list(target), status='AWAITING_GENERATION',
                  family=os.environ.get('RA2_AUDIT_FAMILY'),
                  caller=[f'{Path(s.filename).name}:{s.lineno}' for s in inspect.stack()[1:4]])
    (root / (key + '.json')).write_text(json.dumps(record, indent=2) + '\n')
    # An audit may finish composition only to discover other deficient inputs.
    # Its directory must never be used for a published atlas or active binding.
    return source
