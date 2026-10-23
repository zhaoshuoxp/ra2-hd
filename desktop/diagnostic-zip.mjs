import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';

const table = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
});
function crcUpdate(crc, data) {
    for (const byte of data) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    return crc >>> 0;
}

// Bounded evidence archives use STORE and descriptors; profiles never enter this list.
export async function writeEvidenceZip(destination, entries) {
    const output = await fs.open(destination, 'wx');
    let offset = 0;
    const central = [];
    const write = async bytes => {
        let written = 0;
        while (written < bytes.length) {
            const result = await output.write(bytes, written, bytes.length - written, offset);
            if (!result.bytesWritten) throw Error('Short ZIP write');
            written += result.bytesWritten; offset += result.bytesWritten;
        }
        if (offset > 2 * 1024 ** 3) throw Error('Evidence ZIP exceeds the 2 GiB bound');
    };
    try {
        for (const entry of entries) {
            if (!/^[A-Za-z0-9_.\/-]+$/.test(entry.name) || entry.name.split('/').some(p => !p || p === '.' || p === '..'))
                throw Error('Unsafe evidence name');
            const stat = await fs.lstat(entry.file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024 ** 2) throw Error('Unsafe evidence file');
            const name = Buffer.from(entry.name), header = Buffer.alloc(30), at = offset;
            header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
            header.writeUInt16LE(0x808, 6); header.writeUInt16LE(0x21, 12);
            header.writeUInt16LE(name.length, 26);
            await write(header); await write(name);
            let crc = 0xffffffff, size = 0;
            for await (const chunk of createReadStream(entry.file)) {
                size += chunk.length; crc = crcUpdate(crc, chunk); await write(chunk);
            }
            if (size !== stat.size) throw Error('Evidence changed during export');
            crc = (crc ^ 0xffffffff) >>> 0;
            const descriptor = Buffer.alloc(16);
            descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc, 4);
            descriptor.writeUInt32LE(size, 8); descriptor.writeUInt32LE(size, 12); await write(descriptor);
            const record = Buffer.alloc(46);
            record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
            record.writeUInt16LE(0x808, 8); record.writeUInt16LE(0x21, 14);
            record.writeUInt32LE(crc, 16); record.writeUInt32LE(size, 20); record.writeUInt32LE(size, 24);
            record.writeUInt16LE(name.length, 28); record.writeUInt32LE(at, 42);
            central.push(Buffer.concat([record, name]));
        }
        const centralAt = offset;
        for (const record of central) await write(record);
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
        end.writeUInt32LE(offset - centralAt, 12); end.writeUInt32LE(centralAt, 16);
        await write(end);
    } finally { await output.close(); }
}
