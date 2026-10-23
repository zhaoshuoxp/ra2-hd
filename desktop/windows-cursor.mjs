import { spawn } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';

// One owned helper keeps interop compilation out of menu clicks. Requests
// contain integers only; renderer text is never executed by PowerShell.
export const cursorScript = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
public static class RA2Cursor {
    [DllImport("user32.dll")]
    public static extern bool SetPhysicalCursorPos(int x, int y);
}
'@
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($null -ne ($line = [Console]::In.ReadLine())) {
    if ($line -notmatch '^([0-9]+),(-?[0-9]+),(-?[0-9]+)$') { continue }
    $id = $Matches[1]
    $ok = [RA2Cursor]::SetPhysicalCursorPos([int]$Matches[2], [int]$Matches[3])
    [Console]::Out.WriteLine($id + ':' + [int]$ok)
    [Console]::Out.Flush()
}`;

export class WindowsCursor {
    constructor({ launch = spawn, systemRoot = process.env.SystemRoot, timeout = 5000 } = {}) {
        this.launch = launch; this.systemRoot = systemRoot; this.timeout = timeout;
        this.pending = new Map(); this.sequence = 0; this.disposed = false;
    }
    prepare() {
        if (this.disposed) return Promise.reject(Error('Cursor helper disposed'));
        if (this.ready) return this.ready;
        this.ready = new Promise((resolve, reject) => {
            let settled = false;
            const finish = error => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                error ? reject(error) : resolve();
            };
            this.finishStartup = finish;
            const timer = setTimeout(() => {
                finish(Error('Cursor helper startup timed out')); this.dispose();
            }, this.timeout);
            try {
                if (!this.systemRoot || !path.win32.isAbsolute(this.systemRoot)) throw Error('Missing Windows system root');
                this.child = this.launch(path.win32.join(this.systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
                    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(cursorScript, 'utf16le').toString('base64')],
                    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
                this.lines = createInterface({ input: this.child.stdout });
                this.lines.on('line', line => {
                    if (line === 'ready') { finish(); return; }
                    const match = /^([0-9]+):([01])$/.exec(line);
                    if (match) this.pending.get(Number(match[1]))?.(match[2] === '1');
                });
                this.child.stderr.resume();
                this.child.stdin.on('error', () => this.dispose());
                this.child.on('error', error => { finish(error); this.dispose(); });
                this.child.on('exit', () => { finish(Error('Cursor helper exited')); this.dispose(); });
            } catch (error) { finish(error); this.dispose(); }
        });
        return this.ready;
    }
    async restore(point, allowed = () => true) {
        if (![point?.x, point?.y].every(value => Number.isSafeInteger(value) && Math.abs(value) <= 1000000))
            throw Error('Invalid physical cursor position');
        await this.prepare();
        if (this.disposed || !allowed()) return false;
        return new Promise(resolve => {
            const id = ++this.sequence;
            const finish = restored => {
                if (!this.pending.delete(id)) return;
                clearTimeout(timer); resolve(restored);
            };
            const timer = setTimeout(() => { finish(false); this.dispose(); }, 500);
            this.pending.set(id, finish);
            this.child.stdin.write(`${id},${point.x},${point.y}\n`);
        });
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.finishStartup?.(Error('Cursor helper disposed'));
        for (const finish of this.pending.values()) finish(false);
        this.lines?.close();
        this.child?.stdin.end();
        // Only the child created by this instance is terminated.
        this.child?.kill();
    }
}
