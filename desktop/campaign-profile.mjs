import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import urbanContract from './environment-urban-hd-contract.json' with { type: 'json' };
import temperateContract from './environment-hd-contract.json' with { type: 'json' };
import snowContract from './environment-snow-hd-contract.json' with { type: 'json' };
import desertContract from './environment-desert-hd-contract.json' with { type: 'json' };
import newurbanContract from './environment-newurban-hd-contract.json' with { type: 'json' };
import lunarContract from './environment-lunar-hd-contract.json' with { type: 'json' };
import turretContracts from './building-turret-contracts.json' with { type: 'json' };

// A separate, bounded registration keeps task preparation out of accepted packs.
export async function validateCampaignResources(directory) {
    const root = path.resolve(directory);
    if (await fs.realpath(root) !== root) throw new Error('Campaign directory must be a real directory');
    const routes = new Map(), selections = new Map(), manifests = [];
    for (const edition of ['ra2', 'yr']) {
        const directory = path.join(root, edition);
        let missions;
        try { missions = await fs.readdir(directory, { withFileTypes: true }); }
        catch (error) { if (error.code === 'ENOENT') continue; throw error; }
        if (await fs.realpath(directory) !== directory || missions.length > 64) throw new Error('Unsafe campaign edition directory');
        for (const mission of missions) {
            if (!mission.isDirectory() || !/^(all|sov|trn)\d{2}[tsudl](md)?$/.test(mission.name)) continue;
            if ((edition === 'yr') !== mission.name.endsWith('md')) throw new Error('Campaign edition mismatch');
            const manifestFile = path.join(directory, mission.name, 'manifest.json');
            let info;
            try { info = await fs.stat(manifestFile); }
            catch (error) { if (error.code === 'ENOENT') continue; throw error; }
            if (await fs.realpath(manifestFile) !== manifestFile || !info.isFile() || info.size > 1024 * 1024) throw new Error('Unsafe campaign manifest');
            const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
            if (manifest.schemaVersion !== 1 || manifest.edition !== edition || manifest.mission !== mission.name + '.map'
                || !Array.isArray(manifest.files) || manifest.files.length > 256) throw new Error('Invalid campaign manifest');
            const seen = new Set();
            for (const entry of manifest.files) {
                const match = /^\/local-campaign\/(ra2|yr)\/((?:all|sov|trn)\d{2}[tsudl](?:md)?)\/([a-zA-Z0-9_-][a-zA-Z0-9_.-]*)$/.exec(entry.route);
                if (!match || match[1] !== edition || match[3] !== entry.name || entry.name === 'manifest.json'
                    || seen.has(entry.name) || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0
                    || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid campaign file identity');
                seen.add(entry.name);
                const file = path.join(root, match[1], match[2], entry.name);
                if (await fs.realpath(file) !== file || !(await fs.stat(file)).isFile()) throw new Error(`Unsafe campaign resource: ${entry.name}`);
                const bytes = await fs.readFile(file);
                if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`Campaign resource integrity failure: ${entry.name}`);
                if (routes.has(entry.route) && routes.get(entry.route) !== file) throw new Error('Duplicate campaign route');
                routes.set(entry.route, file);
            }
            const provenance = manifest.files.find(entry => entry.name === 'provenance.json');
            const map = manifest.files.find(entry => entry.name === manifest.mission);
            if (!provenance || provenance.sha256 !== manifest.provenanceDigest || !map
                || map.route !== `/local-campaign/${edition}/${mission.name}/${manifest.mission}`) throw new Error('Campaign source identity mismatch');
            selections.set(`/local-campaign/${edition}/${mission.name}/manifest.json`, manifest);
            manifests.push(manifest);
        }
    }
    if (!manifests.length) throw new Error('No prepared campaign missions');
    const catalog = new Map();
    for (const manifest of manifests) for (const entry of manifest.catalog ?? []) {
        const key = entry.edition + '/' + entry.filename;
        if (!catalog.has(key)) catalog.set(key, entry);
        else if (JSON.stringify(catalog.get(key)) !== JSON.stringify(entry)) throw new Error('Campaign catalog disagreement');
    }
    selections.set('/local-campaign/index.json', { schemaVersion: 1, catalog: [...catalog.values()],
        prepared: manifests.map(manifest => ({ edition: manifest.edition, mission: manifest.mission,
            sourceSha256: manifest.files.find(entry => entry.name === manifest.mission).sha256,
            provenanceDigest: manifest.provenanceDigest })) });
    return { root, routes, selections };
}

