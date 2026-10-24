"""Archive a complete Mac repair app and verify every decompressed entry."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import time
import zipfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('receipt', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()


def sha(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


receipt = json.loads(args.receipt.read_text())
app = Path(receipt['app']).resolve()
inventory = args.receipt.parent / 'app-inventory.json'
assert sha(inventory) == receipt['appInventorySha256']
rows = json.loads(inventory.read_text())
assert app.is_dir() and app.suffix == '.app'
target = args.output.resolve()
assert target.suffix == '.zip' and not target.exists()
assert not target.with_suffix('.json').exists()
target.parent.mkdir(parents=True, exist_ok=True)
actual = {str(file.relative_to(app)) for file in app.rglob('*')
          if file.is_file() or file.is_symlink()}
assert actual == {row['file'] for row in rows}
directories = [app, *(file for file in sorted(app.rglob('*'))
                     if file.is_dir() and not file.is_symlink())]
prefix = app.name + '/'

with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED,
                     compresslevel=1, allowZip64=True, strict_timestamps=False) as archive:
    for directory in directories:
        name = prefix if directory == app else prefix + str(directory.relative_to(app)) + '/'
        info = zipfile.ZipInfo.from_file(directory, name, strict_timestamps=False)
        archive.writestr(info, b'')
    processed = 0
    threshold = 512 * 1024 * 1024
    for index, row in enumerate(rows):
        file = app / row['file']
        assert stat.S_IMODE(file.lstat().st_mode) == row['mode'], row['file']
        name = prefix + row['file']
        if 'link' in row:
            assert file.is_symlink() and os.readlink(file) == row['link'], row['file']
            assert file.resolve().is_relative_to(app), row['file']
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | row['mode']) << 16
            archive.writestr(info, row['link'].encode())
        else:
            assert file.is_file() and not file.is_symlink(), row['file']
            assert file.stat().st_size == row['bytes'], row['file']
            archive.write(file, name)
            processed += row['bytes']
        if processed >= threshold:
            print(json.dumps(dict(phase='archive', entries=index + 1, logicalBytes=processed)), flush=True)
            threshold = processed + 512 * 1024 * 1024

with zipfile.ZipFile(target) as archive:
    infos = archive.infolist()
    assert len(infos) == len({info.filename for info in infos}) == len(rows) + len(directories)
    for directory in directories:
        name = prefix if directory == app else prefix + str(directory.relative_to(app)) + '/'
        info = archive.getinfo(name)
        assert info.is_dir() and stat.S_ISDIR(info.external_attr >> 16), name
        assert stat.S_IMODE(info.external_attr >> 16) == stat.S_IMODE(directory.stat().st_mode), name
    processed = 0
    threshold = 512 * 1024 * 1024
    for index, row in enumerate(rows):
        info = archive.getinfo(prefix + row['file'])
        mode = info.external_attr >> 16
        assert stat.S_IMODE(mode) == row['mode'], row['file']
        if 'link' in row:
            assert stat.S_ISLNK(mode), row['file']
            assert archive.read(info).decode() == row['link'], row['file']
        else:
            assert stat.S_ISREG(mode) and info.file_size == row['bytes'], row['file']
            with archive.open(info) as stream:
                assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['file']
            processed += row['bytes']
        if processed >= threshold:
            print(json.dumps(dict(phase='verify', entries=index + 1, logicalBytes=processed)), flush=True)
            threshold = processed + 512 * 1024 * 1024

result = dict(status='PASS_COMPLETE_MAC_ZIP_ALL_DECOMPRESSED_BYTES_MODES_SYMLINKS',
              file=str(target), bytes=target.stat().st_size, sha256=sha(target),
              app=app.name, sourceApp=str(app), verifiedEntries=len(rows),
              directories=len(directories), logicalBytes=processed, resourceFiles=receipt['resourceFiles'],
              appInventorySha256=receipt['appInventorySha256'],
              compression='DEFLATE_LEVEL_1_ZIP64', timestamp=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
target.with_suffix('.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result), flush=True)
