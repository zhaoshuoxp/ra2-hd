// Isolated executable payload, not an app package. Uses the installed Electron runtime.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const output = path.resolve(process.argv[2] ?? `.artifacts/menu-ui/build-${Date.now()}`);
await fs.mkdir(output, { recursive: false });
execFileSync('bun', ['run','build','--outDir',path.join(output,'dist')], { stdio: 'inherit' });
await fs.cp('desktop', path.join(output,'desktop'), { recursive: true });
if (process.platform === 'darwin') execFileSync('/usr/bin/clang', ['-O2','-arch','arm64','-framework','ApplicationServices','desktop/native/restore-cursor.c','-o',path.join(output,'desktop/restore-cursor')]);
const files = async (dir, prefix='') => (await Promise.all((await fs.readdir(path.join(dir,prefix), { withFileTypes:true })).map(async e => {
    const p = path.join(prefix,e.name); return e.isDirectory() ? files(dir,p) : [p];
}))).flat();
const list = (await files(path.join(output,'dist'))).sort().map(f=>'dist/'+f);
await fs.writeFile(path.join(output,'desktop/app-files.json'),JSON.stringify(list));
await fs.writeFile(path.join(output,'package.json'),JSON.stringify({name:'ra2-hd-unified-desktop',version:'0.1.8',private:true,type:'module',main:'desktop/main.mjs',reviewMilestone:'M1.8-UI'}));
const runtimeFiles = [...list,...(await files(path.join(output,'desktop'))).map(f=>'desktop/'+f),'package.json'];
const identity = { head: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    output, resourceRoot: path.resolve('.local'), artStatus:'DIRECTION_REVIEW_PENDING',
    files: await Promise.all(runtimeFiles.map(async file=>({file,sha256:createHash('sha256').update(await fs.readFile(path.join(output,file))).digest('hex')}))) };
await fs.writeFile(path.join(output,'identity.json'),JSON.stringify(identity,null,2));
console.log(output);
