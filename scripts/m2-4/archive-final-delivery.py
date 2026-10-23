"""Create and verify an explicit ZIP64 archive from the frozen portable delivery inventory."""
import argparse
import hashlib
import json
import os
import stat
import time
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('folder', type=Path)
parser.add_argument('archive', type=Path)
parser.add_argument('receipt', type=Path)
parser.add_argument('--resume', action='store_true')
args = parser.parse_args()
folder = args.folder.resolve()
archive = args.archive.resolve()
ledger = json.loads((folder / 'Delivery-Inventory.json').read_text())
assert (not archive.exists() or args.resume) and not args.receipt.exists()
assert not any(row['file'].split('/')[0] == 'M2.4-Review-Profile' for row in ledger['files']), \
    'Never archive mutable user configuration; leave any local profile untouched'


def digest(file):
    value = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


rows = ledger['files'] + [dict(file='Delivery-Inventory.json', bytes=(folder / 'Delivery-Inventory.json').stat().st_size,
    sha256=digest(folder / 'Delivery-Inventory.json'))]
completed = 0
if args.resume:
    with zipfile.ZipFile(archive) as previous:
        names = previous.namelist()
        assert names == [folder.name + '/' + row['file'] for row in rows[:len(names)]]
        completed = len(names)
    print(json.dumps(dict(phase='RESUME_EXACT_COMPRESSED_PREFIX', completed=completed, total=len(rows))), flush=True)
with zipfile.ZipFile(archive, 'a' if args.resume else 'x', compression=zipfile.ZIP_DEFLATED,
    compresslevel=1, allowZip64=True, strict_timestamps=False) as output:
    for index, row in enumerate(rows[completed:], completed):
        file = folder / row['file']
        name = folder.name + '/' + row['file']
        if 'link' in row:
            assert file.is_symlink() and os.readlink(file) == row['link']
            timestamp = time.localtime(file.lstat().st_mtime)[:6]
            if timestamp[0] < 1980:
                timestamp = (1980, 1, 1, 0, 0, 0)
            elif timestamp[0] > 2107:
                timestamp = (2107, 12, 31, 23, 59, 58)
            metadata = zipfile.ZipInfo(name, timestamp)
            metadata.create_system = 3
            metadata.external_attr = file.lstat().st_mode << 16
            output.writestr(metadata, row['link'].encode())
        else:
            assert file.is_file() and not file.is_symlink() and file.stat().st_size == row['bytes']
            output.write(file, name)
        if index % 2000 == 0:
            print(json.dumps(dict(phase='WRITE_ZIP64', completed=index, total=len(rows))), flush=True)
with zipfile.ZipFile(archive) as source:
    assert len(source.infolist()) == len(rows)
    assert len(source.namelist()) == len(set(source.namelist()))
    for index, row in enumerate(rows):
        name = folder.name + '/' + row['file']
        metadata = source.getinfo(name)
        if 'link' in row:
            assert stat.S_ISLNK(metadata.external_attr >> 16)
            assert source.read(name).decode() == row['link']
        else:
            assert metadata.file_size == row['bytes']
            assert metadata.external_attr >> 16 & 0o777 == (folder / row['file']).stat().st_mode & 0o777
            value = hashlib.sha256()
            with source.open(name) as stream:
                for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
                    value.update(block)
            assert value.hexdigest() == row['sha256'], row['file']
        if index % 2000 == 0:
            print(json.dumps(dict(phase='VERIFY_ALL_ARCHIVE_HASHES_AND_CRC', completed=index, total=len(rows))), flush=True)
receipt = dict(status='PASS_ZIP64_ALL_PAYLOAD_HASHES_CRC_UNIX_PERMISSIONS_AND_SYMLINKS',
    archive=str(archive), sha256=digest(archive), bytes=archive.stat().st_size,
    entries=len(rows), inventorySha256=digest(folder / 'Delivery-Inventory.json'),
    applicationAndResourcesChanged=False,
    publishedOriginalDataBlockers=ledger.get('publishedOriginalDataBlockers'),
    historicalHiddenSourceAnomalies=ledger.get('historicalHiddenSourceAnomalies'),
    mutableProfileExcluded=True, m24Complete=ledger.get('m24Complete', False),
    timestampPolicy='Archive headers clamp timestamps outside ZIP 1980-2107 bounds; original files and contents remain untouched.',
    windows='NOT_RUN_ON_THIS_MAC')
args.receipt.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
