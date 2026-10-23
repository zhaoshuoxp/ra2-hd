import { resourceRoot } from '../test-support/resources';
import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { componentPose, vxlActorIdentity } from '../../src/engine/renderable/unitVxl/VxlUnitRenderer';
import { vxlUnitFamilies } from '../../src/engine/renderable/unitVxl/identities';
import { UnitHdDemand } from '../../src/engine/renderable/builder/UnitHdDemand';
import { vxlUnitIdentities, registerHdResources } from '../../desktop/hd-profile.mjs';

const local = test;

test('civilian truck reuses only its exact accepted source family', () => {
    expect(vxlActorIdentity('DTRUCK', 'TRUCKA')).toBe('DTRUCK');
    expect(vxlActorIdentity('DTRUCK', 'DTRUCK')).toBe('DTRUCK');
    expect(vxlActorIdentity('DTRUCK', 'TRUCKB')).toBe('TRUCKB');
    expect(vxlActorIdentity('CAR', 'TRUCKA')).toBe('TRUCKA');
});

test('component registration preserves native pitch, roll, recoil and pivot translation independently of authored yaw', () => {
    const nativeBasis = new THREE.Matrix4()
        .makeRotationX(-Math.PI / 2)
        .scale(new THREE.Vector3(3, 3, 3));
    for (const yaw of [0, 17, 45, 92, 180, 270, 359])
        for (const bearing of [0, 45, 90, 180, 270, 315]) {
            const reference = new THREE.Matrix4()
                .makeRotationY(THREE.MathUtils.degToRad(bearing))
                .multiply(nativeBasis);
            const residual = new THREE.Matrix4().compose(
                new THREE.Vector3(23, 9, -4),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, 0, -0.12)),
                new THREE.Vector3(1, 0.9, 1),
            );
            const current = residual
                .clone()
                .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(yaw)))
                .multiply(nativeBasis);
            const result = componentPose(
                new THREE.Matrix4(),
                current,
                reference.toArray(),
                yaw,
                bearing,
            );
            result.elements.forEach((v, i) => expect(v).toBeCloseTo(residual.elements[i], 10));
        }
});

test('VXL and SHP leases share one cap and retain each other while a family waits for capacity', async () => {
    const image = { filename: 'sqd.shp' },
        disposed: string[] = [],
        seen: string[] = [];
    const demand = new UnitHdDemand(
        new Set(['SQD', 'DTRUCK']),
        10,
        async (id, budget) => {
            if (budget < 6)
                return {
                    members: new Map(),
                    density: 1,
                    gpuBytes: 0,
                    attempts: [{ reason: 'combined-budget' }],
                };
            return id === 'SQD'
                ? {
                      members: new Map([
                          [
                              image.filename,
                              { image, override: { identity: id, pages: [], frames: [] } },
                          ],
                      ]),
                      density: 2,
                      gpuBytes: 6,
                      attempts: [],
                  }
                : {
                      members: new Map(),
                      density: 4,
                      gpuBytes: 6,
                      attempts: [],
                      vxl: { identity: id, parts: [], dispose: () => disposed.push(id) },
                  };
        },
        (family) => {
            family.vxl?.dispose();
            family.members.forEach((m) => disposed.push(m.override.identity));
        },
    );
    const release = demand.bind('SQD', image, (value) => seen.push(value!.identity));
    demand.bindFamily('DTRUCK', (family) => seen.push(family!.vxl!.identity));
    await demand.idle();
    expect(seen).toEqual(['SQD']);
    expect(demand.report.families.DTRUCK.status).toBe('BUDGET_FALLBACK');
    release();
    await demand.idle();
    expect(seen).toEqual(['SQD', 'DTRUCK']);
    expect(disposed).toEqual(['SQD']);
    expect(demand.report.peakBytes).toBe(6);
    demand.dispose();
    expect(disposed).toEqual(['SQD', 'DTRUCK']);
});

local('VXL desktop and runtime pin the same complete eight-bearing DTRUCK family', async () => {
    const entry = vxlUnitIdentities.DTRUCK,
        contract = vxlUnitFamilies.DTRUCK;
    const bytes = readFileSync(`${resourceRoot}/` + entry.path),
        m = JSON.parse(bytes.toString());
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(contract.hash);
    expect(entry.hash).toBe(contract.hash);
    expect(m.identity).toBe('DTRUCK');
    expect(Object.keys(m.sources)).toEqual(['trucka.hva', 'trucka.vxl']);
    expect(m.parts.map((p: any) => p.member)).toEqual(contract.members);
    for (const part of m.parts)
        expect(part.frames.map((f: any) => f.heading)).toEqual([
            0, 45, 90, 135, 180, 225, 270, 315,
        ]);
    const registered = await registerHdResources(resourceRoot);
    expect(registered.availability['unit-dtruck']).toBe('HD available at 4x');
    expect(registered.routes.has(`/local-vxl/${contract.hash}/manifest.json`)).toBe(true);
    expect(registered.availability['unit-trucka']).toBeUndefined();
});

