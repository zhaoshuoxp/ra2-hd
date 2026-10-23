// One coherent, bounded Rhino geometry study. Coordinates are native section-grid units.
// Continuous chamfers replace voxel stair steps; broad forms carry the readable detail.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { PlainSection } from '../../src/data/vxl/Section';

export const representation = 'section-mesh-v1';
export const builderVersion = 'rhino-chamfer-2';
type Point = [number, number, number];

class Part {
    position: number[] = [];
    normal: number[] = [];
    color: number[] = [];
    triangles = 0;
    constructor(private section: PlainSection) {}
    face(points: Point[], index: number) {
        const world = points.map(p => p.map((v, i) => this.section.minBounds[i]
            + v / [this.section.sizeX, this.section.sizeY, this.section.sizeZ][i]
            * (this.section.maxBounds[i] - this.section.minBounds[i])) as Point);
        const n = new Vector3().subVectors(new Vector3(...world[1]), new Vector3(...world[0]))
            .cross(new Vector3().subVectors(new Vector3(...world[2]), new Vector3(...world[0]))).normalize();
        for (let i = 1; i < world.length - 1; i++) {
            for (const p of [world[0], world[i], world[i+1]]) {
                this.position.push(...p); this.normal.push(...n.toArray()); this.color.push(index/255,0,0);
            }
            this.triangles++;
        }
    }
    // Counterclockwise planar rings, with separately readable bevel/roof palette regions.
    rings(bottom: Point[], top: Point[], side: number, roof = side) {
        this.face([...bottom].reverse(), side); this.face(top, roof);
        bottom.forEach((p, i) => {
            const j = (i+1)%bottom.length;
            this.face([p,bottom[j],top[j],top[i]],side);
        });
    }
    box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, roof = color) {
        const ring = (z: number): Point[] => [[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]];
        this.rings(ring(z0), ring(z1), color, roof);
    }
    chamfer(x0: number,x1: number,y0: number,y1: number,z0: number,z1: number,corner: number,inset: number,color: number,roof=color) {
        const ring = (z: number,d: number): Point[] => [
            [x0+d+corner,y0+d,z],[x1-d-corner,y0+d,z],[x1-d,y0+d+corner,z],[x1-d,y1-d-corner,z],
            [x1-d-corner,y1-d,z],[x0+d+corner,y1-d,z],[x0+d,y1-d-corner,z],[x0+d,y0+d+corner,z],
        ];
        this.rings(ring(z0,0),ring(z1,inset),color,roof);
    }
    // Cylinder along X: the original gun's longitudinal axis, independent of body yaw.
    barrel(x0: number,x1: number,cy: number,cz: number,radius: number,color: number,cap=color) {
        const ring = (x: number): Point[] => Array.from({length: 12},(_,i) => {
            const angle=i*Math.PI/6; return [x,cy+radius*Math.cos(angle),cz+radius*Math.sin(angle)];
        });
        this.rings(ring(x0),ring(x1),color,cap);
    }
    track(y0: number,y1: number) {
        const outer=[[0,2],[3,0],[42,0],[46,3],[46,5],[43,7],[3,7],[0,5]];
        const inner=[[1.2,2.6],[3.7,1.2],[41.5,1.2],[44.7,3.3],[44.7,4.5],[42.2,5.8],[3.8,5.8],[1.2,4.5]];
        const point=(p:number[],y:number):Point=>[p[0],y,p[1]];
        outer.forEach((p,i)=>{
            const j=(i+1)%outer.length;
            this.face([point(p,y0),point(outer[j],y0),point(inner[j],y0),point(inner[i],y0)],53);
            this.face([point(inner[i],y1),point(inner[j],y1),point(outer[j],y1),point(p,y1)],53);
            this.face([point(p,y1),point(outer[j],y1),point(outer[j],y0),point(p,y0)],55);
            this.face([point(inner[i],y0),point(inner[j],y0),point(inner[j],y1),point(inner[i],y1)],55);
        });
        for(const x of [6,14,22,30,39]) {
            const ring=(y:number,radius:number):Point[]=>Array.from({length:12},(_,i)=>
                [x+radius*Math.cos(-i*Math.PI/6),y,3.5+radius*Math.sin(-i*Math.PI/6)]);
            // Ring order points along +Y; both side caps have correct outward winding.
            this.rings(ring(y0+.3,2.3),ring(y1-.3,2.3),55,51);
            this.face([...ring(y0+.28,1.15)].reverse(),47);
            this.face(ring(y1-.28,1.15),47);
        }
    }
    build() {
        const g = new BufferGeometry();
        g.setAttribute('position',new Float32BufferAttribute(this.position,3));
        g.setAttribute('normal',new Float32BufferAttribute(this.normal,3));
        g.setAttribute('color',new Float32BufferAttribute(this.color,3));
        g.setIndex(Array.from({length:this.position.length/3},(_,i)=>i));
        g.computeBoundingBox(); g.computeBoundingSphere(); return g;
    }
}

