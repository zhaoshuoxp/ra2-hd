import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function reviewFamilies(page, output, inventory, options = {}) {
    const result = {};
    await page.evaluate(() => {
        const d = window.__ra2debug;
        window.__review = {
            parts() {
                const r = this.r;
                return [r.mainObj, r.bib, ...[...r.animObjects.values()].flat()].filter(Boolean);
            },
            enable(hd) {
                for (const m of this.parts()) for (const b of [m.builder, m.zShapeFixBuilder].filter(Boolean)) {
                    this.bindings ??= new Map();
                    if (!this.bindings.has(b)) this.bindings.set(b, b.hdOverride);
                    b.setFrame(this.r.aggregatedImageData.file.numImages / 2 - b.frameOffset);
                    b.hdOverride = hd ? this.bindings.get(b) : undefined;
                }
                const t = this.r.buildingTurretHd;
                if (t) {
                    if (hd) t.update();
                    else {
                        t.originals.forEach((m, i) => m.material = t.materials[i]);
                        t.meshes.forEach(ms => ms.forEach(m => m.visible = false));
                    }
                }
            },
            pose(damage, type = 0, index = 0) {
                const r = this.r;
                r.updateImage(damage); r.setPowered(true); r.setAnimation(type, 0);
                r.fireObjects.forEach(m => m.get3DObject().visible = false);
                for (const m of this.parts()) {
                    const a = r.animations.get(m);
                    if (a) { a.start(0); m.setFrame(a.getCurrentFrame()); }
                }
                this.current = index;
            },
            capture(mode = '1080p') {
                d.generalOptions.graphics.renderResolution.value = mode;
                d.worldScene.scene.updateMatrixWorld(true);
                d.worldScene.meshBatchManager.updateMeshes();
                d.worldScene.meshBatchManager.processRenderQueue();
                d.renderer.render();
                const rr = d.renderer.renderer, c = rr.domElement, v = d.worldScene.viewport;
                if (!this.center) {
                    const points = [];
                    for (const m of this.parts()) {
                        const mesh = m.getShapeMesh(), pos = mesh.geometry.attributes.position;
                        for (let i = 0; i < pos.count; i++) {
                            const p = d.worldScene.camera.position.clone().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(d.worldScene.camera);
                            points.push([v.x + (p.x + 1) * v.width / 2, v.y + (1 - p.y) * v.height / 2]);
                        }
                    }
                    this.center = [0, 1].map(i => (Math.min(...points.map(p => p[i])) + Math.max(...points.map(p => p[i]))) / 2);
                }
                const [cx, cy] = this.center, sx = c.width / d.renderer.width, sy = c.height / d.renderer.height;
                const crop = [Math.round((cx - 210) * sx), Math.round((cy - 180) * sy), Math.round(420 * sx), Math.round(360 * sy)];
                const out = document.createElement('canvas'); out.width = crop[2]; out.height = crop[3];
                out.getContext('2d').drawImage(c, ...crop, 0, 0, out.width, out.height);
                return { image: out.toDataURL('image/webp', .96), crop, logical: [420, 360], buffer: [c.width, c.height],
                    glError: rr.getContext().getError(), tick: d.game.currentTick,
                    geometry: this.parts().map(m => Array.from(m.getShapeMesh().geometry.attributes.position.array)),
                    parts: this.parts().map(m => ({ visible: m.get3DObject().visible, frame: m.builder.getFrame(),
                        offset: m.builder.frameOffset, material: m.getShapeMesh().material.type,
                        shadow: m.getShadowMesh()?.material.map?.uuid ?? null })) };
            }
        };
    });
    for (const [id, family] of Object.entries(inventory.families)) {
        const row = result[id] = { status: 'RUNNING', fixture: 'Native spawned object and native animation controller; no legal production claim', samples: [], sequences: [] };
        const dir = path.join(output, id); await fs.mkdir(dir);
        await page.evaluate(id => {
            const d = window.__ra2debug, q = window.__review;
            if (q.u) d.game.unspawnObject(q.u);
            const mcv = d.localPlayer.getOwnedObjects().find(u => u.name === 'SMCV');
            const origin = mcv.tile;
            const tile = d.game.map.tiles.getByMapCoords(origin.rx - 8, origin.ry - 2);
            const u = d.game.createObject(2, id); d.game.changeObjectOwner(u, d.localPlayer); d.game.spawnObject(u, tile);
            q.u = u; q.center = null; q.bindings = new Map(); d.worldInteraction.minimapHandler.panToTile(tile);
            d.gameScreen.gameAnimationLoop.start();
        }, id);
        await page.waitForTimeout(450);
        await page.evaluate(() => {
            const d = window.__ra2debug, q = window.__review;
            d.gameScreen.gameAnimationLoop.stop(); d.gameScreen.pointer.unlock();
            q.r = d.renderableManager.getRenderableByGameObject(q.u);
        });
        async function save(file, mode = '1080p', full = false) {
            const sample = await page.evaluate(mode => window.__review.capture(mode), mode);
            assert.equal(sample.glError, 0);
            await fs.writeFile(path.join(dir, file), Buffer.from(sample.image.split(',')[1], 'base64'));
            delete sample.image;
            if (full) row.samples.push({ file, ...sample });
            return sample;
        }
        for (const [state, damage] of [['normal', 0], ['damaged', 1]]) {
            for (const mode of ['1080p', '4k']) {
                const paired = [];
                for (const hd of [false, true]) {
                    await page.evaluate(({ damage, hd }) => { const q = window.__review; q.enable(hd); q.pose(damage); }, { damage, hd });
                    paired.push(await save(`${state}-${mode}-${hd ? 'hd' : 'original'}.webp`, mode, true));
                }
                assert.deepEqual(paired[0].geometry, paired[1].geometry, `${id} geometry changed`);
                assert.deepEqual(paired[0].parts.map(p => p.shadow), paired[1].parts.map(p => p.shadow), `${id} shadows changed`);
            }
        }
        if (options.ownerColors) {
            for (const [name, rgb] of [['blue', { r: 32, g: 80, b: 255 }], ['yellow', { r: 255, g: 235, b: 32 }]]) {
                row.ownerColors ??= [];
                const palette = await page.evaluate(rgb => {
                    const q = window.__review, r = q.r; q.enable(true); q.pose(0);
                    const palette = [...r.paletteRemaps].sort((a, b) => {
                        const distance = p => ['r', 'g', 'b'].reduce((sum, k) => sum + (p.colors[16][k] - rgb[k]) ** 2, 0);
                        return distance(a) - distance(b);
                    })[0];
                    q.parts().forEach(m => m.setPalette(palette));
                    if (r.buildingTurretHd) {
                        q.originalColor ??= q.u.owner.color; q.u.owner.color = rgb; r.buildingTurretHd.update();
                    }
                    return palette.colors.slice(16, 32);
                }, rgb);
                const file = `owner-${name}.webp`; await save(file, '4k'); row.ownerColors.push({ name, file, palette });
            }
            await page.evaluate(() => {
                const q = window.__review; q.parts().forEach(m => m.setPalette(q.r.palette));
                if (q.originalColor) { q.u.owner.color = q.originalColor; q.originalColor = null; q.r.buildingTurretHd.update(); }
            });
        }
        if (options.motionOwner) await page.evaluate(() => {
            const q = window.__review;
            if (q.r.buildingTurretHd) { q.motionOriginalColor = q.u.owner.color; q.u.owner.color = { r: 32, g: 80, b: 255 }; q.r.buildingTurretHd.update(); }
        });
        const typeIndices = {};
        for (const a of family.animations) {
            const index = typeIndices[a.typeId] ?? 0; typeIndices[a.typeId] = index + 1;
            const type = a.type === 'SPECIAL' ? (id === 'TESLA' ? 17 : 14 + index)
                : a.type === 'SUPER' ? (index === 0 ? 0 : 9 + index) : a.typeId === 2 ? 0 : a.typeId;
            for (const damage of (['BUILDUP', 'UNBUILD'].includes(a.type) ? [0] : [0, 1])) {
                const props = a[damage ? 'damaged' : 'normal'] ?? a.normal;
                const sequence = { name: `${a.name}-${a.type}-${damage ? 'damaged' : 'normal'}`, type: a.type,
                    member: a.member, rate: props.rate, speed: 0, files: [], frames: [], fixture: 'Native controller stepped by its unchanged frame rate' };
                await page.evaluate(({ damage, type }) => { const q = window.__review; q.enable(true); q.pose(damage, type); }, { damage, type });
                if (options.motionOwner) {
                    sequence.ownerColor = options.motionOwner;
                    await page.evaluate(() => {
                        const q = window.__review;
                        const palette = [...q.r.paletteRemaps].sort((a, b) => {
                            const distance = p => (p.colors[16].r - 32) ** 2 + (p.colors[16].g - 80) ** 2 + (p.colors[16].b - 255) ** 2;
                            return distance(a) - distance(b);
                        })[0];
                        q.parts().forEach(m => m.setPalette(palette));
                    });
                }
                const observed = await page.evaluate(({ typeId, index }) => {
                    const q = window.__review, m = q.r.animObjects.get(typeId)[index], a = q.r.animations.get(m);
                    q.anim = a; q.animPart = m; q.animTime = 0;
                    return { props: { start: a.props.start, end: a.props.end, reverse: a.props.reverse, rate: a.props.rate,
                        loopStart: a.props.loopStart, loopEnd: a.props.loopEnd, loopCount: a.props.loopCount }, visible: m.get3DObject().visible,
                        speed: q.r.gameSpeed.value };
                }, { typeId: a.typeId, index });
                assert.equal(observed.visible, true, `${id}/${a.name} controller visibility`);
                sequence.speed = observed.speed; sequence.props = observed.props;
                const seen = new Set();
                for (let i = 0; i < 150; i++) {
                    const frame = await page.evaluate(() => window.__review.anim.getCurrentFrame());
                    if (seen.has(frame)) break;
                    seen.add(frame);
                    const file = `${sequence.name}-${String(i).padStart(3, '0')}.webp`;
                    await save(file); sequence.files.push(file); sequence.frames.push(frame);
                    const state = await page.evaluate(() => {
                        const q = window.__review;
                        q.animTime += 1000 / (q.anim.props.rate * q.r.gameSpeed.value) + .01;
                        q.anim.update(q.animTime); q.animPart.setFrame(q.anim.getCurrentFrame());
                        return q.anim.getState();
                    });
                    if (state === 2 && seen.has(await page.evaluate(() => window.__review.anim.getCurrentFrame()))) break;
                }
                assert(sequence.files.length > 0); row.sequences.push(sequence);
            }
        }
        if (id === 'NAWALL') {
            const sequence = { name: 'Wall-connections-normal-and-damaged', rate: 2, speed: 1, files: [], frames: [] };
            for (let frame = 0; frame < 48; frame++) {
                await page.evaluate(frame => { const q = window.__review; q.r.mainObj.setFrame(frame); }, frame);
                const file = `wall-${frame}.webp`; await save(file); sequence.files.push(file); sequence.frames.push(frame);
            }
            row.sequences.push(sequence);
        }
        if (['NALASR', 'NAFLAK'].includes(id)) {
            const sequence = { name: 'Turret-headings', rate: 2, speed: 1, files: [], frames: [] };
            for (let h = 0; h < 360; h += 45) {
                await page.evaluate(h => {
                    const q = window.__review; q.pose(0); q.u.turretTrait.facing = h;
                    q.r.turretRot.rotation.y = h * Math.PI / 180; q.r.turretRot.updateMatrix(); q.r.buildingTurretHd.update();
                }, h);
                const file = `turret-${h}.webp`; await save(file, '4k'); sequence.files.push(file); sequence.frames.push(h);
            }
            row.sequences.push(sequence);
        }
        await page.evaluate(() => {
            const q = window.__review;
            if (q.motionOriginalColor) { q.u.owner.color = q.motionOriginalColor; q.motionOriginalColor = null; q.r.buildingTurretHd.update(); }
        });
        row.status = 'PASS_NATIVE_CONTROLLER_GEOMETRY_SHADOW_REVIEW';
        await fs.writeFile(path.join(output, 'families.json'), JSON.stringify(result, null, 2));
        console.log(id, row.status, row.sequences.reduce((sum, s) => sum + s.files.length, 0), 'motion samples');
    }
    if (options.wallConnections) {
        const row = result.NAWALL;
        row.connectivity = await page.evaluate(() => {
            const d = window.__ra2debug, q = window.__review, wall = q.u;
            q.neighbors = [];
            for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
                const u = d.game.createObject(2, 'NAWALL'); d.game.changeObjectOwner(u, d.localPlayer);
                d.game.spawnObject(u, d.game.map.tiles.getByMapCoords(wall.tile.rx + x, wall.tile.ry + y)); q.neighbors.push(u);
            }
            d.gameScreen.gameAnimationLoop.start();
            return { nativeConnections: wall.wallTrait.wallType, fixture: 'Spawned cross; native WallTrait updates neighboring connection bits' };
        });
        await page.waitForTimeout(400);
        row.connectivity.rendered = await page.evaluate(() => {
            const d = window.__ra2debug, q = window.__review; d.gameScreen.gameAnimationLoop.stop();
            return { frame: q.r.mainObj.builder.getFrame(), hd: !!q.r.mainObj.builder.hdOverride };
        });
        assert.equal(row.connectivity.nativeConnections, 15); assert.equal(row.connectivity.rendered.frame, 15);
        await page.evaluate(() => { const d = window.__ra2debug, q = window.__review; q.u.healthTrait.health = 35; d.gameScreen.gameAnimationLoop.start(); });
        await page.waitForTimeout(300);
        row.connectivity.damagedFrame = await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameAnimationLoop.stop(); return window.__review.r.mainObj.builder.getFrame(); });
        assert.equal(row.connectivity.damagedFrame, 31);
        await page.evaluate(() => { const d = window.__ra2debug; d.game.unspawnObject(window.__review.neighbors[0]); });
        row.connectivity.afterRemoval = await page.evaluate(() => window.__review.u.wallTrait.wallType);
        assert.equal(row.connectivity.afterRemoval, 14);
        row.connectivity.status = 'PASS_NATIVE_CONNECT_DAMAGE_DISCONNECT';
        await fs.writeFile(path.join(output, 'families.json'), JSON.stringify(result, null, 2));
    }
    return result;
}
