import { expect, test } from 'bun:test';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('source political regions preserve complete country borders and uncertain colors', () => {
    const result = spawnSync('python3', [path.join(import.meta.dir, 'test_source_country_regions.py')], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 3 tests');
    expect(result.stderr).toContain('OK');
});
