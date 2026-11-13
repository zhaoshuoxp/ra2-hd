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

local('lower disc cabin exports retain native registration, lower body, outer rim and complete owner paint', async () => {
    const { PNG } = await import('pngjs');
    for (const variant of vxlUnitIdentities.DISK.variants) {
        const root = `${resourceRoot}/${variant.path.replace('manifest.json', '')}`;
        const previous = `${resourceRoot}/hd-packs/yuri-disk-vxl/r1-${variant.density}x/`;
        const current = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
        const retained = JSON.parse(readFileSync(previous + 'manifest.json', 'utf8'));
        expect(current.sources).toEqual(retained.sources);
        for (const [index, part] of current.parts.entries()) {
            const old = retained.parts[index];
            expect(part.pageSize).toEqual(old.pageSize);
            expect(part.frames.map(({ heading, logicalSize, offset, referenceLinear, referenceOrigin, rect }: any) =>
                ({ heading, logicalSize, offset, referenceLinear, referenceOrigin, rect })))
                .toEqual(old.frames.map(({ heading, logicalSize, offset, referenceLinear, referenceOrigin, rect }: any) =>
                    ({ heading, logicalSize, offset, referenceLinear, referenceOrigin, rect })));
            if (part.member === 'disk.vxl') {
                for (const role of ['base', 'data']) expect(part.files[role].sha256).toBe(old.files[role].sha256);
                continue;
            }
            const image = PNG.sync.read(readFileSync(root + part.files.base.file));
            const before = PNG.sync.read(readFileSync(previous + old.files.base.file));
            const owner = PNG.sync.read(readFileSync(root + part.files.data.file));
            for (const frame of part.frames) {
                const [left, top, width, height] = frame.rect;
                let originalTop = 0, currentTop = 0, painted = 0;
                for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                    const i = ((top + y) * image.width + left + x) * 4;
                    if (Math.abs((x + .5) / width - .5) > .30 || (y + .5) / height > .65)
                        expect(image.data.subarray(i, i + 4)).toEqual(before.data.subarray(i, i + 4));
                    if ((y + .5) / height < .045) { originalTop += before.data[i + 3]; currentTop += image.data[i + 3]; }
                    if (image.data[i] > 2.5 * Math.max(image.data[i + 1], image.data[i + 2])
                        && image.data[i] > 70 && image.data[i + 3] > 5) {
                        expect(owner.data[i]).toBe(255); painted++;
                    }
                }
                expect(originalTop).toBeGreaterThan(0);
                expect(currentTop).toBe(0);
                expect(painted).toBeGreaterThan(50 * variant.density);
            }
        }
    }
});

local('coherent Apocalypse components reconstruct the uncut upper assembly at both densities', async () => {
    const { PNG } = await import('pngjs');
    const original = JSON.parse(readFileSync(`${resourceRoot}/hd-packs/soviet-apoc-vxl/owner-r3/manifest.json`, 'utf8'));
    for (const variant of vxlUnitIdentities.APOC.variants) {
        const root = `${resourceRoot}/${variant.path.replace('manifest.json', '')}`;
        const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
        const [body, turret, barrel] = manifest.parts;
        expect(manifest.sources).toEqual(original.sources);
        expect(manifest.parts.map((p: any) => p.member)).toEqual(['mtnk.vxl', 'mtnktur.vxl', 'mtnkbarl.vxl']);
        expect(body.frames.map(({ heading, offset, logicalSize, referenceLinear, referenceOrigin }: any) =>
            ({ heading, offset, logicalSize, referenceLinear, referenceOrigin })))
            .toEqual(original.parts[0].frames.map(({ heading, offset, logicalSize, referenceLinear, referenceOrigin }: any) =>
                ({ heading, offset, logicalSize, referenceLinear, referenceOrigin })));
        if (variant.density === 4)
            expect(body.files).toEqual(original.parts[0].files);
        const reference = readFileSync(root + manifest.upperAssemblyReference.file);
        expect(createHash('sha256').update(reference).digest('hex')).toBe(manifest.upperAssemblyReference.sha256);
        const full = PNG.sync.read(reference);
        const mount = PNG.sync.read(readFileSync(root + turret.files.base.file));
        const guns = PNG.sync.read(readFileSync(root + barrel.files.base.file));
        expect(turret.frames).toHaveLength(8);
        expect(turret.depthBounds).toEqual(body.depthBounds);
        expect(barrel.depthBounds).toEqual(body.depthBounds);
        let maximumAlphaError = 0, maximumPremultipliedError = 0;
        for (let i = 0; i < full.data.length; i += 4) {
            const a = mount.data[i + 3] / 255, b = guns.data[i + 3] / 255;
            maximumAlphaError = Math.max(maximumAlphaError, Math.abs((a + b * (1 - a)) * 255 - full.data[i + 3]));
            for (let channel = 0; channel < 3; channel++)
                maximumPremultipliedError = Math.max(maximumPremultipliedError, Math.abs(
                    guns.data[i + channel] * b + mount.data[i + channel] * a * (1 - b)
                    - full.data[i + channel] * full.data[i + 3] / 255));
        }
        expect(maximumAlphaError).toBeLessThanOrEqual(1.1);
        expect(maximumPremultipliedError).toBeLessThanOrEqual(1.1);
        turret.frames.forEach((frame: any, index: number) => {
            expect(frame.offset).toEqual(barrel.frames[index].offset);
            expect(frame.logicalSize).toEqual(barrel.frames[index].logicalSize);
            expect(frame.rect).toEqual(barrel.frames[index].rect);
            expect(frame.referenceLinear).toEqual(original.parts[1].frames[index].referenceLinear);
            expect(barrel.frames[index].referenceLinear).toEqual(original.parts[2].frames[index].referenceLinear);
            expect(frame.referenceOrigin).toEqual(original.parts[1].frames[index].referenceOrigin);
        });
    }
});

