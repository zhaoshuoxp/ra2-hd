import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ShpFile } from '../../src/data/ShpFile';
import { retailMember } from '../test-support/resources';

test('the original Gateway Arch exports smooth source-qualified contours at both densities', () => {
    const member = retailMember('ra2', 'cgstl04.shp');
    expect(member.sha256).toBe('5a41203dcdd34dc12790c9a0a2b758d96135f3eceba5f00b13ebe9e75e8134d9');
    const sprite = new ShpFile(member.file), directory = mkdtempSync(join(tmpdir(), 'ra2-arch-registration-'));
    try {
        const file = join(directory, 'source.json');
        writeFileSync(file, JSON.stringify({ sourceSha256: member.sha256, frames: sprite.images.slice(0, 4).map(frame =>
            ({ width: frame.width, height: frame.height, indices: Buffer.from(frame.imageData).toString('base64') })) }));
        const result = spawnSync('python3', ['scripts/campaign-completion/test_curved_arch_registration.py', file], { encoding: 'utf8' });
        expect(result.error).toBeUndefined();
        expect({ status: result.status, output: result.stdout + result.stderr }).toEqual({ status: 0,
            output: expect.stringContaining('OK') });
    } finally { rmSync(directory, { recursive: true, force: true }); }
}, 60_000);
