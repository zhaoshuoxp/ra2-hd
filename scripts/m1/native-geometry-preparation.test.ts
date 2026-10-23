import { resourceRoot } from '../test-support/resources';
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { GAME_EDITIONS } from '../../src/editions/GameEdition';
import { VxlFile } from '../../src/data/VxlFile';
import { DataStream } from '../../src/data/DataStream';
import { VxlGeometryMonotoneBuilder } from '../../src/engine/renderable/builder/vxlGeometry/VxlGeometryMonotoneBuilder';
import { BufferGeometrySerializer } from '../../src/engine/gfx/geometry/BufferGeometrySerializer';
import { prepareVxlGeometry } from '../../src/engine/renderable/unitVxl/prepareVxlGeometry';
import { VxlPagePreparer } from '../../src/engine/renderable/unitVxl/VxlPagePreparer';

const local = test;

local('worker meshing preserves native DISK and multipart tank geometry exactly', () => {
    const top = new Map(GAME_EDITIONS.yr.archives.map(name => [name,
        readFileSync(`${resourceRoot}/assets/${GAME_EDITIONS.ra2.archives.includes(name as any) ? 'ra2' : 'yr'}/${name}`)]));
    const tree = editionRetailTree(top, 'yr');
    for (const member of ['disk.vxl', 'mtnk.vxl', 'mtnktur.vxl']) {
        const file = resolveMember(tree, member).file;
        const prepared = prepareVxlGeometry(Uint8Array.from(file.getBytes()).buffer);
        file.stream.seek(0);
        const native = new VxlFile(file);
        expect(prepared.length).toBe(native.sections.length);
        for (const [index, section] of native.sections.entries()) {
            const expected = new VxlGeometryMonotoneBuilder().build(section);
            const actual = new BufferGeometrySerializer().unserialize(new DataStream(prepared[index]));
            expect(Object.keys(actual.attributes)).toEqual(Object.keys(expected.attributes));
            for (const key of Object.keys(expected.attributes)) {
                expect(actual.getAttribute(key).array).toEqual(expected.getAttribute(key).array);
            }
            expect(actual.index!.array).toEqual(expected.index!.array);
            actual.computeBoundingBox();
            expect(actual.boundingBox).toEqual(expected.boundingBox);
            actual.dispose(); expected.dispose();
        }
    }
});

test('owned worker returns geometry and cancels outstanding work on disposal', async () => {
    const worker: any = { postMessage: (request: any) => { worker.request = request; }, terminate: () => worker.terminated = true };
    const preparer = new VxlPagePreparer(() => worker);
    const pending = preparer.prepareGeometry(new ArrayBuffer(3));
    worker.onmessage({ data: { id: worker.request.id, geometries: [new ArrayBuffer(4)] } });
    expect((await pending)[0].byteLength).toBe(4);
    expect(preparer.report.geometries).toBe(1);
    const cancelled = preparer.prepareGeometry(new ArrayBuffer(3));
    preparer.dispose();
    await expect(cancelled).rejects.toThrow('cancelled');
    expect(worker.terminated).toBe(true);
    await expect(preparer.prepareGeometry(new ArrayBuffer(1))).rejects.toThrow('cancelled');
});
