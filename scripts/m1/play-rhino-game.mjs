// Ordinary local game entry, disposable browser; no vehicle fixtures or adapter injection.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const identity=JSON.parse(await fs.readFile('.artifacts/m1-3f/build-identity.json','utf8'));
for(const [name,expected] of Object.entries(identity.files)) {
    const actual=createHash('sha256').update(await fs.readFile(`.artifacts/m1-3f/build/${name}`)).digest('hex');
    if(actual!==expected)throw Error(`Reviewed build changed: ${name}`);
}
const check=process.argv.includes('--check');
const port=process.env.M13F_PORT??'4071', origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['scripts/m1/serve-power-plant-game.mjs'],{
    env:{...process.env,M12_BUILD_DIR:'.artifacts/m1-3f/build',M12_PORT:port},stdio:['ignore','pipe','inherit']});
let browser;
const stop=()=>browser?.close();
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try {
    await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(Error('Preview startup timed out')),15000);
        let text='';
        server.once('error',error=>{clearTimeout(timeout);reject(error);});
        server.once('exit',code=>{clearTimeout(timeout);reject(Error(`Preview exited (${code}); choose a free M13F_PORT.`));});
        server.stdout.on('data',data=>{
            process.stdout.write(data);text+=String(data);
            if(text.includes(`M1.2 local prototype: ${origin}/`)){clearTimeout(timeout);resolve();}
        });
    });
    browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless:check,args:['--disable-background-networking','--no-first-run']});
    const context=await browser.newContext({viewport:null,serviceWorkers:'block'});
    const page=await context.newPage();
    await page.goto(`${origin}/?conscript-hd=4&power-plant-hd=4`);
    console.log('Normal game ready. Options > Rhino HD (local pack) > HD; then choose a Soviet country in Offline Skirmish.');
    console.log('Reference height remains 900. Original is the default. Close the browser to stop this local preview.');
    if(check){
        await page.getByText('Offline Skirmish',{exact:true}).waitFor({timeout:45000});
        if(await page.evaluate(()=>window.__ra2debug.generalOptions.graphics.rhinoHd.value))throw Error('Original must be the initial default');
        await fs.writeFile('.artifacts/m1-3f/launcher-smoke.json',JSON.stringify({status:'PASS',origin,defaultOriginal:true})+'\n');
    } else await new Promise(resolve=>browser.once('disconnected',resolve));
} finally {
    await browser?.close();server.kill('SIGTERM');
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
}
