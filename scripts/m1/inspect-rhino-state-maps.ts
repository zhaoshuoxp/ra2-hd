import { readFileSync, writeFileSync } from 'node:fs';
import { retailTree, resolveMember } from '../../src/offline/retail';
import { MapFile } from '../../src/data/MapFile';
import { BridgeOverlayTypes } from '../../src/game/map/BridgeOverlayTypes';
const tree=retailTree(new Map(['ra2.mix','language.mix','multi.mix'].map(n=>[n,readFileSync(`.local/assets/ra2/${n}`)])));
const rows=[];
for(const name of ['MP03T4','MP05T4','MP19T4','MP23T4','MP17T6','MP20T6','MP25T6']) {
    const map=new MapFile(resolveMember(tree,`${name}.map`).file.readAsString());
    const bridges=map.overlays.filter(o=>BridgeOverlayTypes.isBridge(o.id));
    rows.push({name,theater:map.theaterType,bridges:bridges.length,example:bridges[0]});
}
writeFileSync('.artifacts/m1-3g/map-inventory.json',JSON.stringify(rows,null,2));console.log(rows);
