import { expect, test } from 'bun:test';
import path from 'node:path';
import { checkedPath } from './windows-transfer.mjs';

test('transfer manifest paths stay inside their resource root', () => {
    const root = path.resolve('transfer');
    expect(checkedPath(root, 'packs/density 4/page.png')).toBe(path.join(root, 'packs/density 4/page.png'));
    for (const value of ['', '/absolute', '../escape', 'a/../b', 'a//b', 'a/./b', 'C:/escape', 'a\\b', 'a\0b']) {
        expect(() => checkedPath(root, value)).toThrow();
    }
});
