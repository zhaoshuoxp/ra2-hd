// Preserve clean original UI contours as continuous paths. Raster photos require authored replacements.
function simplify(points, tolerance = .55) {
    if (points.length < 4) return points;
    const [a,b] = [points[0],points.at(-1)], dx=b[0]-a[0], dy=b[1]-a[1], length=dx*dx+dy*dy;
    let far=0,index=0;
    for(let i=1;i<points.length-1;i++) {
        const p=points[i], t=length ? Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) : 0;
        const distance=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
        if(distance>far){far=distance;index=i;}
    }
    if(far<=tolerance)return[a,b];
    return [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)];
}
export function vectorPaths(image, omit = () => false, { tolerance = .55, cornerRadius = .35, minimumArea = 2 } = {}) {
    const colors = new Map(), at=(x,y)=>{
        if(x<0||y<0||x>=image.width||y>=image.height||omit(x,y))return;
        const i=(y*image.width+x)*4;
        if(!image.data[i+3])return;
        const rgb=[...image.data.subarray(i,i+3)];
        return Math.max(...rgb)<12 ? undefined : '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
    };
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
        const color=at(x,y);if(!color)continue;
        if(!colors.has(color))colors.set(color,new Map()); const edges=colors.get(color);
        const add=(a,b)=>{const key=a.join(',');if(!edges.has(key))edges.set(key,[]);edges.get(key).push(b);};
        if(at(x,y-1)!==color)add([x,y],[x+1,y]);
        if(at(x+1,y)!==color)add([x+1,y],[x+1,y+1]);
        if(at(x,y+1)!==color)add([x+1,y+1],[x,y+1]);
        if(at(x-1,y)!==color)add([x,y+1],[x,y]);
    }
    const paths=[];
    for(const [fill,edges] of colors){
        const loops=[];
        while(edges.size){
            const start=edges.keys().next().value, points=[start.split(',').map(Number)];let key=start;
            do {const next=edges.get(key)?.pop();if(!next)break;if(!edges.get(key).length)edges.delete(key);points.push(next);key=next.join(',');}while(key!==start);
            if(points.length<4)continue;
            const area=Math.abs(points.slice(1).reduce((sum,p,i)=>sum+points[i][0]*p[1]-p[0]*points[i][1],0)/2);
            if(area<minimumArea)continue;
            const half=Math.floor(points.length/2);
            const polygon=[...simplify(points.slice(0,half+1),tolerance).slice(0,-1),...simplify(points.slice(half),tolerance).slice(0,-1)];
            if(polygon.length<3)continue;
            const approach=(p,neighbor)=>{
                const length=Math.hypot(neighbor[0]-p[0],neighbor[1]-p[1]), t=Math.min(.25,cornerRadius/Math.max(.01,length));
                return [p[0]+(neighbor[0]-p[0])*t,p[1]+(neighbor[1]-p[1])*t].map(v=>Math.round(v*100)/100).join(' ');
            };
            const corners=polygon.map((p,i)=>({p:p.join(' '),a:approach(p,polygon[(i+polygon.length-1)%polygon.length]),b:approach(p,polygon[(i+1)%polygon.length])}));
            loops.push('M'+corners[0].a+corners.map(c=>'L'+c.a+'Q'+c.p+' '+c.b).join('')+'Z');
        }
        if(loops.length)paths.push({fill,d:loops.join('')});
    }
    return paths;
}
