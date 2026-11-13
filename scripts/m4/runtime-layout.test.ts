import { expect, test } from 'bun:test';
import path from 'node:path';
import { benchmarkLayout } from './runtime-layout.mjs';

test('portable Windows measurement selects its shipped runtime and shared resources', () => {
    const selected = benchmarkLayout({ 'windows-app': 'D:\\RA2 Test' }, 'D:\\RA2 Test\\source', path.win32);
    expect(selected.runtime).toBe('D:\\RA2 Test\\resources\\app');
    expect(selected.resources).toBe('D:\\RA2 Test\\GameResources');
    expect(selected.executable).toBe('D:\\RA2 Test\\Red Alert 2 HD.exe');
    expect(selected.packaged).toBe(true);
});

test('Mac packaged and source snapshots retain their existing layouts', () => {
    const mac = benchmarkLayout({ app: '/review/Game.app' }, '/source', path.posix);
    expect(mac.runtime).toBe('/review/Game.app/Contents/Resources/app');
    expect(mac.executable).toBe('/review/Game.app/Contents/MacOS/RA2 HD Editions');
    const source = benchmarkLayout({ runtime: '/snapshots/final', resources: '/shared' }, '/source', path.posix);
    expect(source.runtime).toBe('/snapshots/final');
    expect(source.resources).toBe('/shared');
    expect(source.packaged).toBe(false);
    expect(source.executable).toBeUndefined();
});

test('conflicting executable and runtime identity arguments are rejected', () => {
    expect(() => benchmarkLayout({ app: '/mac', 'windows-app': '/win' }, '/source')).toThrow();
    expect(() => benchmarkLayout({ 'windows-app': '/win', runtime: '/other' }, '/source')).toThrow();
});
