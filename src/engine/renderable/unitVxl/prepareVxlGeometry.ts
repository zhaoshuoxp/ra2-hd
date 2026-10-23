import { VxlFile } from '@/data/VxlFile';
import { VirtualFile } from '@/data/vfs/VirtualFile';
import { DataStream } from '@/data/DataStream';
import { VxlGeometryMonotoneBuilder } from '../builder/vxlGeometry/VxlGeometryMonotoneBuilder';
import { BufferGeometrySerializer } from '@/engine/gfx/geometry/BufferGeometrySerializer';

// The same native mesher runs off the render thread; no geometry or shading changes.
export function prepareVxlGeometry(bytes: ArrayBuffer): ArrayBuffer[] {
    const file = new VxlFile(new VirtualFile(new DataStream(bytes), 'native.vxl'));
    const serializer = new BufferGeometrySerializer();
    return file.sections.map(section => {
        const geometry = new VxlGeometryMonotoneBuilder().build(section);
        try { return serializer.serialize(geometry); }
        finally { geometry.dispose(); }
    });
}
