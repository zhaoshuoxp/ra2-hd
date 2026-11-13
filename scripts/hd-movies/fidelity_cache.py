"""Seed immutable encoded reuse files across hosts with different Unix user IDs."""
import hashlib
from pathlib import Path
import os
import shutil


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def seed_reuse(root: Path, job: dict) -> dict:
    work = root / 'outputs' / job['jobId']
    work.mkdir(parents=True, exist_ok=True)
    linked, copied, present = 0, 0, 0
    for number, item in enumerate(job['reuseSegments']):
        if item is None:
            continue
        source = (root / item['file']).resolve()
        assert source.is_relative_to(root) and sha(source) == item['sha256']
        target = work / f'segment-{number:05}.mp4'
        if target.exists():
            assert sha(target) == item['sha256']; present += 1
        else:
            try:
                os.link(source, target); linked += 1
            except PermissionError:
                shutil.copyfile(source, target); copied += 1
            assert target.stat().st_size == item['bytes'] and sha(target) == item['sha256']
    return dict(linked=linked, copied=copied, present=present,
                policy='Byte-identical cache priming; the pinned pixel worker independently verifies each segment before reuse')
