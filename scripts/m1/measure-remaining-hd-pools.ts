import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PNG } from 'pngjs';
import { resolvePowerPlantHd, disposePowerPlantHd, type BuildingHdFamily } from '../../src/engine/renderable/builder/resolvePowerPlantHd';

const roots: [BuildingHdFamily, string, number][] = [["NARADR", "soviet-naradr-authored/1", 2], ["NADEPT", "soviet-nadept-authored/1", 2], ["NAYARD", "soviet-nayard-authored/1", 2], ["NATECH", "soviet-natech-authored/1", 2], ["NANRCT", "soviet-nanrct-authored/1", 2], ["NACLON", "soviet-naclon-authored/1", 2], ["NAPSIS", "soviet-napsis-authored/1", 2], ["NALASR", "soviet-nalasr-authored/1", 2], ["NAFLAK", "soviet-naflak-authored/1", 2], ["TESLA", "soviet-tesla-authored/1", 2], ["NAIRON", "soviet-nairon-authored/1", 2], ["NAMISL", "soviet-namisl-authored/1", 2], ["NAWALL", "soviet-nawall-authored/1", 2]];
const report: any = { status: 'PASS_LOSSLESS_REMAINING_PACKS', families: {}, rawBytes: 0, gpuBytes: 0 };
for (const [family, root, density] of roots) {
    const binding = JSON.parse(await fs.readFile(`.local/hd-packs/${root}/family.json`, 'utf8'));
    const entries = [];
    for (const member of binding.members) {
        const directory = `.local/hd-packs/${member.packId}/${member.revision}`;
        const bytes = await fs.readFile(`${directory}/manifest.json`);
        const manifestHash = crypto.createHash('sha256').update(bytes).digest('hex');
        if (manifestHash !== member.sha256) throw Error('Accepted binding mismatch');
        const manifest = JSON.parse(bytes.toString());
        entries.push({ image: {}, manifest, manifestHash, source: { ...manifest.source, ...manifest.logical },
            read: async (file: string, hash: string, size: number) => {
                const bytes = await fs.readFile(`${directory}/${file}`);
                if (bytes.length !== size || crypto.createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Accepted page mismatch');
                const png = PNG.sync.read(bytes); return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
            } });
    }
    let allocated = 0, disposed = 0;
    const loaded = await resolvePowerPlantHd(entries, density, 2048, textures => {
        allocated += textures.length; textures.forEach(t => t.addEventListener('dispose', () => disposed++));
    }, family, 64 * 1024 * 1024, true);
    if (loaded.report.density !== density) throw Error(JSON.stringify(loaded.report));
    let mismatches = 0, channels = 0, rawBytes = 0;
    for (const entry of entries) {
        const pages = entry.manifest.variants.find((v: any) => v.density === density).pages;
        const override = loaded.overrides.get(entry.image)!;
        for (const [index, source] of pages.entries()) {
            const base = await entry.read(source.base, source.baseSha256, source.baseBytes);
            const data = await entry.read(source.data, source.dataSha256, source.dataBytes);
            rawBytes += base.width * base.height * 6;
            const page = override.pages[index];
            if (!page.tiles) continue;
            const map = page.tiles.map.image, color = page.base.image as any, remap = page.data.image as any;
            for (let y = 0; y < base.height; y++) for (let x = 0; x < base.width; x++) {
                const lookup = (Math.floor(y / 4) * map.width + Math.floor(x / 4)) * 4;
                const tile = map.data[lookup] + map.data[lookup + 1] * 256 + map.data[lookup + 2] * 65536;
                const pixel = (Math.floor(tile / (color.width / 4)) * 4 + y % 4) * color.width + tile % (color.width / 4) * 4 + x % 4;
                const original = (y * base.width + x) * 4;
                for (let c = 0; c < 4; c++) mismatches += Number(color.data[pixel * 4 + c] !== base.rgba[original + c]);
                for (let c = 0; c < 2; c++) mismatches += Number(remap.data[pixel * 2 + c] !== data.rgba[original + c]);
                channels += 6;
            }
        }
    }
    disposePowerPlantHd(loaded);
    if (mismatches || allocated !== disposed) throw Error(`${family}: mismatch or disposal leak`);
    report.families[family] = { density, rawBytes, gpuBytes: loaded.report.gpuBytes, channels, mismatches, allocated, disposed };
    report.rawBytes += rawBytes; report.gpuBytes += loaded.report.gpuBytes;
    console.log(family, report.families[family]);
}
await fs.writeFile('.artifacts/soviet-remaining/remaining-pack-pool-validation.json', JSON.stringify(report, null, 2) + '\n');