local('Apocalypse exports preserve proportions, seated mount offsets and matched diagonal tubes', async () => {
    const { PNG } = await import('pngjs');
    for (const variant of vxlUnitIdentities.APOC.variants) {
        const root = `${resourceRoot}/${variant.path.replace('manifest.json', '')}`;
        const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
        const previous = JSON.parse(readFileSync(
            `${resourceRoot}/hd-packs/soviet-apoc-vxl/r6-upper-uniform-${variant.density}x/manifest.json`, 'utf8'));
        const reference = manifest.upperAssemblyReference;
        const bytes = readFileSync(root + reference.sourceFile);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(reference.sourceSha256);
        const source = PNG.sync.read(bytes), full = PNG.sync.read(readFileSync(root + reference.file));
        const bounds = (image: any, rect: number[]) => {
            const [left, top, width, height] = rect;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
                if (image.data[((top + y) * image.width + left + x) * 4 + 3] > 128) {
                    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                }
            return [maxX - minX + 1, maxY - minY + 1];
        };
        const barrel = manifest.parts[2], pixels = PNG.sync.read(readFileSync(root + barrel.files.base.file));
        const diagonalLengths: number[] = [];
        for (const [index, frame] of barrel.frames.entries()) {
            const registration = reference.registration[index];
            expect(registration.matrix).toEqual([[.106, 0], [0, .106]]);
            expect(registration.roofAnchor).toEqual([0, -19.5]);
            expect(registration.mountOffset).toEqual([0, [0, 90].includes(frame.heading) ? 2.5 : 0]);
            registration.sourceHatch.forEach((value: number, axis: number) =>
                expect(value * .106 + registration.offset[axis])
                    .toBeCloseTo(registration.roofAnchor[axis] + registration.mountOffset[axis], 8));
            for (const [partIndex, part] of manifest.parts.entries()) {
                expect(part.files).toEqual(previous.parts[partIndex].files);
                const expected = structuredClone(previous.parts[partIndex].frames[index]);
                if (partIndex > 0) expected.offset[1] += registration.mountOffset[1];
                expect(part.frames[index]).toEqual(expected);
            }
            if ([0, 90].includes(frame.heading)) expect(registration.tubeLengthFactor).toBeLessThan(1);
            else expect(registration.tubeLengthFactor).toBe(1);
            const cell = [Math.floor(index % 4 * source.width / 4), Math.floor(Math.floor(index / 4) * source.height / 2),
                Math.floor((index % 4 + 1) * source.width / 4) - Math.floor(index % 4 * source.width / 4),
                Math.floor((Math.floor(index / 4) + 1) * source.height / 2) - Math.floor(Math.floor(index / 4) * source.height / 2)];
            const before = bounds(source, cell), after = bounds(full, frame.rect);
            before.forEach((span, axis) => expect(Math.abs(after[axis] / variant.density - span * .106)).toBeLessThan(.8));
            const midpoint = (points: number[][]) => new THREE.Vector2((points[0][0] + points[1][0]) / 2,
                (points[0][1] + points[1][1]) / 2);
            const sourceRoot = midpoint(registration.sourceRoots);
            const start = sourceRoot.clone().multiplyScalar(.106).add(new THREE.Vector2(...registration.offset));
            const axis = midpoint(registration.sourceTips).sub(sourceRoot).normalize();
            const normal = new THREE.Vector2(-axis.y, axis.x);
            const [left, top, width, height] = frame.rect;
            const halves = [0, 1].map(() => ({ weight: 0, lateral: 0, tip: -Infinity }));
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                const alpha = pixels.data[((top + y) * pixels.width + left + x) * 4 + 3] / 255;
                if (alpha < .5) continue;
                const delta = new THREE.Vector2(frame.offset[0] + (x + .5) / variant.density,
                    frame.offset[1] + (y + .5) / variant.density).sub(start);
                const along = delta.dot(axis), lateral = delta.dot(normal), half = halves[lateral < 0 ? 0 : 1];
                half.tip = Math.max(half.tip, along);
                if (along > 5 && along < 10) { half.weight += alpha; half.lateral += alpha * lateral; }
            }
            expect(halves.every(half => half.weight > 2)).toBe(true);
            const medianError = halves.reduce((sum, half) => sum + half.lateral / half.weight, 0) / 2;
            expect(Math.abs(medianError)).toBeLessThan(.65);
            if (frame.heading % 90 === 0) diagonalLengths.push((halves[0].tip + halves[1].tip) / 2);
        }
        expect(Math.max(...diagonalLengths) - Math.min(...diagonalLengths)).toBeLessThan(.9);
    }
});

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
