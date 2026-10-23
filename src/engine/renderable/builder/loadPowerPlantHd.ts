import { activeEdition } from '@/editions/activeEdition';
import { buildingCoverage } from './sovietBuildingCoverage';
import { requestedHdDensity } from './hdOrigin';
import { Engine } from '@/engine/Engine';
import { ImageFinder } from '@/engine/ImageFinder';
import { TheaterType } from '@/engine/TheaterType';
import { powerPlantMembers, resolvePowerPlantHd, type BuildingHdFamily, type LoadedPowerPlantHd } from './resolvePowerPlantHd';
import { napowrHdFamily } from './napowrHdFamily';
import { isSovietBuildingHdFamily, sovietBuildingHdFamilies } from './sovietBuildingHdFamilies';
import { loadBuildingTurretHd, type BuildingTurretHd } from '../building/BuildingTurretHd';
import { disposePowerPlantHd } from './resolvePowerPlantHd';
import { isYuriBuildingHdFamily } from './yuriBuildingHdFamilies';
import turretContracts from '../../../../desktop/building-turret-contracts.json';
import { withPreparedHdPages } from './preparedHdPage';
import { uploadHdTextures } from './uploadHdTextures';

const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

// One optional, explicit local selection; no changes to the retail VFS or rules.
export async function loadPowerPlantHd(theater: any, renderer: any, enabled = false,
    family: BuildingHdFamily = 'GAPOWR', remainingBudget = 64 * 1024 * 1024, preferredDensity: 2 | 4 = 4, stopped = () => false): Promise<LoadedPowerPlantHd | undefined> {
    const soviet = family === 'NAPOWR';
    const batch = isSovietBuildingHdFamily(family) ? sovietBuildingHdFamilies[family] : undefined;
    const theaterName = TheaterType[theater.type]?.toUpperCase();
    const coverage = buildingCoverage(family, theaterName);
    if ((activeEdition === 'ra2' && (['NAINDP', 'NABNKR'].includes(family)
        || (isYuriBuildingHdFamily(family) && !['NAPSIS', 'NACLON'].includes(family))))
        || (activeEdition === 'yr' && isYuriBuildingHdFamily(family) && !coverage)) return;
    const selectionName = coverage?.selection ?? batch?.selection ?? (soviet ? 'soviet-power-plant' : 'power-plant');
    const requested = requestedHdDensity(enabled, `${selectionName}-hd`, location.href, preferredDensity);
    // Complete-family fallback retains 2x when an authored 4x variant is absent.
    const density = requested;
    if (!density) return;
    let pendingTurret: BuildingTurretHd | undefined;
    let pendingFamily: LoadedPowerPlantHd | undefined;
    try {
        check(theater.type !== TheaterType.None && (theater.type !== TheaterType.Snow || coverage), 'unsupported-building-theater');
        const response = await fetch(`/local-hd/${selectionName}-selection.json`, { signal: AbortSignal.timeout(15000) });
        check(response.ok, 'missing-building-selection');
        const selection = await response.json();
        check(selection.theater === (coverage?.theater ?? 'TEMPERATE')
            && selection.members?.length === (coverage?.members.length ?? batch?.members.length ?? 3), 'invalid-building-selection');
        const finder = new ImageFinder(Engine.getImages() as any, theater);

        const artNames = coverage?.members.map(m => m.artName) ?? batch?.members.map(m => m.artName) ?? (soviet ? ['NAPOWR', 'NAPOWR_A', 'NAPOWRMK'] : ['GAPOWR', 'GAPOWR_A', 'GAPOWRMK']);
        const members: [string, number][] = coverage ? coverage.members.map(m => [m.member, m.frames] as [string, number]) : batch ? batch.members.map(m => [m.member, m.frames] as [string, number])
            : soviet ? napowrHdFamily.members.map(m => [m.member, m.frames]) : [...powerPlantMembers];
        const entries = await Promise.all(members.map(async ([member, count], index) => {
            check(!stopped(), 'cancelled');
            const binding = selection.members[index];
            check(binding.member === member && /^[a-f0-9]{64}$/.test(binding.sha256), 'building-binding-mismatch');
            const prefix = `/local-hd/${binding.sha256}/`;
            const response = await fetch(`${prefix}manifest.json`, { signal: AbortSignal.timeout(15000) });
            check(response.ok, 'missing-building-manifest');
            const bytes = await response.arrayBuffer();
            check(bytes.byteLength <= 2 * 1024 * 1024 && await digest(bytes) === binding.sha256, 'manifest-hash-or-size-mismatch');
            const manifest = JSON.parse(new TextDecoder().decode(bytes));
            check(!stopped(), 'cancelled');
            const image = finder.find(artNames[index], false);
            check(Engine.vfs && image.filename && /^[gny][gatundl].*\.shp$/.test(image.filename), 'resolved-building-member-mismatch');
            const sourceHash = await digest(Uint8Array.from(Engine.vfs!.openFile(image.filename).getBytes()).buffer);
            // Dry theaters sometimes rename the identical retail construction SHP.
            // Reuse only byte-identical sources; frame geometry is checked below.
            check(sourceHash === manifest.source?.sha256, 'resolved-building-source-mismatch');
            const source = { member, sha256: sourceHash, theater: coverage?.members[index].theater ?? 'TEMPERATE', canvas: [image.width, image.height],
                frames: Array.from({ length: count }, (_, nativeFrame) => {
                    const f = image.getImage(nativeFrame);
                    return { nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                        legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean) };
                }) };
            return { image, source, manifest, manifestHash: binding.sha256,
                read: withPreparedHdPages(async (filename: string, hash: string, size: number) => {
                    const route = binding.files?.[filename];
                    check(typeof route === 'string' && new RegExp(`^${prefix}[24]/[a-zA-Z0-9_-]+/(base|data|map)\\.png$`).test(route), 'undeclared-building-page');
                    const response = await fetch(route, { signal: AbortSignal.timeout(15000) });
                    check(response.ok, 'missing-building-page');
                    const bytes = await response.arrayBuffer();
                    check(bytes.byteLength === size && await digest(bytes) === hash, 'page-hash-or-size-mismatch');
                    const header = new DataView(bytes);
                    check(bytes.byteLength >= 24 && header.getUint32(0) === 0x89504e47
                        && header.getUint32(12) === 0x49484452 && header.getUint32(16) <= 2048
                        && header.getUint32(20) <= 2048, 'png-size-limit');
                    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }),
                        { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                    try {
                        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
                        const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bitmap, 0, 0);
                        return { width: canvas.width, height: canvas.height,
                            rgba: new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
                    } finally { bitmap.close(); }
                }, binding.prepared) };
        }));
        const glRenderer = renderer.renderer;
        if (['NALASR', 'NAFLAK', 'GTGCAN', 'NASAM'].includes(family)) pendingTurret = await loadBuildingTurretHd(selection.turret, family, density as 2 | 4);
        const dualTurret = ['YAGGUN', 'YAREFN'].includes(family);
        const contract = turretContracts[family as keyof typeof turretContracts];
        const reservedTurretBytes = dualTurret ? 8 * contract.canvas[0] * contract.canvas[1] * density * density * 5 + 4 : 0;
        if (dualTurret) check(selection.turrets?.['2'] && selection.turrets?.['4'], 'missing-dual-density-turret');
        const loaded = await resolvePowerPlantHd(entries, density, glRenderer.capabilities.maxTextureSize, async textures => {
            await uploadHdTextures(glRenderer, textures, stopped);
            check(glRenderer.getContext().getError() === 0, 'texture-upload-failure');
        }, family, remainingBudget - (pendingTurret?.gpuBytes ?? reservedTurretBytes), soviet || !!batch || !!coverage, stopped);
        pendingFamily = loaded;
        if (dualTurret && loaded.overrides.size) {
            pendingTurret = await loadBuildingTurretHd(selection.turrets[String(loaded.report.density)], family, loaded.report.density as 2 | 4);
            check(pendingTurret.density === loaded.report.density, 'turret-density-mismatch');
        }
        if (pendingTurret) {
            if (loaded.overrides.size) {
                pendingTurret.upload(glRenderer);
                loaded.turret = pendingTurret;
                loaded.report.gpuBytes += pendingTurret.gpuBytes;
            } else pendingTurret.dispose();
        }
        console.info(`[${family} HD selection]`, { ...loaded.report, edition: activeEdition, theater: theaterName,
            resolvedMembers: entries.map(e => ({ member: e.image.filename, sha256: e.source.sha256, frames: e.source.frames.length })) });
        return loaded;
    } catch (error) {
        pendingTurret?.dispose(); disposePowerPlantHd(pendingFamily);
        const loaded: LoadedPowerPlantHd = { overrides: new Map(), report: { density: 1, gpuBytes: 0,
            attempts: [{ density, reason: error instanceof Error ? error.message : 'building-load-failure' }] } };
        console.info(`[${family} HD selection]`, loaded.report);
        return loaded;
    }
}