// Publish complete source-qualified campaign additions without cloning an
// accepted environment pack. A failed family leaves all prior routes intact.
export async function registerCampaignEnvironmentResources(profile, record = () => {}) {
    const contracts = { TEMPERATE: temperateContract, URBAN: urbanContract, SNOW: snowContract,
        DESERT: desertContract, NEWURBAN: newurbanContract, LUNAR: lunarContract };
    const extensions = [...profile.routes].filter(([route]) => /\/(memorial-family|environment-family-[a-z0-9-]+)\.json$/.test(route));
    for (const [bundleRoute, bundleFile] of extensions) try {
        const match = /^(\/local-campaign\/(ra2|yr)\/((?:all|sov|trn)\d{2}[tsudl](?:md)?)\/)\w[\w.-]*\.json$/.exec(bundleRoute);
        if (!match) throw new Error('Campaign environment extension path');
        const prefix = match[1], edition = match[2], mission = match[3] + '.map';
        const bundle = JSON.parse(await fs.readFile(bundleFile, 'utf8')), identity = bundle.identity;
        const theater = bundle.theater ?? (bundleRoute === '/local-campaign/ra2/sov01t/memorial-family.json' ? 'URBAN' : undefined);
        const contract = contracts[theater], selectionRoute = `/local-environment${theater === 'TEMPERATE' ? '' : '/' + theater?.toLowerCase()}/selection.json`;
        const selected = profile.selections.get(selectionRoute), declared = contract?.families[identity];
        if (!selected) continue;
        if (!declared || !declared.editions.includes(edition) || bundle.edition && bundle.edition !== edition
            || bundle.schema !== 'campaign-environment-extension-v1'
            || bundle.familyHash !== declared?.familyHash || !Array.isArray(bundle.members)
            || JSON.stringify(bundle.members.map(member => member.member).sort()) !== JSON.stringify(declared.members)) {
            throw new Error('Campaign environment family identity mismatch');
        }
        const mapFile = profile.routes.get(prefix + mission), scope = declared.sourceScope;
        if (!mapFile || bundle.mission && bundle.mission !== mission) throw new Error('Campaign environment source map');
        const sourceHash = createHash('sha256').update(await fs.readFile(mapFile)).digest('hex');
        if (!scope || !('campaignSources' in scope ? scope.campaignSources.some(source =>
            (source.edition ?? 'ra2') === edition && source.mission === mission && source.sha256 === sourceHash)
            : edition === 'ra2' && mission === 'sov01t.map' && scope.campaignSourceSha256s?.includes(sourceHash))) {
            throw new Error('Campaign environment mission/source scope');
        }
        const members = [], aliases = new Map();
        for (const member of bundle.members) {
            if (!/^[a-z0-9_-]+\.json$/.test(member.manifest) || !/^[a-f0-9]{64}$/.test(member.sha256)) throw new Error('Campaign environment manifest path');
            const filename = profile.routes.get(prefix + member.manifest);
            if (!filename) throw new Error('Missing campaign environment manifest');
            const bytes = await fs.readFile(filename);
            if (createHash('sha256').update(bytes).digest('hex') !== member.sha256) throw new Error('Campaign environment manifest hash');
            const manifest = JSON.parse(bytes), source = declared.sourceOverrides?.[member.member] ?? contract.sources[member.member];
            if (manifest.source?.member !== member.member || manifest.source.sha256 !== source?.sha256
                || manifest.source.theater !== theater || JSON.stringify(manifest.logical?.canvas) !== JSON.stringify(source.canvas)
                || manifest.logical?.frames?.length !== source.bodyFrames
                || JSON.stringify(manifest.variants.map(variant => variant.density).sort()) !== '[2,4]') throw new Error('Campaign environment source contract');
            const files = {};
            for (const variant of manifest.variants) for (const page of variant.pages) for (const role of ['base', 'data']) {
                const name = page[role];
                if (!/^[a-zA-Z0-9_-]+\.png$/.test(name) || !profile.routes.has(prefix + name) || files[name]
                    || !/^[a-zA-Z0-9_-]+$/.test(page.id)) throw new Error('Missing campaign environment page');
                const route = `/local-environment/${declared.familyHash}/${member.sha256}/${variant.density}/${page.id}/${role}.png`;
                const filename = profile.routes.get(prefix + name);
                if (aliases.has(route) || profile.routes.has(route) && profile.routes.get(route) !== filename) throw new Error('Campaign environment route collision');
                const payload = await fs.readFile(filename);
                if (payload.length !== page[role + 'Bytes']
                    || createHash('sha256').update(payload).digest('hex') !== page[role + 'Sha256']) {
                    throw new Error('Campaign environment page integrity');
                }
                aliases.set(route, filename);
                files[name] = route;
            }
            members.push({ member: member.member, sha256: member.sha256, manifest: prefix + member.manifest, files });
        }
        const next = { familyHash: declared.familyHash, members };
        if (selected.families[identity] && JSON.stringify(selected.families[identity]) !== JSON.stringify(next)) {
            throw new Error('Campaign environment family collision');
        }
        for (const [route, filename] of aliases) profile.routes.set(route, filename);
        profile.campaignEnvironmentRoutes = new Set([...(profile.campaignEnvironmentRoutes ?? []), ...aliases.keys()]);
        profile.selections.set(selectionRoute, { ...selected,
            families: { ...selected.families, [identity]: next },
            campaignExtension: { identity, revision: bundle.revision, familyHash: declared.familyHash } });
        record({ type: 'campaign-environment-registered', identity, revision: bundle.revision });
    } catch (error) { record({ type: 'campaign-environment-original', bundle: bundleRoute, reason: String(error) }); }
    await registerCampaignEnvironmentTurrets(profile, record);
}

