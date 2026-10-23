import buildingCoverage from './soviet-building-coverage.json' with { type: 'json' };
import alliedCoverage from './allied-building-coverage.json' with { type: 'json' };
import yuriCoverage from './yuri-building-coverage.json' with { type: 'json' };
import constructionStorageSources from './construction-storage-sources.json' with { type: 'json' };
import fs from 'node:fs/promises';
import alliedUnits from './allied-unit-contracts.json' with { type: 'json' };
import yuriUnits from './yuri-unit-contracts.json' with { type: 'json' };
import path from 'node:path';
import { createHash } from 'node:crypto';

export const coreNames = ['ra2.mix', 'language.mix', 'multi.mix'];
const support = {
    'general.csf': '66b46690dfb475fb6a0323085eb4c94fbfb35a4dd490ba7d8359d34898ebec6c',
    'ra2cd.mix': '79626e434f8650fb8a47141ff63382636cf29114b0b2779316aff4ffed39da66',
};
export async function safeFile(root, relative, { bytes, maxBytes } = {}) {
    const target = path.resolve(root, relative);
    const rel = path.relative(root, target);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path outside registered profile');
    const [canonical, info] = await Promise.all([fs.realpath(target), fs.stat(target)]);
    if (canonical !== target || !info.isFile()) throw new Error('Unsafe local file');
    if ((bytes !== undefined && info.size !== bytes) || (maxBytes !== undefined && info.size > maxBytes))
        throw new Error('Local resource size mismatch');
    return target;
}
async function checkedFile(root, relative, entry, deferHash = false) {
    if (!entry || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !/^[a-f0-9]{64}$/.test(entry.sha256))
        throw new Error('Invalid local resource identity');
    const file = await safeFile(root, relative, { bytes: entry.bytes });
    if (deferHash) return file;
    const bytes = await fs.readFile(file);
    if (!entry || bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
        throw new Error(`Local resource integrity failure: ${relative}`);
    }
    return file;
}
export async function validateProfile(directory) {
    const root = path.resolve(directory);
    if (await fs.realpath(root) !== root) throw new Error('Select a real directory, not a symlink');
    const raw = JSON.parse(await fs.readFile(await safeFile(root, 'ra2-core-manifest.json'), 'utf8'));
    if (raw.schemaVersion !== 1 || raw.files?.length !== 3) throw new Error('Invalid RA2 core manifest');
    const routes = new Map();
    const checked = new Map();
    const check = (relative, entry) => {
        const key = `${relative}/${entry?.bytes}/${entry?.sha256}`;
        if (!checked.has(key)) checked.set(key, checkedFile(root, relative, entry));
        return checked.get(key);
    };
    const files = [];
    for (const name of coreNames) {
        const entry = raw.files.find(e => e.virtualName === name);
        if (entry?.validation !== 'structural-pass') throw new Error(`Unvalidated core archive: ${name}`);
        routes.set(`/local-assets/${name}`, await check(`assets/ra2/${name}`, entry));
        files.push({ virtualName: name, bytes: entry.bytes, sha256: entry.sha256, validation: entry.validation });
    }
    const supportManifest = JSON.parse(await fs.readFile(await safeFile(root, 'upstream-support/manifest.json'), 'utf8'));
    for (const [name, sha256] of Object.entries(support)) {
        const entry = supportManifest.find(e => path.posix.basename(e.original) === name);
        if (entry?.sha256 !== sha256 || entry?.commit !== '898d89188542a3028a232031ce1a0bdc7c605b6f') {
            throw new Error(`Required pinned support missing: ${name}`);
        }
        routes.set(`/local-support/${name}`, await check(`upstream-support/${name}`, entry));
    }
    const selections = new Map();
    let yr;
    try {
        yr = JSON.parse(await fs.readFile(await safeFile(root, 'yr-core-manifest.json'), 'utf8'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (yr) {
        const names = ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix', ...coreNames];
        if (yr.schemaVersion !== 1 || yr.edition !== 'yr' || yr.files?.length !== names.length) throw new Error('Invalid expansion manifest');
        const entries = [];
        for (const name of names) {
            const entry = yr.files.find(e => e.virtualName === name);
            if (entry?.validation !== 'structural-pass') throw new Error(`Unvalidated expansion archive: ${name}`);
            const folder = coreNames.includes(name) ? 'ra2' : 'yr';
            routes.set(`/local-assets/yr/${name}`, await check(`assets/${folder}/${name}`, entry));
            entries.push({ virtualName: name, bytes: entry.bytes, sha256: entry.sha256, validation: entry.validation });
        }
        selections.set('/local-assets/yr/manifest.json', { schemaVersion: 1, edition: 'yr', files: entries });
    }
    return { root, routes, selections, manifest: { schemaVersion: 1, files } };
}

// Explicit M1.1 diagnostic selection; never discovered by directory order.
export async function validateHdPack(directory, packId, revision, { allowUnavailableVariants = false, deferPageHashes = false } = {}) {
    if (!/^[a-z0-9-]+$/.test(packId) || !/^[a-zA-Z0-9.-]+$/.test(revision)
        || revision === '.' || revision === '..') throw new Error('Invalid HD pack identity');
    const root = path.resolve(directory);
    if (await fs.realpath(root) !== root) throw new Error('HD profile must be a real directory');
    const prefix = `hd-packs/${packId}/${revision}`;
    const manifestPath = await safeFile(root, `${prefix}/manifest.json`);
    if ((await fs.stat(manifestPath)).size > 2 * 1024 * 1024) throw new Error('HD manifest too large');
    const bytes = await fs.readFile(manifestPath);
    const manifest = JSON.parse(bytes.toString('utf8'));
    if (manifest.schemaVersion !== 2 || manifest.packId !== packId || manifest.packRevision !== revision
        || !([...Object.values(buildingCoverage), ...Object.values(alliedCoverage), ...Object.values(yuriCoverage)].some(f => f.members.some(m => m.member === manifest.source?.member
            && m.sha256 === manifest.source?.sha256 && m.theater === manifest.source?.theater))
            || (manifest.source?.theater === 'TEMPERATE' && [...Object.values(alliedUnits.shp), ...Object.values(yuriUnits.shp)].some(family =>
                family.members.some(member => member.member === manifest.source?.member
                    && member.sourceHash === manifest.source?.sha256)))
            || manifest.source?.member === 'cons.shp' || (manifest.source?.theater === 'TEMPERATE'
            && ['lunr.shp', 'boris.shp', 'ccomand.shp', 'ptroop.shp', 'schpdepl.shp', 'sqd.shp', 'sqdg.shp', 'dron.shp', 'dronp.shp', 'engineer.shp', 'dog.shp', 'dogp.shp', 'flakt.shp', 'shk.shp', 'ivan.shp', 'civan.shp', 'yuripr.shp', 'yuri.shp', 'trst.shp', 'deso.shp'].includes(manifest.source?.member)
            && ({ 'ccomand.shp': '5aba156dbbf64e84b794a2659216086566caf113cdeab3c1e414bc09cfb4549a', 'ptroop.shp': 'a0344e19daceed8ae1642a58eab79a9dea20829f272e70fe0650b3f781e937ee', 'boris.shp': '00c67236fb55c3992d3bd0ab55279adc058b83aa4105f5cd095ae8b9441db02e', 'schpdepl.shp': 'aaf691e3ba92bb071003005da69ebf02402ab727fb6b2f1d95b9c0050802250a',
                'sqd.shp': 'dcbac9af11d7d13be98de775ab23deff04116e5d9cc2920887930db2ae6835d2', 'sqdg.shp': 'f75be15eb3b2d63c98966a8787a218aca3b6f975c6d1cc0c1127052835ae144c', 'dron.shp': 'c5d2a3a0b58c664bd5d8cbf033f865588224e6888552c83ec4b44f2b32dd2e94',
                'dronp.shp': 'ce9a848c52f36abe8f873c6c3efe421373c0cde3f304090a03c3188ecadff161',
                'engineer.shp': 'f8eb0dc0156a877028ac2ed57bf2e71a9445ffcb6ef6a4caf3b0dbb7b111834c',
                'dog.shp': '7fd747a5d874c8a3613fae87eb8ef438e9b31778c32150830afcd7a992383ff7',
                'dogp.shp': '9571109f20bddd2ba051bf3ce0eae5071ddfa40275996f631235cc025f18d855',
                'yuripr.shp': '1c73fa3a7bdce534f4c4d3a6470a974490dccad18ee2da7bca01177aa1098ef9',
                'lunr.shp': 'f77d9f32a5d48ca1ec983f1be83059f46cb26c0038636e1616ae407de2b35633',
                'civan.shp': '48569d57cf5a77fe611a000ea8db14992160d0515d4e4b9bf22c03198c010523',
                'deso.shp': '7f157a5089a3ec822ae73eb951993a410c8fabc0d1fa839ddb0eed255aabfcc4',
                'trst.shp': '96a6ff78111593f5435116a0b3f36c1e9d740c72421ca62419282225cacd78db',
                'yuri.shp': '8d5964c758cb6e51699ec0118a323c9ab096ac37df060bf3024ecbac0bfd9a3f',
                'ivan.shp': '4a78fb72494d380cdd34fa89bebf7f4c6c2270724202c3b6811340af66bc7959',
                'shk.shp': '7d46dcfc1509ce6684c89782be388f7a438f8946bd187300bd0490a48f8f4122',
                'flakt.shp': '2be57b9db70eefa6630f9c19abfb96715cc3da58de57a6c8fef08523851e64d9' })[manifest.source?.member] === manifest.source?.sha256) || (manifest.source?.theater === 'TEMPERATE'
            && ['ggpowr.shp', 'ggpowr_a.shp', 'gtpowrmk.shp', 'ngpowr.shp', 'ngpowr_a.shp', 'ntpowrmk.shp',
                'nghand.shp', 'nthandmk.shp', 'ngrefn.shp', 'ngrefnbb.shp', 'ngrefnl1.shp', 'ngrefnl2.shp',
                'ngrefnl3.shp', 'ngrefnl4.shp', 'ngrefnor.shp', 'ntrefnmk.shp', 'ngweap.shp', 'ngweapbb.shp',
                'ngweap_a.shp', 'ngweap_1.shp', 'ngweap_2.shp', 'ngweap_3.shp', 'ngweap_4.shp', 'ntweapmk.shp',
                'ngcnst.shp', 'ngcnst_a.shp', 'ngcnst_b.shp', 'ngcnst_c.shp', 'ntcnstmk.shp',
                'ngradr.shp', 'ngradr_a.shp', 'ntradrmk.shp', 'ngdept.shp', 'ngdeptbb.shp',
                'ngdept_b.shp', 'ngdept_c.shp', 'ntdeptmk.shp', 'ngyard.shp', 'ngyard_a.shp',
                'ngyard_d.shp', 'ngyard_b.shp', 'ngyard_c.shp', 'ngyard_s.shp', 'ntyardmk.shp',
                'ngtech.shp', 'nttechmk.shp', 'ngnrct.shp', 'ngnrct_a.shp', 'ntnrctmk.shp',
                'ngclon.shp', 'ngclon_a.shp', 'ntclonmk.shp', 'ngpsis.shp', 'ngpsis_a.shp',
                'ntpsismk.shp', 'nglasr.shp', 'ntlasrmk.shp', 'ngflak.shp', 'ntflakmk.shp',
                'ngtsla.shp', 'ngtsla_a.shp', 'ngtsla_b.shp', 'nttslamk.shp', 'ngiron.shp',
                'ngiron_a.shp', 'ngiron_f.shp', 'ngiron_h.shp', 'ntironmk.shp', 'ngmisl.shp',
                'ngmisl_e.shp', 'ngmisl_f.shp', 'ngmisl_g.shp', 'ngmisl_h.shp', 'ntmislmk.shp',
                'ntwall.shp'].includes(manifest.source?.member)))
        || !Array.isArray(manifest.variants)
        || manifest.variants.length > 2) throw new Error('Invalid HD pack manifest');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const routes = new Map([[`/local-hd/${sha256}/manifest.json`, manifestPath]]);
    const densities = new Set();
    const unavailableVariants = [];
    let encodedBytes = 0;
    for (const variant of manifest.variants) {
        const serialized = variant.storage === 'lossless-four-pixel-pool-v1';
        const constructionStorage = manifest.source.kind === 'resolved-shp-member'
            && manifest.source.member.endsWith('mk.shp')
            && constructionStorageSources.entries.some(entry => entry.member === manifest.source.member
                && entry.sha256 === manifest.source.sha256 && entry.theater === manifest.source.theater
                && JSON.stringify(entry.canvas) === JSON.stringify(manifest.logical.canvas)
                && entry.frames === manifest.logical.frames.length);
        const yuriStorage = manifest.packId?.startsWith('yuri-coverage-')
            && Object.values(yuriCoverage).some(entry => entry.members.some(member => member.sha256 === manifest.source.sha256));
        if (variant.storage !== undefined && (!serialized || (!yuriStorage && !constructionStorage)))
            throw new Error('Unsupported HD storage');
        if (![2, 4].includes(variant.density) || densities.has(variant.density)
            || !Array.isArray(variant.pages) || !variant.pages.length || variant.pages.length > (variant.density === 4 && manifest.source.member === 'ngyard_d.shp' ? 16 : 8)) throw new Error('Invalid HD variant');
        densities.add(variant.density);
        const ids = new Set();
        const variantRoutes = new Map();
        let unavailable = false;
        for (const page of variant.pages) {
            if (!/^[a-zA-Z0-9_-]+$/.test(page.id) || ids.has(page.id)) throw new Error('Invalid HD page');
            ids.add(page.id);
            for (const role of serialized ? ['base', 'data', 'map'] : ['base', 'data']) {
                if (typeof page[role] !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/.test(page[role])
                    || !/^[a-f0-9]{64}$/.test(page[`${role}Sha256`])
                    || !Number.isSafeInteger(page[`${role}Bytes`]) || page[`${role}Bytes`] <= 0
                    || page[`${role}Bytes`] > 32 * 1024 * 1024) throw new Error('Invalid HD file entry');
                encodedBytes += page[`${role}Bytes`];
                if (encodedBytes > 128 * 1024 * 1024) throw new Error('HD encoded file budget exceeded');
                try {
                    const file = await checkedFile(root, `${prefix}/${page[role]}`,
                        { bytes: page[`${role}Bytes`], sha256: page[`${role}Sha256`] }, deferPageHashes);
                    variantRoutes.set(`/local-hd/${sha256}/${variant.density}/${page.id}/${role}.png`, file);
                } catch (error) {
                    if (!allowUnavailableVariants) throw error;
                    unavailable = true;
                }
            }
        }
        if (unavailable) unavailableVariants.push(variant.density);
        else for (const [route, file] of variantRoutes) routes.set(route, file);
    }
    return { root, routes, manifest, sha256, unavailableVariants };
}
