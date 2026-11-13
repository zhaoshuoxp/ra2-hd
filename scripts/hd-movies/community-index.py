"""Inspect extracted community movie MIX indexes using bounded reads; never install the patch."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[2]

def member_id(name):
    value = name.upper().encode('ascii')
    length, remainder = len(value), len(value) % 4
    if remainder:
        value += bytes([remainder]) + bytes([value[length // 4 * 4]]) * (3 - remainder)
    return zlib.crc32(value)

def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def entries(file):
    size = file.stat().st_size
    with file.open('rb') as stream:
        flags, count, data_size = struct.unpack('<IHI', stream.read(10))
        assert flags in (0, 0x10000), 'Only unencrypted Westwood MIX is supported here'
        start = 10 + count * 12
        assert start + data_size <= size, 'Truncated MIX data'
        index = [struct.unpack('<III', stream.read(12)) for _ in range(count)]
        assert len({item[0] for item in index}) == count, 'Duplicate member ID'
        assert all(offset + length <= data_size for _, offset, length in index)
    return [dict(memberId=identity, offset=start + offset, bytes=length) for identity, offset, length in index]

def inspect(directory, edition):
    inventory = json.loads((ROOT / 'docs/hd-movies-inventory-20261109.json').read_text())
    known = {member_id(movie['original']['member']): movie for movie in inventory['movies'] if movie['edition'] == edition}
    report = dict(schema='hd-movie-community-index-v1', edition=edition, archives=[], movies=[], unknownMembers=0,
                  scope='Source identity lookup and container headers only; full content/cut/visual acceptance pending')
    for file in sorted(directory.glob('*.mix')):
        index = entries(file)
        report['archives'].append(dict(file=str(file.relative_to(ROOT)), bytes=file.stat().st_size,
                                       sha256=digest(file), members=len(index)))
        with file.open('rb') as stream:
            for item in index:
                movie = known.get(item['memberId'])
                if not movie:
                    report['unknownMembers'] += 1
                    continue
                stream.seek(item['offset'])
                header = stream.read(44)
                record = dict(identity=movie['identity'], originalMember=movie['original']['member'],
                              originalSha256=movie['original']['sha256'], archive=str(file.relative_to(ROOT)), **item,
                              signature=header[:4].decode('ascii', 'replace'))
                if header[:3] in (b'BIK', b'KB2'):
                    frames = struct.unpack_from('<I', header, 8)[0]
                    width, height, numerator, denominator = struct.unpack_from('<IIII', header, 20)
                    tracks = struct.unpack_from('<I', header, 40)[0]
                    assert frames > 0 and width > 0 and height > 0 and numerator > 0 and denominator > 0
                    record.update(frames=frames, width=width, height=height, fpsNumerator=numerator,
                                  fpsDenominator=denominator, fps=numerator / denominator,
                                  seconds=frames * denominator / numerator, audioTracks=tracks)
                report['movies'].append(record)
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('edition', choices=['ra2', 'yr'])
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = inspect(args.directory.resolve(), args.edition)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(output=str(args.output), archives=len(result['archives']), movies=len(result['movies']))))
