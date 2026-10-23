import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const build = path.resolve(process.argv[2] ?? '.artifacts/menu-ui/build-v21');
const reviewOnly = process.argv.includes('--review-only');
const identity=JSON.parse(await fs.readFile(path.join(build,'identity.json'),'utf8'));
for(const item of identity.files){const bytes=await fs.readFile(path.join(build,item.file));if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error(`Changed review payload: ${item.file}`);}
const profile=path.resolve(`.artifacts/menu-ui/manual-${Date.now()}`);await fs.mkdir(profile,{recursive:false});
await fs.writeFile(path.join(profile,'resource-registration.json'),JSON.stringify({schemaVersion:1,directory:path.resolve('.local')}));
const executable=await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const child=spawn(executable,[build],{cwd:'/private/tmp',stdio:'inherit',env:{...process.env,RA2_UI_REVIEW:reviewOnly?'1':'0',RA2_DESKTOP_USER_DATA:profile,RA2_DESKTOP_NO_DISCOVERY:'1'}});
process.on('SIGINT',()=>child.kill('SIGTERM'));
child.on('exit',code=>process.exitCode=code??0);
console.log(`Review payload: ${build}\nResource root: ${path.resolve('.local')}\nIsolated profile: ${profile}`);
