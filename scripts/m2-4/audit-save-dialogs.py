"""Read original Windows dialog templates without executing or modifying the game."""
import argparse
import hashlib
import json
from pathlib import Path
import struct

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('executable', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
data = args.executable.read_bytes()
u16 = lambda offset: struct.unpack_from('<H', data, offset)[0]
u32 = lambda offset: struct.unpack_from('<I', data, offset)[0]
pe = u32(0x3c)
assert data[pe:pe + 4] == b'PE\0\0'
optional = pe + 24
count, optional_size = u16(pe + 6), u16(pe + 20)
assert u16(optional) == 0x10b
sections = [struct.unpack_from('<8sIIII', data, optional + optional_size + index * 40)
            for index in range(count)]


def physical(rva):
    for _, virtual_size, address, raw_size, pointer in sections:
        if address <= rva < address + max(virtual_size, raw_size):
            return pointer + rva - address
    raise ValueError(f'Unmapped RVA {rva:x}')


resource = physical(u32(optional + 96 + 16))
resources = []


def directory(offset, trail):
    location = resource + offset
    for index in range(u16(location + 12) + u16(location + 14)):
        name, value = struct.unpack_from('<II', data, location + 16 + index * 8)
        if name & 0x80000000:
            position = resource + (name & 0x7fffffff)
            name = data[position + 2:position + 2 + u16(position) * 2].decode('utf-16le')
        if value & 0x80000000:
            directory(value & 0x7fffffff, [*trail, name])
        else:
            rva, length = struct.unpack_from('<II', data, resource + value)
            resources.append(([*trail, name], data[physical(rva):physical(rva) + length]))


def dialog(raw):
    offset = 0

    def read(format):
        nonlocal offset
        value = struct.unpack_from('<' + format, raw, offset)
        offset += struct.calcsize('<' + format)
        return value[0] if len(value) == 1 else value

    def field():
        first = read('H')
        if first == 0: return ''
        if first == 0xffff: return dict(ordinal=read('H'))
        units = [first]
        while (value := read('H')) != 0: units.append(value)
        return struct.pack('<' + 'H' * len(units), *units).decode('utf-16le')

    extended = raw[:4] == b'\x01\x00\xff\xff'
    if extended:
        read('HH')
        help_id, ex_style, style = read('III')
    else:
        style, ex_style = read('II')
    count, x, y, width, height = read('Hhhhh')
    menu, window_class, title = field(), field(), field()
    font = None
    if style & 0x40:
        font = dict(points=read('H'))
        if extended: font.update(zip(['weight', 'italic', 'charset'], read('HBB')))
        font['face'] = field()
    controls = []
    for _ in range(count):
        offset = (offset + 3) & ~3
        if extended:
            help_id, ex_style, style = read('III')
            x, y, width_control, height_control, control_id = read('hhhhI')
        else:
            style, ex_style, x, y, width_control, height_control, control_id = read('IIhhhhH')
        control_class, text = field(), field()
        extra = read('H')
        if extra: offset += extra
        controls.append(dict(id=control_id, bounds=[x, y, width_control, height_control],
                             windowClass=control_class, text=text, style=style))
    return dict(title=title, bounds=[width, height], font=font, controls=controls,
                parsedBytes=offset, totalBytes=len(raw))


directory(0, [])
dialogs = []
for trail, raw in resources:
    if trail[0] != 5: continue
    try: item = dialog(raw)
    except Exception as error: item = dict(error=str(error))
    dialogs.append(dict(resource=trail, **item))
result = dict(executable=str(args.executable.resolve()), sha256=hashlib.sha256(data).hexdigest(),
              dialogs=dialogs)
args.output.write_text(json.dumps(result, indent=2, ensure_ascii=True) + '\n')
for item in dialogs:
    text = str(item).lower()
    if any(word in text for word in ['savegame', 'loadgame', 'savemission', 'loadmission', 'saving', 'loading']):
        print(json.dumps(item, ensure_ascii=True))
print(json.dumps(dict(dialogs=len(dialogs), errors=sum('error' in item for item in dialogs))))
