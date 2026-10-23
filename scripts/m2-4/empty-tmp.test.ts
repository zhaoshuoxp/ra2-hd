import { test, expect } from 'bun:test';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { TileSets } from '../../src/game/theater/TileSets';
import { IniFile } from '../../src/data/IniFile';

const placeholder = new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 60, 0, 0, 0, 30, 0, 0, 0, 0, 0, 0, 0]);
test('header-only zero offset declares an empty native slot without fabricating pixels', () => {
    const file = new TmpFile(VirtualFile.fromBytes(placeholder, 'mslop13.des'));
    expect(file.emptySlots).toEqual([0]);
    expect(file.images.length).toBe(1);
    expect(file.getTile(0, 0)).toBeUndefined();
    const sets = new TileSets(new IniFile('[General]\n[TileSet0000]\nFileName=mslop\nSetName=Slope\nTilesInSet=2\n'));
    sets.loadTileData({ get: (name: string) => name === 'mslop01.des' ? file : undefined }, '.des');
    expect(sets.readMaxTileNum()).toBe(2);
    expect(sets.getTile(0)?.files).toEqual([file]);
    expect(sets.getTile(1)?.index).toBe(1);
    expect(() => sets.getTileImage(0, 0, () => 0)).toThrow('has no image');
});
test('invalid short data and nonzero placeholder pointers still fail', () => {
    expect(() => new TmpFile(VirtualFile.fromBytes(placeholder.subarray(0, 19), 'truncated.des'))).toThrow();
    const corrupt = placeholder.slice(); corrupt[16] = 20;
    expect(() => new TmpFile(VirtualFile.fromBytes(corrupt, 'corrupt.des'))).toThrow();
});