export async function registerCampaignEnvironmentTurrets(profile, record = () => {}) {
    const contracts = { TEMPERATE: temperateContract, URBAN: urbanContract, SNOW: snowContract,
        DESERT: desertContract, NEWURBAN: newurbanContract, LUNAR: lunarContract };
    const extensions = [...profile.routes].filter(([route]) => /\/environment-turret-[a-z0-9-]+\.json$/.test(route));
    for (const [bundleRoute, bundleFile] of extensions) try {
        const match = /^(\/local-campaign\/yr\/((?:all|sov)\d{2}[tsudl]md)\/)environment-turret-[a-z0-9-]+\.json$/.exec(bundleRoute);
        if (!match) throw Error('Campaign turret extension path');
        const prefix = match[1], mission = match[2] + '.map';
        const bundle = JSON.parse(await fs.readFile(bundleFile, 'utf8'));
        const contract = contracts[bundle.theater], attachment = contract?.turretAttachments?.[bundle.identity];
        const selectionRoute = `/local-environment/${bundle.theater?.toLowerCase()}/selection.json`;
        const selected = profile.selections.get(selectionRoute), body = selected?.families[bundle.identity];
        const native = turretContracts[attachment?.family];
        if (!body || !native || bundle.schema !== 'campaign-environment-turret-v1'
            || bundle.family !== attachment.family || bundle.mission !== mission
            || JSON.stringify(Object.keys(bundle.variants ?? {}).sort()) !== '["2","4"]') throw Error('Campaign turret family identity');
        const mapFile = profile.routes.get(prefix + mission);
        const sourceHash = mapFile && createHash('sha256').update(await fs.readFile(mapFile)).digest('hex');
        if (!attachment.sourceScope.campaignSources?.some(source => source.edition === 'yr'
            && source.mission === mission && source.sha256 === sourceHash)) throw Error('Campaign turret map scope');
        const aliases = new Map(), turrets = {};
        for (const density of [2, 4]) {
            const binding = bundle.variants[density], pinned = attachment.variants[density];
            if (binding.sha256 !== pinned.sha256 || !/^[a-z0-9-]+\.json$/.test(binding.manifest)) throw Error('Campaign turret variant');
            const file = profile.routes.get(prefix + binding.manifest);
            if (!file) throw Error('Campaign turret manifest missing');
            const bytes = await fs.readFile(file);
            if (bytes.length > 32768 || createHash('sha256').update(bytes).digest('hex') !== pinned.sha256)
                throw Error('Campaign turret manifest integrity');
            const manifest = JSON.parse(bytes);
            if (manifest.schemaVersion !== 1 || manifest.family !== attachment.family || manifest.theater !== bundle.theater
                || manifest.density !== density || JSON.stringify(manifest.canvas) !== JSON.stringify(native.canvas)
                || JSON.stringify(manifest.offset) !== JSON.stringify(native.offset) || manifest.headings?.length !== 8
                || JSON.stringify(Object.keys(manifest.sources).sort()) !== JSON.stringify([...native.members].sort())
                || native.members.some(member => manifest.sources[member] !== attachment.sources[member])
                || manifest.palette?.member !== attachment.palette.member || manifest.palette?.sha256 !== attachment.palette.sha256)
                throw Error('Campaign turret source contract');
            const route = `/local-hd/${pinned.sha256}/turret/`;
            aliases.set(route + 'manifest.json', file);
            const [width, height] = native.canvas.map(value => value * density);
            for (const [index, heading] of [0, 45, 90, 135, 180, 225, 270, 315].entries()) {
                const entry = manifest.headings[index];
                if (entry.heading !== heading || entry.base !== `${heading}.png` || entry.mask !== `${heading}.mask`)
                    throw Error('Campaign turret heading');
                for (const role of ['base', 'mask']) {
                    const name = binding.files[entry[role]];
                    if (!/^[a-z0-9-]+\.(png|mask)$/.test(name)) throw Error('Campaign turret file path');
                    const file = profile.routes.get(prefix + name);
                    if (!file) throw Error('Campaign turret file missing');
                    const bytes = await fs.readFile(file);
                    if (bytes.length !== entry[role + 'Bytes']
                        || bytes.length > (role === 'base' ? 2 * 1024 * 1024 : width * height)
                        || createHash('sha256').update(bytes).digest('hex') !== entry[role + 'Sha256'])
                        throw Error('Campaign turret file integrity');
                    if (role === 'mask' && (bytes.length !== width * height || bytes.some(value => value !== 0 && value !== 255)))
                        throw Error('Campaign turret mask');
                    aliases.set(route + entry[role], file);
                }
            }
            turrets[density] = { sha256: pinned.sha256 };
        }
        for (const [route, file] of aliases) if (profile.routes.has(route) && profile.routes.get(route) !== file)
            throw Error('Campaign turret route collision');
        if (body.turrets && JSON.stringify(body.turrets) !== JSON.stringify(turrets)) throw Error('Campaign turret binding collision');
        for (const [route, file] of aliases) profile.routes.set(route, file);
        profile.campaignEnvironmentRoutes = new Set([...(profile.campaignEnvironmentRoutes ?? []), ...aliases.keys()]);
        profile.selections.set(selectionRoute, { ...selected, families: { ...selected.families,
            [bundle.identity]: { ...body, turrets } } });
        record({ type: 'campaign-environment-turret-registered', identity: bundle.identity, family: attachment.family });
    } catch (error) { record({ type: 'campaign-environment-turret-original', bundle: bundleRoute, reason: String(error) }); }
}
