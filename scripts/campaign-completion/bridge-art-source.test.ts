import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('native bridge axes and adjacent deck paint remain continuous without covering collapsed structures', () => {
    const result = spawnSync('python3', ['scripts/campaign-completion/test_bridge_deck.py'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 6 tests');
});

test('retiring one replaced bridge route list preserves all payload bytes and other mission resources', () => {
    const result = spawnSync('python3', ['scripts/campaign-completion/test_bridge_route_retirement.py'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 5 tests');
});

test('complete bridge source admission guards live frame1, all26 members and native theater/class', () => {
    const result = spawnSync('python3', ['scripts/campaign-completion/test_bridge_art_source.py'],
        { encoding: 'utf8', timeout: 30000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 5 tests');
    expect(result.stderr).toContain('OK');
});

test('bridge material projection pins original landmarks, authored capacity and independent densities', () => {
    const result = spawnSync('python3', ['scripts/campaign-completion/test_bridge_material.py'],
        { encoding: 'utf8', timeout: 30000 });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('Ran 4 tests');
    expect(result.stderr).toContain('OK');
});
