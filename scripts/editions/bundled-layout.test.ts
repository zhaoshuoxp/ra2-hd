import { expect, test } from 'bun:test';
import { bundledDirectory } from '../../desktop/bundled-layout.mjs';

test('Windows portable discovery resolves resources and profile beside the EXE', () => {
    const root = 'D:\\Games With Spaces\\RA2 HD\\resources\\app';
    for (const name of ['RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources', 'Review-Profile']) {
        expect(bundledDirectory(root, name, 'win32')).toBe(`D:\\Games With Spaces\\RA2 HD\\${name}`);
    }
    expect(bundledDirectory('\\\\server\\games\\RA2\\resources\\app', 'RA2-HD-Editions-Resources', 'win32'))
        .toBe('\\\\server\\games\\RA2\\RA2-HD-Editions-Resources');
});

test('Mac discovery retains its validated sibling resource location', () => {
    const root = '/Users/reviewer/Desktop/RA2 HD/Game.app/Contents/Resources/app';
    for (const name of ['RA2-HD-Editions-Resources', 'RA2-HD-UI-Resources']) {
        expect(bundledDirectory(root, name, 'darwin')).toBe(`/Users/reviewer/Desktop/RA2 HD/${name}`);
    }
});
