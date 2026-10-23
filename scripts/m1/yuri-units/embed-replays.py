"""Prepare bounded embedded MP4 previews while preserving full-resolution native recordings."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('review_receipt', type=Path)
p.add_argument('output', type=Path)
p.add_argument('--ffmpeg', type=Path, required=True)
p.add_argument('--resume', action='store_true')
a = p.parse_args()
receipt = json.loads(a.review_receipt.read_text())
review = Path(receipt['html']).parent
a.output.mkdir(parents=True, exist_ok=a.resume)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
clips = []
for group in receipt['runtime']:
    for relative in group['clips']:
        source = (review / relative).resolve()
        destination = a.output / group['name'] / (source.stem + '.mp4')
        destination.parent.mkdir(exist_ok=True)
        crop = group.get('crop')
        if crop:
            assert len(crop) == 4 and all(isinstance(n, int) and n >= 0 for n in crop)
            assert crop[0] > 0 and crop[1] > 0
        filters = (f'crop={crop[0]}:{crop[1]}:{crop[2]}:{crop[3]},' if crop else '') + 'scale=trunc(min(1920\\,iw)/2)*2:-2'
        if not (a.resume and destination.exists() and destination.stat().st_size):
            subprocess.run([str(a.ffmpeg), '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
                '-i', str(source), '-an', '-vf', filters, '-r', '30',
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-threads', '2',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(destination)], check=True)
        subprocess.run([str(a.ffmpeg), '-nostdin', '-hide_banner', '-loglevel', 'error',
            '-i', str(destination), '-f', 'null', '-'], check=True)
        clips.append({'group': group['name'], 'source': str(source), 'sourceSha256': sha(source),
            'preview': str(destination.resolve()), 'sha256': sha(destination),
            'presentationCrop': crop,
            'bytes': destination.stat().st_size,
            'disclosure': 'Embedded H.264 replay preview, at most 1920 pixels wide; original native recording remains unchanged.'})
        print(json.dumps({'clip': source.stem, 'bytes': destination.stat().st_size}), flush=True)
output = a.output / 'manifest.json'
assert not output.exists(), 'Preserve completed media receipts'
output.write_text(json.dumps({'status': 'PASS_ENCODED_AND_FULLY_DECODED', 'clips': clips}, indent=2) + '\n')
print(json.dumps({'manifest': str(output.resolve()), 'clips': len(clips),
    'bytes': sum(c['bytes'] for c in clips)}), flush=True)
