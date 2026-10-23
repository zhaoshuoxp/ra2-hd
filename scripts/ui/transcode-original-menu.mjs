// Local derivative only. Pass an existing ffmpeg executable; never alter the BIK.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const executable = process.argv[2];
if (!executable) throw Error('Pass the path to an existing ffmpeg executable');
const directory = path.resolve('.artifacts/menu-ui/original-screens');
for (const mode of ['original', 'hd']) {
    const output = path.join(directory, `menu-${mode}.webm`);
    if (fs.existsSync(output)) { console.log(`Preserved existing derivative: ${output}`); continue; }
    execFileSync(executable, ['-i', path.join(directory, 'ra2ts_l.bik'), '-an',
        ...(mode === 'hd' ? ['-vf', 'scale=1896:1710:flags=lanczos'] : []),
        '-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0', '-deadline', 'good', '-cpu-used',
        mode === 'hd' ? '4' : '3', output], { stdio: 'inherit' });
}
