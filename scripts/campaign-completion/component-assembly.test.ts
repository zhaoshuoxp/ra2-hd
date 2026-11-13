import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('component assembly preserves native geometry, independent densities and source/material admission guards', () => {
    const result = spawnSync('python3', ['scripts/campaign-completion/test_component_assembly.py'], {
        encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    });
    expect(result.error).toBeUndefined();
    expect({ status: result.status, output: result.stdout + result.stderr }).toEqual({
        status: 0, output: expect.stringContaining('OK'),
    });
    console.info(result.stdout + result.stderr);
}, 60_000);