test('component crops share depth while retaining each native pivot and image registration', async () => {
    const { componentGeometry } =
        await import('../../src/engine/renderable/unitVxl/componentGeometry');
    const { Coords } = await import('../../src/game/Coords');
    const camera = new THREE.OrthographicCamera();
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
    camera.updateMatrixWorld();
    const rotation = new THREE.Matrix4().makeRotationFromEuler(camera.rotation);
    const scale = Math.cos(camera.rotation.y) * Coords.ISO_WORLD_SCALE;
    const toward = new THREE.Vector3(0, 0, 1).applyMatrix4(rotation);
    const part: any = {
        pageSize: [512, 256],
        override: { pages: [{ base: new THREE.Texture() }] },
        depthBounds: [-40, -46, 40, 26],
    };
    const frames = [
        {
            rect: [4, 4, 240, 200],
            offset: [-30, -25],
            logicalSize: [60, 50],
            referenceOrigin: [0, 0, 0],
        },
        {
            rect: [260, 4, 120, 120],
            offset: [-15, -30],
            logicalSize: [30, 30],
            referenceOrigin: [12, 0, -12],
        },
    ];
    const meshes = frames.map((f, i) => {
        const mesh = new THREE.Mesh(
            componentGeometry(part, f as any, camera, true, i * 0.5),
            new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        );
        mesh.position.fromArray(f.referenceOrigin);
        mesh.updateMatrixWorld();
        return mesh;
    });
    let overlaps = 0;
    for (let x = -10; x <= 10; x += 2)
        for (let y = -22; y <= -2; y += 2) {
            const origin = new THREE.Vector3(x * scale, -y * scale, 10000).applyMatrix4(rotation);
            const ray = new THREE.Raycaster(origin, toward.clone().negate());
            const hits = meshes.map((m) => ray.intersectObject(m)[0]);
            if (hits.every(Boolean)) {
                expect(hits[0].distance - hits[1].distance).toBeCloseTo(0.5, 3);
                overlaps++;
            }
        }
    expect(overlaps).toBeGreaterThan(40);
    meshes.forEach((m, i) => {
        const f = frames[i],
            uv = m.geometry.getAttribute('uv'),
            pos = m.geometry.getAttribute('position');
        for (let j = 0; j < pos.count; j++) {
            const p = new THREE.Vector3()
                .fromBufferAttribute(pos, j)
                .add(m.position)
                .applyMatrix4(rotation.clone().invert());
            const pivot = m.position.clone().applyMatrix4(rotation.clone().invert());
            expect((p.x - pivot.x) / scale).toBeCloseTo(
                f.offset[0] + (uv.getX(j) * 512 - f.rect[0]) / 4,
                4,
            );
            expect(-(p.y - pivot.y) / scale).toBeCloseTo(
                f.offset[1] + ((1 - uv.getY(j)) * 256 - f.rect[1]) / 4,
                4,
            );
        }
        m.geometry.dispose();
        m.material.dispose();
    });
});

local(
    'every VXL family pins all component and child resources and eight registered bearings',
    () => {
        for (const [id, contract] of Object.entries(vxlUnitFamilies)) {
            const entry = vxlUnitIdentities[id];
            const bytes = readFileSync(`${resourceRoot}/` + entry.path),
                manifest = JSON.parse(bytes.toString());
            expect(createHash('sha256').update(bytes).digest('hex')).toBe(contract.hash);
            expect(entry.hash).toBe(contract.hash);
            expect(manifest.identity).toBe(id);
            expect([...new Set(manifest.parts.map((p: any) => p.member))].sort()).toEqual(
                [...contract.members].sort(),
            );
            for (const part of manifest.parts) {
                expect(part.frames.map((f: any) => f.heading)).toEqual([
                    0, 45, 90, 135, 180, 225, 270, 315,
                ]);
                for (const resource of Object.values(part.files) as any[]) {
                    const data = readFileSync(
                        `${resourceRoot}/` + entry.path.replace('manifest.json', resource.file),
                    );
                    expect(data.length).toBe(resource.bytes);
                    expect(createHash('sha256').update(data).digest('hex')).toBe(resource.sha256);
                }
            }
        }
    },
);

