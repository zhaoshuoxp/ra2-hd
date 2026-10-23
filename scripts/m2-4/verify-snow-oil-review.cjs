// Verify every offline phase choice and native clip in an isolated Electron profile.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const html = path.resolve(argument('html')), output = path.resolve(argument('output'));
const receipt = JSON.parse(fs.readFileSync(html.replace(/\.html$/, '.json')));
assert(!fs.existsSync(output));
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const report = { status: 'RUNNING', html, errors: [], phaseChoices: 0, decodedImages: 0 };
app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 1440, height: 1050,
        webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
    window.webContents.on('console-message', (_event, level, message) => {
        if (level >= 3) report.errors.push(message);
    });
    try {
        await window.loadFile(html);
        report.phases = await window.webContents.executeJavaScript(`(async () => {
            let choices=0, images=0;
            for(const density of [2,4]) for(const state of [0,1]) for(let phase=0;phase<32;phase++) {
                document.querySelector('#density').value=density;document.querySelector('#state').value=state;
                document.querySelector('#phase').value=phase;document.querySelector('#phase').dispatchEvent(new Event('input'));
                for(let i=0;i<4;i++) {
                    const image=document.querySelector('#phase-'+i);await image.decode();
                    const box=image.getBoundingClientRect();
                    if(!image.src.startsWith('data:image/png;base64,')||image.naturalWidth!==166*density
                        ||image.naturalHeight!==122*density||box.width!==image.naturalWidth||box.height!==image.naturalHeight)
                        throw Error('Missing or rescaled phase '+density+'/'+state+'/'+phase+'/'+i);
                    images++;
                }
                choices++;
            }
            return { choices,images };
        })()`);
        assert.equal(report.phases.choices, 128);
        assert.equal(report.phases.images, receipt.imageCount);
        report.phaseChoices = report.phases.choices;
        report.decodedImages = report.phases.images;
        report.videos = await window.webContents.executeJavaScript(`(async () => {
            const results=[];
            for(const video of document.querySelectorAll('video')) {
                if(video.readyState<1) await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=reject;});
                if(!video.src.startsWith('data:video/webm;base64,')||video.videoWidth!==720||video.videoHeight!==640)
                    throw Error('Invalid native clip');
                video.muted=true;await video.play();await new Promise(resolve=>setTimeout(resolve,200));
                if(video.currentTime<=0) throw Error('Native clip failed playback');
                results.push({width:video.videoWidth,height:video.videoHeight,played:true});video.pause();
            }
            document.querySelector('#density').value=2;document.querySelector('#state').value=0;
            document.querySelector('#phase').value=0;document.querySelector('#phase').dispatchEvent(new Event('input'));
            document.querySelector('#next').click();if(document.querySelector('#phase').value!=='1')throw Error('Next');
            document.querySelector('#previous').click();if(document.querySelector('#phase').value!=='0')throw Error('Previous');
            document.querySelector('#play').click();await new Promise(resolve=>setTimeout(resolve,350));
            document.querySelector('#play').click();if(document.querySelector('#phase').value==='0')throw Error('Play phases');
            document.querySelector('#phase').value=0;document.querySelector('#phase').dispatchEvent(new Event('input'));
            return results;
        })()`);
        assert.equal(report.videos.length, receipt.clipCount);
        fs.writeFileSync(path.join(output, 'preview.png'), (await window.webContents.capturePage()).toPNG());
        assert.equal(report.errors.length, 0);
        report.status = 'PASS_128_PHASE_CHOICES_512_NATIVE_SIZE_PNGS_6_OFFLINE_NATIVE_CLIPS';
    } catch (error) { report.status = 'FAIL'; report.failure = error.stack; }
    finally {
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        window.destroy(); app.exit(report.status === 'FAIL' ? 1 : 0);
    }
});
