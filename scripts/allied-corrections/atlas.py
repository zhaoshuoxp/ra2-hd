"""Clone a selected member into a new revision with unchanged native contracts."""
import copy
import hashlib
import json
from pathlib import Path
from PIL import Image

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def read(path):
    return json.loads(Path(path).read_text())

def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2) + '\n')

class Member:
    def __init__(self, root):
        self.root = Path(root)
        self.manifest = read(self.root / 'manifest.json')
        self.pages = {}
        for variant in self.manifest['variants']:
            for page in variant['pages']:
                for role in ('base', 'data'):
                    self.pages[variant['density'], page['id'], role] = Image.open(self.root / page[role]).convert('RGBA')

    def frame(self, density, n, role='base'):
        if density == 2 and not any(v['density'] == 2 for v in self.manifest['variants']):
            full = self.frame(4, n, role)
            return full.resize(tuple(v // 2 for v in full.size), Image.Resampling.BOX if role == 'base' else Image.Resampling.NEAREST)
        variant = next(v for v in self.manifest['variants'] if v['density'] == density)
        binding = variant['frames'][n]
        x, y, w, h = binding['sampleRect']
        canvas = Image.new('RGBA', tuple(v * density for v in self.manifest['logical']['canvas']),
                           (0, 0, 0, 255 if role == 'data' else 0))
        origin = tuple(v * density for v in self.manifest['logical']['frames'][n]['trimOrigin'])
        canvas.paste(self.pages[density, binding['page'], role].crop((x, y, x + w, y + h)), origin)
        return canvas

    def publish(self, revision, changed, provenance):
        out = self.root.parent / revision
        out.mkdir(parents=True, exist_ok=False)
        manifest = copy.deepcopy(self.manifest)
        manifest['packRevision'] = revision
        manifest['correction'] = provenance
        if any(d == 2 for d, _, _ in changed) and not any(v['density'] == 2 for v in manifest['variants']):
            derived = copy.deepcopy(manifest['variants'][0]); derived['density'] = 2
            manifest['variants'].insert(0, derived)
        for variant in manifest['variants']:
            density = variant['density']
            frames, pages, shelves = [], [], []
            images = {}
            for n, logical in enumerate(manifest['logical']['frames']):
                w, h = [v * density for v in logical['legacyRenderSize']]
                x, y = [v * density for v in logical['trimOrigin']]
                for role in ('base', 'data'):
                    full = changed.get((density, n, role))
                    if full is None: full = self.frame(density, n, role)
                    exported = Image.new('RGBA', (max(1, w), max(1, h)), (0, 0, 0, 255 if role == 'data' else 0))
                    tw, th = [v * density for v in logical['trimSize']]
                    if not logical['empty']: exported.paste(full.crop((x, y, x + tw, y + th)))
                    images[n, role] = exported
                # Zero-size native UVs stay zero; the backing placeholder is private.
                allocation_w, allocation_h = max(1, w), max(1, h)
                shelf = next((s for s in shelves if s['x'] + allocation_w + 4 <= 2048 and s['height'] >= allocation_h + 4), None)
                if shelf is None:
                    pi = next((i for i in range(len(pages)) if sum(s['height'] for s in shelves if s['page'] == i) + allocation_h + 4 <= 2048), len(pages))
                    if pi == len(pages): pages.append({})
                    shelf = dict(page=pi, x=0, y=sum(s['height'] for s in shelves if s['page'] == pi), height=allocation_h + 4)
                    shelves.append(shelf)
                px, py = shelf['x'] + 2, shelf['y'] + 2
                frames.append(dict(nativeFrame=n, page=f"p{shelf['page']}", sampleRect=[px, py, w, h],
                                   contentRect=[px, py, *(v * density for v in logical['trimSize'])]))
                shelf['x'] += allocation_w + 4
            for pi in range(len(pages)):
                size = [max(s['x'] for s in shelves if s['page'] == pi), sum(s['height'] for s in shelves if s['page'] == pi)]
                page = dict(id=f'p{pi}', size=size)
                for role in ('base', 'data'):
                    atlas = Image.new('RGBA', size, (0, 0, 0, 255 if role == 'data' else 0))
                    for n, frame in enumerate(frames):
                        if frame['page'] == page['id']: atlas.paste(images[n, role], tuple(frame['sampleRect'][:2]))
                    filename = f'{density}x-p{pi}-{role}.png'
                    atlas.save(out / filename)
                    page.update({role: filename, role + 'Sha256': sha(out / filename), role + 'Bytes': (out / filename).stat().st_size})
                pages[pi] = page
            variant.update(pages=pages, frames=frames)
        write(out / 'manifest.json', manifest)
        return out, sha(out / 'manifest.json')
