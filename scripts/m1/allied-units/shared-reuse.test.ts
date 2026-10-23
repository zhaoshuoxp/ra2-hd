import { expect, test } from 'bun:test';
import { retailIni, nativeShpSource } from '../../test-support/resources';
import { SequenceType } from '../../../src/game/art/SequenceType';
import { SequenceReader } from '../../../src/game/art/SequenceReader';
import { ImageFinder } from '../../../src/engine/ImageFinder';
import { UnitHdDemand } from '../../../src/engine/renderable/builder/UnitHdDemand';
import { unitHdAvailableInEdition } from '../../../src/engine/renderable/builder/sharedAlliedUnitHd';
import { sovietUnitHdFamilies } from '../../../src/engine/renderable/builder/sovietUnitHdFamilies';

test('Allied and Soviet engineer leases share one allocation without matching foreign images', async () => {
    const image = { filename: 'engineer.shp' };
    const override = { identity: 'accepted-engineer', frames: [], pages: [] };
    const loads: string[] = [], seen: unknown[] = [];
    const demand = new UnitHdDemand(new Set(['SENGINEER']), 32, async identity => {
        loads.push(identity);
        return { members: new Map([[image.filename, { image, override }]]), density: 2, gpuBytes: 16, attempts: [] };
    }, () => {});
    const finder = new ImageFinder(new Map(), {}, undefined, undefined, undefined, undefined, {}, {
        families: demand.families, report: demand.report, bind: demand.bind.bind(demand),
    });
    const allied = finder.bindUnitHd('ENGINEER', image, value => seen.push(value));
    const soviet = finder.bindUnitHd('SENGINEER', image, value => seen.push(value));
    await demand.idle();
    expect(loads).toEqual(['SENGINEER']);
    expect(seen).toEqual([override, override]);
    expect(demand.report.gpuBytes).toBe(16);
    expect(finder.getUnitHdOverride('ENGINEER', image)).toBe(override);
    expect(finder.getUnitHdOverride('ENGINEER', { filename: 'engineer.shp' })).toBeUndefined();
    expect(finder.getUnitHdOverride('ENGINEER', { filename: 'spy.shp' })).toBeUndefined();
    allied();
    await demand.idle();
    expect(finder.getUnitHdOverride('SENGINEER', image)).toBe(override);
    soviet();
    demand.dispose();
    expect(demand.report.gpuBytes).toBe(0);
});

test('Source-identical stolen-tech units become available in RA2 without opening YR-only families', () => {
    for (const edition of ['ra2', 'yr']) {
        expect(unitHdAvailableInEdition(sovietUnitHdFamilies.CCOMAND, edition)).toBe(true);
        expect(unitHdAvailableInEdition(sovietUnitHdFamilies.PTROOP, edition)).toBe(true);
    }
    expect(unitHdAvailableInEdition(sovietUnitHdFamilies.BORIS, 'ra2')).toBe(false);
    expect(unitHdAvailableInEdition(sovietUnitHdFamilies.SCHP, 'ra2')).toBe(false);
    expect(unitHdAvailableInEdition(sovietUnitHdFamilies.BORIS, 'yr')).toBe(true);
});

test('Reused member slots cover both native sequence maps, including fixed-facing differences', () => {
    for (const edition of ['ra2', 'yr'] as const) {
        const art = retailIni(edition, 'art'), rules = retailIni(edition);
        for (const id of ['ENGINEER', 'CCOMAND', 'PTROOP', 'CIVAN']) {
            const member = sovietUnitHdFamilies[id === 'ENGINEER' ? 'SENGINEER' : id].members[0];
            const { source } = nativeShpSource(edition, member.member, member.sourceHash, member.frames, 'TEMPERATE');
            expect(source.frames).toHaveLength(member.frames);
            const image = rules.getSection(id)!.getString('Image') || id;
            const sequenceName = art.getSection(image)!.getString('Sequence');
            expect(sequenceName.length).toBeGreaterThan(0);
            const sequences = new SequenceReader().readIni(art.getSection(sequenceName)!);
            expect(sequences.size).toBeGreaterThan(10);
            // Retail Idle1 changes from west to south between the two editions.
            expect(sequences.get(SequenceType.Idle1).onlyFacing).toBe(edition === 'ra2' ? 1 : 3);
            if (id === 'PTROOP') expect(sequences.get(SequenceType.Cheer).onlyFacing).toBe(edition === 'ra2' ? 3 : 5);
            for (const sequence of sequences.values()) {
                expect(sequence.startFrame).toBeGreaterThanOrEqual(0);
                const last = sequence.startFrame + sequence.frameCount - 1 + (sequence.onlyFacing ?? 7) * sequence.facingMult;
                expect(last).toBeLessThan(member.frames);
            }
        }
    }
});
