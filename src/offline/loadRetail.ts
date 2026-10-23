import { PcxFile } from '../data/PcxFile';
import { Engine } from '../engine/Engine';
import { GameResConfig } from '../engine/gameRes/GameResConfig';
import { GameResSource } from '../engine/gameRes/GameResSource';
import { RealFileSystem } from '../data/vfs/RealFileSystem';
import { MemArchive } from '../data/vfs/MemArchive';
import { VirtualFile } from '../data/vfs/VirtualFile';
import { parseMix } from './retail';
import { editionRetailTree, validateEdition } from './editionRetail';
import { GAME_EDITIONS } from '../editions/GameEdition';
import { activeEdition } from '../editions/activeEdition';
import { registerOfficialSkirmish } from './officialSkirmish';

export async function loadRetail() {
    const prefix = activeEdition === 'yr' ? '/local-assets/yr' : '/local-assets';
    const response = await fetch(`${prefix}/manifest.json`);
    if (!response.ok) throw new Error('Local RA2 import missing. Run bun run import:ra2 -- --source PATH first.');
    const manifest = await response.json();
    const top = new Map<string, Uint8Array>();
    for (const name of GAME_EDITIONS[activeEdition].archives) {
        const entry = manifest.files.find((f: any) => f.virtualName === name);
        if (!entry || entry.validation !== 'structural-pass') throw new Error(`Invalid import manifest: ${name}`);
        const res = await fetch(`${prefix}/${name}`);
        if (!res.ok) throw new Error(`Missing staged archive: ${name}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (hash !== entry.sha256 || bytes.length !== entry.bytes) throw new Error(`Staged archive integrity failure: ${name}`);
        top.set(name, bytes);
    }
    const tree = editionRetailTree(top, activeEdition);
    const validation = validateEdition(tree, activeEdition);
    await registerOfficialSkirmish(tree, activeEdition);
    Engine.initGameResSource(GameResSource.Local);
    // No browser directory handles, source paths, loose overrides or CDN mounts.
    const vfs = await Engine.initVfs(new RealFileSystem(), console);
    for (const { path, mix } of tree) vfs.addArchive(mix, path);
    const support = await fetch('/local-support/ra2cd.mix');
    if (!support.ok) throw new Error('Local upstream UI support archive missing; see README.');
    // Only the client UI description is used from the upstream support container.
    const mix = parseMix(new Uint8Array(await support.arrayBuffer()), 'ra2cd.mix');
    const client = new MemArchive();
    client.addFile(mix.openFile('ui.ini'));
    client.addFile(VirtualFile.fromBytes(new TextEncoder().encode('[Battle]\n1=GUI:Battle,STT:ModeBattle,mpbattle.ini,standard,true\n'), 'mpmodescd.ini'));
    vfs.addArchive(client, 'offline-client-ui');
    await vfs.addBagFile('audio.bag');
    await Engine.loadMapList();
    const root = document.getElementById('ra2web-root')!;
    for (const name of ['cue_i', 'cce_i', 'cce_il', 'cce_ir']) {
        const image = new PcxFile(vfs.openFile(`${name}.pcx`));
        root.style.setProperty(`--res-${name.replace('_', '-')}`, `url("${image.toDataUrl()}")`);
    }
    (window as any).__m01 = { validation, archives: vfs.listArchives(), assetDensity: 1, rulesOverrides: [], artOverrides: [] };
    console.info('[M0.1] Validated isolated retail VFS', (window as any).__m01);
    const configToPersist = new GameResConfig('');
    configToPersist.source = GameResSource.Local;
    return { configToPersist, cdnResLoader: undefined };
}