export function authorRhinoPart(role: 'body'|'turret'|'barrel', section: PlainSection): BufferGeometry {
    const expected = role === 'body' ? [46,34,12] : role === 'turret' ? [28,18,9] : [19,3,3];
    if ([section.sizeX,section.sizeY,section.sizeZ].some((v,i)=>v!==expected[i])) throw Error('Unsupported source geometry');
    const p = new Part(section);
    if (role === 'body') {
        // Two continuous dark track runs, broad tread bars, olive fenders and team panels.
        for (const y of [0,26]) {
            p.track(y,y+8);
            for (let x=3;x<44;x+=5) {
                p.box(x,x+1,y+.15,y+7.85,6.9,7.4,51);
                p.box(x,x+1,y+.02,y+.35,2,5.8,51);
                p.box(x,x+1,y+7.65,y+7.98,2,5.8,51);
            }
            p.chamfer(.8,43.5,y+.2,y+7.8,8,10.7,1,0,72,70);
            for (const [x0,x1] of [[4,10],[12,18],[30,36]]) {
                const outerY=y===0 ? y+.25 : y+6.5;
                p.box(x0,x1,outerY,outerY+1.25,9,11.1,23,21);
            }
        }
        // Sloped front glacis and rear deck. The shoulder leaves a clear track/body gap.
        p.chamfer(1,45,8.2,25.8,3,10,2,0,73,70);
        p.chamfer(2,43,8.5,25.5,9.9,12,2,1,70,70);
        // Recessed rear engine grille: a broad dark inset with five visible slats.
        p.box(3,12,11,23,11.55,11.8,55);
        for (let x=3.5;x<12;x+=2) p.box(x,x+.7,11,23,11.8,11.95,51);
        // Paired front lamps remain subordinate to the silhouette and team color.
        p.box(40,42,9.5,11.5,10.7,11.7,47);
        p.box(40,42,22.5,24.5,10.7,11.7,47);
    } else if (role === 'turret') {
        p.chamfer(0,28,0,18,0,2,2,0,73,70);
        p.chamfer(0,28,0,18,2,7.3,2,2,70,70);
        // Large side owner panels; the neutral roof keeps hatch and cannon root legible.
        for (const y of [.05,16.85]) p.box(4,20,y,y+1.1,2.1,4.8,23,21);
        p.chamfer(10,20,5,13,7.3,9,1.5,.5,53,51);
        p.box(22,27,6.5,11.5,.6,5.2,53,51);
        p.box(3.5,5,7,11,7,8.3,53);
    } else {
        p.barrel(0,4,1.5,1.5,1.5,53);
        p.barrel(4,18,1.5,1.5,1.0,94);
        p.barrel(17.5,19,1.5,1.5,1.2,53,61);
    }
    return p.build();
}
