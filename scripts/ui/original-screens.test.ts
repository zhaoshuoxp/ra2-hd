import { expect, test, spyOn } from 'bun:test';
import * as THREE from 'three';
import { uiArt, validateUiManifest } from '../../src/gui/hd/UiArt';
import { UiArtSpriteBuilder } from '../../src/gui/hd/UiArtSpriteBuilder';
import { SpriteUtils } from '../../src/engine/gfx/SpriteUtils';
import { loadingLayout } from '../../src/gui/screen/game/loadingScreen/loadingLayout';
import { unloadHudSideArchives } from '../../src/gui/screen/game/hudSideArchives';
import { VirtualFileSystem } from '../../src/data/vfs/VirtualFileSystem';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { MemArchive } from '../../src/data/vfs/MemArchive';
test('switching HUD sides removes nested import aliases that shadow the selected retail skin', () => {
    const vfs = new VirtualFileSystem({} as any, { info() {}, warn() {}, error() {} });
    const archive = (value: number) => {
        const a = new MemArchive(); a.addFile(VirtualFile.fromBytes(new Uint8Array([value]), 'tab00.shp')); return a;
    };
    vfs.addArchive(new MemArchive(), 'ra2.mix/conquer.mix');
    vfs.addArchive(archive(1), 'ra2.mix/sidec01.mix');
    vfs.addArchive(archive(2), 'ra2.mix/sidec02.mix');
    vfs.addArchive(new MemArchive(), 'sidec01cd.mix');
    expect(vfs.openFile('tab00.shp').getBytes()[0]).toBe(1);
    for (const side of [2, 1, 2]) {
        unloadHudSideArchives(vfs);
        vfs.addArchive(archive(side), `sidec0${side}.mix`);
        expect(vfs.openFile('tab00.shp').getBytes()[0]).toBe(side);
        expect(vfs.debugListFileOwners('tab00.shp')).toEqual([`sidec0${side}.mix`]);
        expect(vfs.hasArchive('ra2.mix/conquer.mix')).toBe(true);
    }
});
test('a complete button atlas changes UVs without changing native geometry or decoding again', () => {
    const oldManifest=(uiArt as any).manifest, oldEnabled=(uiArt as any).readEnabled;
    (uiArt as any).manifest={revision:'test',assets:[{id:'states',logicalWidth:104,logicalHeight:32}]};
    (uiArt as any).readEnabled=()=>true;
    const texture=new THREE.Texture({width:416,height:128} as any);
    const nativeTexture=new THREE.Texture({width:512,height:512} as any);
    const options={camera:new THREE.PerspectiveCamera(),texture:nativeTexture,textureArea:{x:0,y:0,width:50,height:30},
        align:{x:0,y:-1},offset:{x:2,y:1}};
    const original=new THREE.Mesh(SpriteUtils.createSpriteGeometry(options),new THREE.MeshBasicMaterial());
    let frame=0, releases=0;
    const acquire=spyOn(uiArt,'acquire').mockImplementation((id,ready)=>{
        ready({bitmap:{width:416,height:128} as ImageBitmap,texture,bytes:416*128*4});
        return ()=>releases++;
    });
    const native={build:()=>original,getFrame:()=>frame,setFrame:f=>{frame=f;},
        getSpriteGeometryOptions:()=>options,dispose:()=>{}};
    const builder=new UiArtSpriteBuilder(native,[0,1].map(i=>({id:'states',width:52,height:32,
        atlas:{width:104,height:32,x:52*i,y:0}})),{getImage:()=>({x:2,y:1})});
    try {
        builder.setFrame(1); // Initial state is commonly assigned before build().
        expect(acquire).toHaveBeenCalledTimes(0);
        const group=builder.build(), first=group.children[1] as THREE.Mesh;
        const positions=Array.from(first.geometry.getAttribute('position').array);
        builder.setFrame(0);
        builder.setFrame(1);
        const second=group.children[1] as THREE.Mesh, uv=second.geometry.getAttribute('uv');
        expect(Array.from(second.geometry.getAttribute('position').array)).toEqual(positions);
        expect(Math.min(...Array.from({length:uv.count},(_,i)=>uv.getX(i)))).toBeCloseTo(54/104);
        expect(acquire).toHaveBeenCalledTimes(1); expect(releases).toBe(0);
        builder.setVisible(false); expect(releases).toBe(1); expect(original.visible).toBe(true);
    } finally {
        builder.dispose();acquire.mockRestore();original.geometry.dispose();original.material.dispose();
        texture.dispose();nativeTexture.dispose();(uiArt as any).manifest=oldManifest;(uiArt as any).readEnabled=oldEnabled;
    }
});
test('widescreen and MacBook-shaped viewports expand only the empty background corridor', () => {
    for (const [w,h] of [[1920,1080],[2560,1600],[2560,1664],[2880,1864],[3024,1964],[3456,2234],[1512,945],[900,1200]]) {
        const l=loadingLayout(w,h), extra=l.contentWidth-800;
        expect(l.contentWidth*l.contentScale).toBeCloseTo(w);
        expect(l.contentY+600*l.contentScale).toBeLessThanOrEqual(h+.001);
        // Specialty unit is in the unchanged left part; map and flag move together right.
        expect(210+186).toBeLessThan(430);
        expect(440+extra+360).toBeCloseTo(l.contentWidth);
        expect(extra).toBeGreaterThanOrEqual(0);
    }
});
test('video manifest rejects unsafe paths and altered aspect ratios', () => {
    const v={file:'menu.webm',sha256:'a'.repeat(64),width:632,height:570};
    const m={schemaVersion:1,revision:'video',assets:[],menuVideo:{original:v,hd:{...v,width:1896,height:1710}}};
    expect(validateUiManifest(m)).toBe(m);
    for (const bad of [{...v,file:'../video.webm'},{...v,width:1920},{...v,sha256:'bad'}]) {
        expect(()=>validateUiManifest({...m,menuVideo:{original:v,hd:bad}})).toThrow();
    }
});
