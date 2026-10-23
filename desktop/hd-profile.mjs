import buildingCoverage from './soviet-building-coverage.json' with { type: 'json' };
import alliedCoverage from './allied-building-coverage.json' with { type: 'json' };
import yuriCoverage from './yuri-building-coverage.json' with { type: 'json' };
import alliedUnits from './allied-unit-contracts.json' with { type: 'json' };
import yuriUnits from './yuri-unit-contracts.json' with { type: 'json' };
import environmentUnits from './environment-hd-contract.json' with { type: 'json' };
import snowEnvironmentUnits from './environment-snow-hd-contract.json' with { type: 'json' };
import urbanEnvironmentUnits from './environment-urban-hd-contract.json' with { type: 'json' };
import turretContracts from './building-turret-contracts.json' with { type: 'json' };
import { registerUiResources } from './ui-profile.mjs';
import { registerTerrainResources } from './terrain-profile.mjs';
import { registerEnvironmentResources } from './environment-profile.mjs';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safeFile, validateHdPack } from './profile.mjs';
import { registerPreparedHdResources } from './prepared-hd.mjs';

// Accepted external pack identities. No artwork is copied into the application.
export const hdIdentities = {
    napowr: 'f27d15c2981eae71c4eae75346f2d9b4def95f741b0a8cdbffd682cb11d1db3a',
    conscript: 'ffe2bc12c03b3bdfe82c90d53a7200b423cc355a18e6ef6cbd94f17b79597dd0',
    powerPlant: 'da93684483e511a37011cf0413ac90be0ba2a96c9bbe04539baa5b529280b07d',
    rhino: '0776b72289f815bc16570353098e605b52276832c9fc95ef7349af088d617aa3',
};
export const powerPlantFamilyPaths = {
    gapowr: 'hd-packs/power-plant-authored/native-buildup-all-20261011-r8/family.json',
    napowr: 'hd-packs/soviet-power-plant-authored/native-buildup-infrastructure-r82-v3/family.json',
};
// Complete-family review candidates; representative acceptance is recorded in
// each manifest. These additions never replace any accepted resource path.
export const sovietBatchIdentities = {
    nahand: '129d61a001b4dcac89e7b01ff3bd7fa3e684a8829c03846243ac4f3cf93094f1',
    narefn: 'f031b4d498623c0f354bc97e381b13ce57bf7e0e5955a181a1d7a31f1fed427e',
    naweap: '63f319df17fa98b0b9239b55c3fffbddadbc97b1e708a0bc09d7f44f8905a85c',
    nacnst: '9e7322e123dac588a9851fc73b0977e6de74e0ae2e4ba20406db2a59e2918402',
    naradr: '97595f64740b2104af968b57b4f9153385e9916d3a37fdfae1bf1d6e0278a4e3',
    nadept: '96afd6cd9557e4be0ba017558fa2751059f72f0b5c5ac5e09f6eff61baea54ee',
    nayard: 'cd74d0d777e67413dae39c5a8e347de38b731425f0a356cef4cc5021ca1a8b74',
    natech: '6f051d8bfc1377866ea0ee0179ff3ca7e65634d8a5255086d6ee370b24835ec1',
    nanrct: 'f4c0803297d910d82945e806016ed24191f0681cb314c6f75851a73a40e72268',
    naclon: '81d18993d6faff21060679b0dce22cc1e184a9b48710b97bd334d8fa5b92ae5f',
    napsis: '9476477ba14ee8d1789e6243c590be191af8c2c8378303aeb625a6a834ed3959',
    nalasr: 'c8168dbf830e2a065d36f2b05ebfa26427c1b9f78847406adc683f2edcd648b1',
    naflak: '22e8af07992fdac94f99e70dbaf7c29351b17cb0fef1837af2a24bc5f9f49d85',
    tesla: 'f07c87070bf0855bb8e00140f5feb2c18b54d2ef77c7098dce5dbe422f3c3596',
    nairon: 'c943c27a8a3e7e7c2406d2f9361aa78089e3f7427ae62d58e6ebe54df09e89da',
    namisl: '6ffdc5fdac2cb9f66a6e29aa48957002896d30b70a16a817bc80e47004c8026a',
    nawall: '33041d52db6293e80890e378a08fc014935d807699fa926aa8f4f1fa27f0e353',
};
export const sovietBatchRevisions = { nahand: 'native-buildup-infrastructure-original-r85-v3', narefn: 'native-buildup-infrastructure-motion-r83-v1', naweap: 'native-buildup-soviet-components-r91-v1', nacnst: 'native-buildup-heavy-structure-r99-v1', naradr: 'native-buildup-infrastructure-motion-r83-v1', nadept: 'native-buildup-soviet-components-r91-v1', nayard: 'native-buildup-soviet-components-r91-v1', natech: 'native-buildup-soviet-components-r91-v1', nanrct: 'native-buildup-heavy-structure-r99-v1', naclon: 'native-buildup-final-coverage-r117-v8', napsis: 'native-buildup-final-coverage-r117-v8', nalasr: 'native-buildup-strategic-motion-r96-v1', naflak: 'native-buildup-soviet-defense-r92-v2', tesla: 'native-buildup-tesla-column-r94-v1', nairon: 'native-buildup-strategic-motion-r96-v1', namisl: 'native-buildup-strategic-motion-r96-v1', nawall: 'regen4x1' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const vxlUnitIdentities = {
    ...alliedUnits.vxl,
    ...yuriUnits.vxl,
    ...environmentUnits.vxl,
    ...snowEnvironmentUnits.vxl,
    ...urbanEnvironmentUnits.vxl,
    BORIS: { edition: 'yr', path: 'hd-packs/yr-soviet-boris-vxl/owner-r3/manifest.json', hash: '9886a08e99d141884b59e272bdde8c89033293c7eccdfbe6961a876ce2204e7a' },
    SCHP: { edition: 'yr', path: 'hd-packs/yr-soviet-schp-vxl/mount-r6/manifest.json', hash: '852c0661f770c427ddeca2b49823f77e981226feab3abdbb220d962ffbc83fa7' },
    DRED: { path: 'hd-packs/soviet-dred-vxl/owner-r3/manifest.json', hash: '63b20f0fef66a5bddf8869879ce05a50dc9f927554e24964fc55080480535157' },
    V3: { path: 'hd-packs/soviet-v3-vxl/owner-r3/manifest.json', hash: '2cb3eaff6dbad7ea64042636eaa984160bbc04b78e038e5175a0b8d223f4bd5f' },
    HARV: { path: 'hd-packs/soviet-harv-vxl/owner-r3/manifest.json', hash: 'be64b4adffdd84ca7bb61e5ca49f9b0b0cde90605267ef0c77b876a361284481' },
    APOC: { path: 'hd-packs/soviet-apoc-vxl/owner-r3/manifest.json', hash: '9f0d08ad6f67ec38679d36d3b3aab8d3d5ac8aecd618332291e8cbac0ecfc682' },
    HTK: { path: 'hd-packs/soviet-htk-vxl/owner-r3/manifest.json', hash: '83cb65389ffc700aa295ab4c891307672837c772671af9baeac2dca14016c2a2' },
    TTNK: { path: 'hd-packs/soviet-ttnk-vxl/owner-r3/manifest.json', hash: 'bac440f0b2b634e2795cd7c09fd7662565f48f997c8287c57d27ab37ca51c5ae' },
    SAPC: { path: 'hd-packs/soviet-sapc-vxl/owner-r3/manifest.json', hash: 'ee981f1ca23e3ee8e945e1d2cbeca7953306d53d7cf952b77eb14407b942c206' },
    SUB: { path: 'hd-packs/soviet-sub-vxl/owner-r3/manifest.json', hash: '4cfdb4fd857c714b7e3dd3847302e0330b22c90248eb1ed95182282fd7da1e76' },
    HYD: { path: 'hd-packs/soviet-hyd-vxl/owner-r3/manifest.json', hash: 'b467a6981af713b83ea90c9d404fda4147cf64366b8cb5d42b50392d56b99f93' },
    ZEP: { path: 'hd-packs/soviet-zep-vxl/owner-r3/manifest.json', hash: 'a22c10561699a50d58be38f7a02095f5911d5f08df2402897dffde2e6e3982a2' },
    SMCV: { path: 'hd-packs/soviet-smcv-vxl/owner-r3/manifest.json', hash: '0c93d425f9393b734c28f20dc019589029a73d21f506d5319a1d7069ee853328' },
    DTRUCK: { path: 'hd-packs/soviet-dtruck-vxl/owner-r3/manifest.json', hash: 'eba4572bc4d8cd575a9d668e218133c28fa82cbc6e403ebf81b0b4cbf0a858c5' },
};
export const sovietUnitIdentities = {
    LUNR: { edition: 'yr', familyPath: 'hd-packs/lunar-infantry-family/1/family.json',
        hash: '85a3f1b904063107edf63aa29a828794f965dc408e3434982fbb0a5281013afa' },
    BORIS: { edition: 'yr', familyPath: 'hd-packs/yr-soviet-boris-family/owner-r3/family.json',
        hash: '2bc4e330a2fe5e5c70974fec0d193d6bd0feaba0e263fa7ff3b3186b8723280f' },
    CCOMAND: { edition: 'yr', familyPath: 'hd-packs/yr-soviet-ccomand-family/owner-r3/family.json',
        hash: '9dba6abf7211cdf67e81aa2960a7a0d9dd5fcedf5e598fb4bd1dd31bbe471ec4' },
    PTROOP: { edition: 'yr', familyPath: 'hd-packs/yr-soviet-ptroop-family/owner-r3/family.json',
        hash: 'e9d3222d000743c72d7153feb8088c60154d86ad20d01a69389841cbad3e2ffe' },
    SCHP: { edition: 'yr', familyPath: 'hd-packs/yr-soviet-schp-family/mount-r6/family.json',
        hash: '1668a6475b3b73a4e989b8a0d9935e3717d639708c8e74aeaa3da47b0f38ce67' },
    SQD: { blockedReason: 'USER_REQUESTED_ORIGINAL: keep native swimming and grapple artwork', familyPath: 'hd-packs/soviet-sqd-family/1/family.json', hash: '5b91c94ca404c7e4e020bef188fc10e20206ba76e0c040a2122c2f36cb76b11e' },
    YURIPR: { familyPath: 'hd-packs/soviet-yuripr-family/1/family.json',
        blockedReason: 'UPSTREAM_GAMEPLAY_BLOCKED: Psi Wave kills its caster; resource review only',
        hash: 'b6c83e85f44879b3ceb7fe3a002056c384737376db7ffb43e9db918439a73aa8' },
    CIVAN: { familyPath: 'hd-packs/soviet-civan-family/owner-r3/family.json',
        hash: 'ce4b7b3e63a29d08f80ddc2e62b67a798eeaa43f7503b5b789cde7027a2846e2' },
    DESO: { familyPath: 'hd-packs/soviet-deso-family/owner-r3/family.json',
        hash: '26621527e2db3bf101c2f9004e507f0ebf8173112eb516bae1f62364abbac7e5' },
    TERROR: { familyPath: 'hd-packs/soviet-terror-family/owner-r3/family.json',
        hash: '5bf6f05959f569e92935f4eb7609aac9bd6939b07fe3f0fb2b8be37a4d1db13d' },
    YURI: { familyPath: 'hd-packs/soviet-yuri-family/owner-r3/family.json',
        hash: '730b894d0bf13baae40f438497fdf2685b4234929400a054f20d2c4ed72c5eed' },
    IVAN: { familyPath: 'hd-packs/soviet-ivan-family/owner-r3/family.json',
        hash: 'cdad47e0a3a0cb3719da98317991cb79fbbdc5dc1afa76a4e4c3ccc61b753762' },
    SHK: { familyPath: 'hd-packs/soviet-shk-family/owner-r3/family.json',
        hash: '3d57f6ad8e2d98649ff56dde55adbc60504b52399a2aed47d9a2dfaee9faa515' },
    FLAKT: { familyPath: 'hd-packs/soviet-flakt-family/owner-r3/family.json',
        hash: 'ddc9965b12098e9e906e9606c4fe9cd900631ec8feb64f9032580d24b7d20e5d' },
    DOG: { familyPath: 'hd-packs/soviet-dog-family/owner-r3/family.json',
        hash: '49fae0d4a56c08d9eb4a26c610c20ccbdf6fa5134eb7216caacc2e9746400b92' },
    DRON: { familyPath: 'hd-packs/soviet-dron-family/owner-r3/family.json',
        hash: 'ea25d9a2c735b0d1163532dba4caf4d28a307a3ef0ffc260a9ee721391bf49dd' },
    SENGINEER: { familyPath: 'hd-packs/soviet-sengineer-family/owner-r3/family.json',
        hash: '32c1feee54d370d8a70ea088b7ae3eedc11e65a5d946e1b93c99aacf99620aa9' },
};
export const unitIdentities = { ...sovietUnitIdentities, ...alliedUnits.shp };
async function pinnedFile(root, relative, hash, maxBytes) {
    const file = await safeFile(root, relative);
    if ((await fs.stat(file)).size > maxBytes) throw Error('Optional resource exceeds size limit');
    const bytes = await fs.readFile(file);
    if (digest(bytes) !== hash) throw Error('Optional resource identity mismatch');
    return { file, bytes };
}

export function expectedHdAvailabilityKeys() {
    return [...new Set([...Object.keys(hdIdentities), ...Object.keys(sovietBatchIdentities),
        ...[...Object.values(buildingCoverage), ...Object.values(alliedCoverage), ...Object.values(yuriCoverage)].map(entry => entry.selection),
        ...[...Object.keys(unitIdentities), ...Object.keys(vxlUnitIdentities).filter(id => !yuriUnits.shp[id])].map(id => `unit-${id.toLowerCase()}`),
        ...Object.values(yuriUnits.shp).map(entry => entry.selection),
        'sovietUnits'])].sort();
}
export async function registerHdResources(root, record = () => {}, { deferPageHashes = false } = {}) {
    const routes = new Map(), selections = new Map(), availability = {};
    const packOptions = { allowUnavailableVariants: true, deferPageHashes };
    const imageFile = async (relative, asset) => {
        if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > 32 * 1024 * 1024
            || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw Error('Invalid VXL resource proof');
        // Renderer loaders verify the declared SHA before decoding or publishing.
        // Startup still checks every declared path, size and manifest identity.
        if (deferPageHashes) return safeFile(root, relative, { bytes: asset.bytes });
        const loaded = await pinnedFile(root, relative, asset.sha256, 32 * 1024 * 1024);
        if (loaded.bytes.length !== asset.bytes) throw Error('VXL resource size mismatch');
        return loaded.file;
    };
    const install = (family, packs, allowedDensities = [4, 2]) => {
        const densities = allowedDensities.filter(d => packs.every(p => !p.unavailableVariants.includes(d)
            && p.manifest.variants.some(v => v.density === d)));
        availability[family] = densities.length ? (densities[0] === 4 ? 'HD available' : 'HD available at 2x') : 'Original fallback';
        return packs.map(pack => {
            const files = {};
            for (const variant of pack.manifest.variants.filter(v => allowedDensities.includes(v.density))) {
                const roles = variant.storage === 'lossless-four-pixel-pool-v1' ? ['base', 'data', 'map'] : ['base', 'data'];
                for (const page of variant.pages) for (const role of roles)
                    files[page[role]] = `/local-hd/${pack.sha256}/${variant.density}/${page.id}/${role}.png`;
            }
            for (const [route, file] of pack.routes) {
                if (route === `/local-hd/${pack.sha256}/manifest.json`
                    || allowedDensities.some(d => route.startsWith(`/local-hd/${pack.sha256}/${d}/`))) routes.set(route, file);
            }
            record({ type: 'hd-registered', family, hash: pack.sha256, unavailableVariants: pack.unavailableVariants });
            return { member: pack.manifest.source.member, sha256: pack.sha256, files };
        });
    };
    const attempt = async (family, fn) => {
        try { await fn(); }
        catch (error) { availability[family] = 'Original fallback'; record({ type: 'hd-unavailable', family, reason: error.message, code: error.code }); }
    };
    const prepareVxl = async (identity, entry) => {
        const { file, bytes } = await pinnedFile(root, entry.path, entry.hash, 1024 * 1024);
        const m = JSON.parse(bytes);
        if (m.identity !== identity || m.theater !== (entry.authoringTheater ?? 'TEMPERATE') || m.schema !== 'unit-vxl-family-v1'
            || m.density !== (entry.density ?? 4) || !m.parts.length)
            throw Error('VXL family identity mismatch');
        const pending = new Map([[`/local-vxl/${entry.hash}/manifest.json`, file]]);
        const directory = entry.path.slice(0, entry.path.lastIndexOf('/') + 1);
        for (const part of m.parts) for (const asset of Object.values(part.files)) {
            if (!/^[\w-]+\.png$/.test(asset.file)) throw Error('Invalid VXL resource filename');
            pending.set(`/local-vxl/${entry.hash}/${asset.file}`, await imageFile(directory + asset.file, asset));
        }
        return pending;
    };
    const prepareVxlVariants = async (identity, entry) => {
        if (!entry.variants) return { routes: await prepareVxl(identity, entry), densities: [entry.density ?? 4] };
        const pending = new Map(), densities = [];
        for (const density of [4, 2]) {
            const variant = entry.variants.find(v => v.density === density);
            if (!variant) continue;
            try {
                const complete = await prepareVxl(identity, { ...entry, ...variant });
                for (const [route, file] of complete) pending.set(route, file);
                densities.push(density);
            } catch (error) {
                record({ type: 'vxl-density-unavailable', family: identity, density, reason: error.message });
            }
        }
        if (!densities.length) throw Error('No complete VXL density');
        return { routes: pending, densities };
    };
    let availableUnits = 0, availableYrUnits = 0;
    for (const [identity, entry] of [...Object.entries(unitIdentities), ...Object.entries(yuriUnits.shp)]) await attempt(entry.selection ?? `unit-${identity.toLowerCase()}`, async () => {
        if (entry.blockedReason) throw Error(entry.blockedReason);
        const { bytes } = await pinnedFile(root, entry.familyPath, entry.hash, 16384);
        const family = JSON.parse(bytes);
        if (family.identity !== identity || family.theater !== 'TEMPERATE') throw Error('Unit family identity mismatch');
        const packs = [];
        for (const member of family.members) {
            const pack = await validateHdPack(root, member.packId, member.revision, packOptions);
            if (pack.sha256 !== member.sha256 || pack.manifest.source.member !== member.member
                || JSON.stringify(pack.manifest.rulesIdentities) !== JSON.stringify([identity])) throw Error('Unit member identity mismatch');
            packs.push(pack);
        }
        const key = entry.selection ?? `unit-${identity.toLowerCase()}`;
        const vxl = vxlUnitIdentities[identity];
        if (vxl && (family.requiredVxl?.sha256 !== vxl.hash || family.requiredVxl?.path !== vxl.path))
            throw Error('Incomplete mixed unit dependency');
        if (entry.sameDensity && JSON.stringify(family.requiredVxl?.variants) !== JSON.stringify(vxl?.variants))
            throw Error('Mixed unit density dependencies differ');
        if (!packs.length || ![4, 2].some(d => packs.every(p => !p.unavailableVariants.includes(d)
            && p.manifest.variants.some(v => v.density === d))))
            throw Error('No complete unit SHP density');
        const voxel = vxl ? await prepareVxlVariants(identity, vxl) : { routes: new Map(), densities: [4, 2] };
        const densities = entry.sameDensity ? voxel.densities.filter(d => packs.every(p => !p.unavailableVariants.includes(d)
            && p.manifest.variants.some(v => v.density === d))) : [4, 2];
        if (!densities.length) throw Error('No complete mixed unit density');
        const bindings = install(key, packs, densities);
        for (const [route, file] of voxel.routes) routes.set(route, file);
        selections.set(`/local-hd/${key}-selection.json`, { familyHash: entry.hash, rulesIdentity: identity, members: bindings });
        if (!alliedUnits.shp[identity] && !entry.selection && availability[key].startsWith('HD available'))
            entry.edition === 'yr' ? availableYrUnits++ : availableUnits++;
    });
    for (const [identity, entry] of Object.entries(vxlUnitIdentities)) await attempt(`unit-${identity.toLowerCase()}`, async () => {
        if (unitIdentities[identity] || yuriUnits.shp[identity]) return;
        const pending = await prepareVxlVariants(identity, entry);
        for (const [route, file] of pending.routes) routes.set(route, file);
        availability[`unit-${identity.toLowerCase()}`] = `HD available at ${pending.densities[0]}x`;
        if (!alliedUnits.vxl[identity] && !yuriUnits.vxl[identity] && !environmentUnits.vxl[identity]
            && !snowEnvironmentUnits.vxl?.[identity] && !urbanEnvironmentUnits.vxl?.[identity])
            entry.edition === 'yr' ? availableYrUnits++ : availableUnits++;
        record({ type: 'hd-registered', family: `unit-${identity.toLowerCase()}`, hash: entry.hash });
    });
    availability.sovietUnits = `${availableUnits} of 24 vanilla additions available; ${availableYrUnits} of 5 YR additions available, including campaign-only LUNR (source-matched theaters); others use Original.`;
    await attempt('conscript', async () => {
        const pack = await validateHdPack(root, 'conscript-authored', 'owner-r3', packOptions);
        if (pack.sha256 !== hdIdentities.conscript) throw Error('Unrecognized Conscript manifest');
        selections.set('/local-hd/selection.json', install('conscript', [pack])[0]);
    });
    await attempt('powerPlant', async () => {
        const { bytes } = await pinnedFile(root, powerPlantFamilyPaths.gapowr, hdIdentities.powerPlant, 16384);
        const family = JSON.parse(bytes);
        const packs = [];
        for (const entry of family.members) {
            const pack = await validateHdPack(root, entry.packId, entry.revision, packOptions);
            if (pack.sha256 !== entry.sha256 || pack.manifest.source.member !== entry.member
                || pack.manifest.candidateSha256 !== family.candidateSha256) throw Error('Building family identity mismatch');
            packs.push(pack);
        }
        selections.set('/local-hd/power-plant-selection.json', { theater: family.theater, members: install('powerPlant', packs) });
    });
    await attempt('napowr', async () => {
        const { bytes } = await pinnedFile(root, powerPlantFamilyPaths.napowr, hdIdentities.napowr, 16384);
        const family = JSON.parse(bytes);
        const packs = [];
        for (const entry of family.members) {
            const pack = await validateHdPack(root, entry.packId, entry.revision, packOptions);
            if (pack.sha256 !== entry.sha256 || pack.manifest.source.member !== entry.member
                || pack.manifest.candidateSha256 !== family.candidateSha256) throw Error('Building family identity mismatch');
            packs.push(pack);
        }
        selections.set('/local-hd/soviet-power-plant-selection.json', { theater: family.theater, members: install('napowr', packs) });
    });
    for (const [name, hash] of Object.entries(sovietBatchIdentities)) await attempt(name, async () => {
        const { bytes } = await pinnedFile(root, `hd-packs/soviet-${name}-authored/${sovietBatchRevisions[name]}/family.json`, hash, 16384);
        const family = JSON.parse(bytes);
        if (family.family !== name.toUpperCase() || family.theater !== 'TEMPERATE') throw Error('Soviet family mismatch');
        const packs = [];
        for (const entry of family.members) {
            const pack = await validateHdPack(root, entry.packId, entry.revision, packOptions);
            if (pack.sha256 !== entry.sha256 || pack.manifest.source.member !== entry.member
                || pack.manifest.candidateSha256 !== family.candidateSha256) throw Error('Soviet member identity mismatch');
            packs.push(pack);
        }
        let turret;
        const turretRoutes = new Map();
        if (['nalasr', 'naflak'].includes(name)) {
            if (!/^[a-f0-9]{64}$/.test(family.turret?.sha256)) throw Error('Missing complete turret binding');
            const prefix = `hd-packs/soviet-${name}-authored/${sovietBatchRevisions[name]}/turret/`;
            const manifest = await pinnedFile(root, `${prefix}manifest.json`, family.turret.sha256, 32768);
            const data = JSON.parse(manifest.bytes);
            if (data.family !== name.toUpperCase() || data.theater !== 'TEMPERATE' || data.headings?.length !== 8 || ![2, 4].includes(data.density)) throw Error('Turret family mismatch');
            const route = `/local-hd/${family.turret.sha256}/turret/`;
            turretRoutes.set(`${route}manifest.json`, manifest.file);
            for (const [i, heading] of [0, 45, 90, 135, 180, 225, 270, 315].entries()) {
                const entry = data.headings[i];
                if (entry.heading !== heading || entry.base !== `${heading}.png` || entry.mask !== `${heading}.mask`) throw Error('Turret heading mismatch');
                for (const [file, hash, limit] of [[entry.base, entry.baseSha256, 2 * 1024 * 1024], [entry.mask, entry.maskSha256, 80 * 90 * data.density * data.density]]) {
                    const verified = await pinnedFile(root, `${prefix}${file}`, hash, limit);
                    turretRoutes.set(route + file, verified.file);
                }
            }
            turret = { sha256: family.turret.sha256 };
        }
        const members = install(name, packs);
        for (const [route, file] of turretRoutes) routes.set(route, file);
        selections.set(`/local-hd/${name}-selection.json`, { theater: family.theater, members, turret });
    });
    for (const entry of [...Object.values(buildingCoverage), ...Object.values(alliedCoverage), ...Object.values(yuriCoverage)]) await attempt(entry.selection, async () => {
        const { bytes } = await pinnedFile(root, entry.familyPath, entry.familyHash, 16384);
        const family = JSON.parse(bytes);
        if (family.family !== entry.family || family.theater !== entry.theater
            || family.members?.length !== entry.members.length) throw Error('Coverage family mismatch');
        const packs = [];
        for (const [index, binding] of family.members.entries()) {
            const expected = entry.members[index];
            const pack = await validateHdPack(root, binding.packId, binding.revision, packOptions);
            const source = pack.manifest.source;
            if (pack.sha256 !== binding.sha256 || source.member !== expected.member
                || source.sha256 !== expected.sha256 || source.theater !== expected.theater
                || pack.manifest.logical.frames.length !== expected.frames
                || JSON.stringify(pack.manifest.logical.canvas) !== JSON.stringify(expected.canvas)) {
                throw Error('Coverage member identity mismatch');
            }
            packs.push(pack);
        }
        let turret = family.sharedTurretSelection
            ? selections.get(`/local-hd/${family.sharedTurretSelection}-selection.json`)?.turret : undefined;
        let turrets = family.sharedTurretSelection
            ? selections.get(`/local-hd/${family.sharedTurretSelection}-selection.json`)?.turrets : undefined;
        const turretRoutes = new Map();
        if (family.turrets && (JSON.stringify(Object.keys(family.turrets).sort()) !== '["2","4"]'
            || family.turret)) throw Error('Incomplete dual-density turret');
        for (const [variant, binding] of family.turrets ? Object.entries(family.turrets) : family.turret ? [['legacy', family.turret]] : []) {
            const contract = turretContracts[entry.family];
            const prefix = entry.familyPath.replace(/family\.json$/, variant === 'legacy' ? 'turret/' : `turrets/${variant}/`);
            if (!contract || binding.path !== prefix) throw Error('Invalid turret binding');
            const manifest = await pinnedFile(root, `${prefix}manifest.json`, binding.sha256, 32768);
            const data = JSON.parse(manifest.bytes);
            if (data.schemaVersion !== 1 || data.family !== entry.family || data.theater !== 'TEMPERATE'
                || ![2, 4].includes(data.density) || data.headings?.length !== 8
                || (variant !== 'legacy' && data.density !== Number(variant))
                || JSON.stringify(data.canvas) !== JSON.stringify(contract.canvas)
                || JSON.stringify(data.offset) !== JSON.stringify(contract.offset)
                || JSON.stringify(Object.keys(data.sources).sort()) !== JSON.stringify([...contract.members].sort())) {
                throw Error('Turret family contract mismatch');
            }
            const route = `/local-hd/${binding.sha256}/turret/`;
            turretRoutes.set(route + 'manifest.json', manifest.file);
            for (const [i, heading] of [0, 45, 90, 135, 180, 225, 270, 315].entries()) {
                const frame = data.headings[i];
                if (frame.heading !== heading || frame.base !== `${heading}.png` || frame.mask !== `${heading}.mask`) throw Error('Turret heading mismatch');
                for (const [file, hash, limit] of [[frame.base, frame.baseSha256, 2 * 1024 * 1024],
                    [frame.mask, frame.maskSha256, contract.canvas[0] * contract.canvas[1] * data.density * data.density]]) {
                    turretRoutes.set(route + file, (await pinnedFile(root, prefix + file, hash, limit)).file);
                }
            }
            if (binding.constructionCompletionFrame !== undefined
                && (entry.family !== 'GTGCAN' || binding.constructionCompletionFrame !== 11)) {
                throw Error('Invalid construction completion binding');
            }
            if (variant === 'legacy') turret = { sha256: binding.sha256,
                ...(binding.constructionCompletionFrame === undefined ? {} :
                    { constructionCompletionFrame: binding.constructionCompletionFrame }) };
            else turrets = { ...turrets, [variant]: { sha256: binding.sha256 } };
        }
        if (turretContracts[entry.family] && !turret && !turrets) throw Error('Missing complete turret');
        for (const [route, file] of turretRoutes) routes.set(route, file);
        selections.set(`/local-hd/${entry.selection}-selection.json`, {
            theater: entry.theater, members: install(entry.selection, packs), turret, turrets,
        });
    });
    await attempt('rhino', async () => {
        const prefix = 'hd-packs/rhino-authored/owner-r3/';
        const manifest = await pinnedFile(root, `${prefix}manifest.json`, hdIdentities.rhino, 16384);
        const data = JSON.parse(manifest.bytes);
        const pending = new Map([['/local-rhino/manifest.json', manifest.file]]);
        for (const part of ['body', 'turret']) for (const h of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const name = `${part}-${h}`, entry = data.parts[name];
            for (const [ext, hash, max] of [['png', entry.sha256, 2 * 1024 * 1024], ['mask', entry.maskSha256, 320 * 288]]) {
                const { file } = await pinnedFile(root, `${prefix}${name}.${ext}`, hash, max);
                pending.set(`/local-rhino/${name}.${ext}`, file);
            }
        }
        for (const [route, file] of pending) routes.set(route, file);
        availability.rhino = 'HD available';
        record({ type: 'hd-registered', family: 'rhino', hash: hdIdentities.rhino });
    });
    selections.set('/local-hd/availability.json', availability);
    // Isolated UI reviews can reuse read-only native/world inputs without copying archives.
    const uiRoot = process.env.RA2_UI_RESOURCE_ROOT ?? root;
    const ui = await registerUiResources(uiRoot,
        { review: process.env.RA2_UI_REVIEW === '1' });
    for (const [route, file] of ui.routes) routes.set(route, file);
    for (const [route, selection] of ui.selections) selections.set(route, selection);
    await registerPreparedHdResources(root, selections, routes, record);
    const terrain = await registerTerrainResources(root, record);
    for (const [route, file] of terrain.routes) routes.set(route, file);
    for (const [route, selection] of terrain.selections) selections.set(route, selection);
    const environment = await registerEnvironmentResources(root, record);
    for (const [route, file] of environment.routes) routes.set(route, file);
    for (const [route, selection] of environment.selections) selections.set(route, selection);
    return { routes, selections, availability, uiRoot };
}