local(
    'VXL loading fails atomically on missing child, changed source, bad bytes, capacity or cancellation',
    async () => {
        const { loadVxlFamily } = await import('../../src/engine/renderable/unitVxl/loadVxlFamily');
        const { Engine } = await import('../../src/engine/Engine');
        const { retailTree, resolveMember } = await import('../../src/offline/retail');
        const { PNG } = await import('pngjs');
        const tree = retailTree(
            new Map(
                ['ra2.mix', 'language.mix', 'multi.mix'].map((name) => [
                    name,
                    readFileSync(`${resourceRoot}/assets/ra2/${name}`),
                ]),
            ),
        );
        const prior = {
            fetch: globalThis.fetch,
            bitmap: globalThis.createImageBitmap,
            document: globalThis.document,
            vfs: Engine.vfs,
        };
        const entry = vxlUnitIdentities.V3,
            root = `${resourceRoot}/` + entry.path.replace('manifest.json', '');
        const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
        const last = manifest.parts.at(-1).files.data.file;
        try {
            for (const failure of ['source', 'missing-child', 'bad-bytes', 'budget', 'cancel']) {
                let uploads = 0,
                    reads = 0;
                Engine.vfs = {
                    openFile: (name: string) =>
                        failure === 'source'
                            ? { getBytes: () => [0] }
                            : resolveMember(tree, name).file,
                } as any;
                globalThis.fetch = (async (url: any) => {
                    reads++;
                    const name = String(url).split('/').at(-1)!;
                    if (failure === 'missing-child' && name === last)
                        return new Response(null, { status: 404 });
                    const bytes =
                        failure === 'bad-bytes' && name === last
                            ? Buffer.from('bad')
                            : readFileSync(root + name);
                    return new Response(bytes);
                }) as any;
                globalThis.createImageBitmap = (async (blob: Blob) => ({
                    ...PNG.sync.read(Buffer.from(await blob.arrayBuffer())),
                    close() {},
                })) as any;
                globalThis.document = {
                    createElement: () => {
                        let image: any;
                        return {
                            getContext: () => ({
                                drawImage: (b: any) => (image = b),
                                getImageData: () => ({ data: image.data }),
                            }),
                        };
                    },
                } as any;
                const renderer = {
                    capabilities: { maxTextureSize: 4096 },
                    initTexture: () => uploads++,
                    getContext: () => ({ getError: () => 0 }),
                } as any;
                const result = await loadVxlFamily(
                    'V3',
                    failure === 'budget' ? 1 : 100_000_000,
                    renderer,
                    () => failure === 'cancel',
                );
                expect(result.density).toBe(1);
                expect(result.gpuBytes).toBe(0);
                expect(result.vxl).toBeUndefined();
                expect(uploads).toBe(0);
                expect(result.attempts[0].reason).toBe(
                    {
                        source: 'vxl-source-identity',
                        'missing-child': 'missing-vxl-resource',
                        'bad-bytes': 'vxl-hash-mismatch',
                        budget: 'combined-budget',
                        cancel: 'cancelled-or-invalid-path',
                    }[failure],
                );
                if (failure === 'source') expect(reads).toBe(1);
                if (failure === 'cancel') expect(reads).toBe(0);
            }
        } finally {
            globalThis.fetch = prior.fetch;
            globalThis.createImageBitmap = prior.bitmap;
            globalThis.document = prior.document;
            Engine.vfs = prior.vfs;
        }
    },
);

local(
    'visible naval hull surfaces preserve registration above water and still descend with native sinking',
    async () => {
        const { componentGeometry } =
            await import('../../src/engine/renderable/unitVxl/componentGeometry');
        const camera = new THREE.OrthographicCamera();
        camera.rotation.order = 'YXZ';
        camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
        camera.updateMatrixWorld();
        const inverse = new THREE.Matrix4().makeRotationFromEuler(camera.rotation).invert();
        let formerlySubmerged = 0;
        for (const id of ['HYD', 'DRED', 'SUB', 'BSUB', 'DEST', 'CARRIER', 'AEGIS', 'LCRF']) {
            const manifest = JSON.parse(
                readFileSync(`${resourceRoot}/` + vxlUnitIdentities[id].path, 'utf8'),
            );
            for (const definition of manifest.parts.filter((p: any) => p.actor === id && !/misl/i.test(p.member))) {
                const part = {
                    ...definition,
                    override: { pages: [{ base: new THREE.Texture() }] },
                };
                for (const frame of part.frames) {
                    const original = componentGeometry(part, frame, camera, false, 0);
                    const corrected = componentGeometry(part, frame, camera, true, 0);
                    const a = original.getAttribute('position'),
                        b = corrected.getAttribute('position');
                    const origin = new THREE.Vector3().fromArray(
                        frame.referenceOrigin ?? [0, 0, 0],
                    );
                    expect(a.count).toBe(b.count);
                    let lowest = Infinity;
                    for (let i = 0; i < a.count; i++) {
                        const old = new THREE.Vector3().fromBufferAttribute(a, i).add(origin);
                        const next = new THREE.Vector3().fromBufferAttribute(b, i).add(origin);
                        if (old.y < 0) formerlySubmerged++;
                        expect(next.y).toBeGreaterThanOrEqual(0.0999);
                        lowest = Math.min(lowest, next.y);
                        old.applyMatrix4(inverse);
                        next.applyMatrix4(inverse);
                        expect(next.x).toBeCloseTo(old.x, 3);
                        expect(next.y).toBeCloseTo(old.y, 3);
                    }
                    // Clamping is authored-local only: a native downward pose can cross water.
                    expect(lowest - 10000).toBeLessThan(0);
                    original.dispose();
                    corrected.dispose();
                    part.override.pages[0].base.dispose();
                }
            }
        }
        expect(formerlySubmerged).toBeGreaterThan(0);
    },
);
