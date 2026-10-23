import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { rearWallDeckGeometry } from '../../../src/engine/renderable/building/BunkerDepth';
import { gatlingPoseOffsets, gatlingRegistration } from '../../../src/engine/renderable/building/GatlingRegistration';
import { configureGroundShadow, groundShadowOrder } from '../../../src/engine/gfx/material/ShpShadowMaterial';
import pivots from '../../../desktop/gatling-pivots.json';

test('rear wall recovery preserves projection and remains above its native dock floor', () => {
    const source = new THREE.PlaneGeometry(60, 30), world = new THREE.Matrix4().makeTranslation(100, 50, 300);
    const toward = new THREE.Vector3(1, 1, 1).normalize(), deck = 51;
    const original = [...source.attributes.position.array];
    const recovered = rearWallDeckGeometry(source, world, toward, deck);
    for (let i = 0; i < source.attributes.position.count; i++) {
        const a = new THREE.Vector3().fromBufferAttribute(source.attributes.position, i).applyMatrix4(world);
        const b = new THREE.Vector3().fromBufferAttribute(recovered.attributes.position, i).applyMatrix4(world);
        expect(b.y).toBeCloseTo(deck, 4);
        expect(b.sub(a).cross(toward).length()).toBeLessThan(.00001);
    }
    expect([...source.attributes.position.array]).toEqual(original);
    recovered.dispose(); source.dispose();
});

test('Gatling registration retains a consistent construction pose at both densities', () => {
    expect(Object.keys(gatlingPoseOffsets).map(Number)).toEqual([0,45,90,135,180,225,270,315]);
    for (const density of [2,4]) {
        const pose = gatlingRegistration(0);
        expect(pose.x*density).toBe(-9.5*density);
        expect(pose.y*density).toBe(-2.75*density);
        for (const h of [0,45,90,135,180,225,270,315]) {
            const measured = pivots.pivots[String(h) as keyof typeof pivots.pivots];
            const offset = gatlingRegistration(h);
            expect((measured[0]+offset.x+20)*density).toBe(59*density);
            expect((measured[1]+offset.y-14)*density).toBe(28.5*density);
        }
    }
    expect(pivots.pedestalBearingInBody).toEqual([59,37.5]);
    expect(pivots.receiverLift).toBe(9);
});

test('ground shadows blend between ground and actor color without contributing depth', () => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: true, opacity: .5 });
    configureGroundShadow(material);
    expect(material.opacity).toBe(.5);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.blending).toBe(THREE.CustomBlending);
    expect(groundShadowOrder).toBeGreaterThan(-1);
    expect(groundShadowOrder).toBeLessThan(0);
    material.dispose();
});

test('native-projected Gatling exports preserve yaw placement without a pitch-disk correction', () => {
    for (const angle of [0,45,90,135,180,225,270,315]) {
        expect(gatlingRegistration(angle, true)).toEqual({ x: 0, y: 0 });
    }
});
