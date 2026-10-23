import catalog from '../../../../desktop/allied-unit-contracts.json';
import yuriCatalog from '../../../../desktop/yuri-unit-contracts.json';
import environmentCatalog from '../../../../desktop/environment-hd-contract.json';
import snowEnvironmentCatalog from '../../../../desktop/environment-snow-hd-contract.json';
import urbanEnvironmentCatalog from '../../../../desktop/environment-urban-hd-contract.json';

export type VxlUnitContract = { hash: string; members: string[]; edition?: 'yr'; density?: 2 | 4;
    authoringTheater?: 'TEMPERATE' | 'SNOW' | 'URBAN'; theaters?: string[];
    variants?: { hash: string; density: 2 | 4; path: string }[] };
const snowVxlFamilies = (snowEnvironmentCatalog as unknown as { vxl?: Record<string, VxlUnitContract> }).vxl ?? {};
const urbanVxlFamilies = (urbanEnvironmentCatalog as unknown as { vxl?: Record<string, VxlUnitContract> }).vxl ?? {};
export function vxlUnitAvailableInTheater(contract: VxlUnitContract, theater: string | undefined): boolean {
    return !contract.theaters || theater !== undefined && contract.theaters.includes(theater);
}
export const vxlUnitFamilies: Record<string, VxlUnitContract> = {
    ...catalog.vxl as Record<string, VxlUnitContract>,
    ...yuriCatalog.vxl as Record<string, VxlUnitContract>,
    ...environmentCatalog.vxl as Record<string, VxlUnitContract>,
    ...snowVxlFamilies,
    ...urbanVxlFamilies,
    BORIS: { edition: 'yr', hash: '9886a08e99d141884b59e272bdde8c89033293c7eccdfbe6961a876ce2204e7a', members: ['bpln.vxl'] },
    SCHP: {
        edition: 'yr', hash: '852c0661f770c427ddeca2b49823f77e981226feab3abdbb220d962ffbc83fa7',
        members: ['schp.vxl', 'schd.vxl', 'schdtur.vxl'],
    },
    DRED: {
        hash: '63b20f0fef66a5bddf8869879ce05a50dc9f927554e24964fc55080480535157',
        members: ['dred.vxl', 'dredwo.vxl', 'dmisl.vxl'],
    },
    V3: {
        hash: '2cb3eaff6dbad7ea64042636eaa984160bbc04b78e038e5175a0b8d223f4bd5f',
        members: ['v3.vxl', 'v3wo.vxl', 'v3rocket.vxl'],
    },
    HARV: {
        hash: 'be64b4adffdd84ca7bb61e5ca49f9b0b0cde90605267ef0c77b876a361284481',
        members: ['harv.vxl', 'horv.vxl', 'harvtur.vxl'],
    },
    ZEP: {
        hash: 'a22c10561699a50d58be38f7a02095f5911d5f08df2402897dffde2e6e3982a2',
        members: ['zep.vxl'],
    },
    HYD: {
        hash: 'b467a6981af713b83ea90c9d404fda4147cf64366b8cb5d42b50392d56b99f93',
        members: ['hyd.vxl'],
    },
    SUB: {
        hash: '4cfdb4fd857c714b7e3dd3847302e0330b22c90248eb1ed95182282fd7da1e76',
        members: ['sub.vxl'],
    },
    SAPC: {
        hash: 'ee981f1ca23e3ee8e945e1d2cbeca7953306d53d7cf952b77eb14407b942c206',
        members: ['trs.vxl'],
    },
    TTNK: {
        hash: 'bac440f0b2b634e2795cd7c09fd7662565f48f997c8287c57d27ab37ca51c5ae',
        members: ['ttnk.vxl', 'ttnktur.vxl'],
    },
    HTK: {
        hash: '83cb65389ffc700aa295ab4c891307672837c772671af9baeac2dca14016c2a2',
        members: ['htk.vxl', 'htktur.vxl', 'htkbarl.vxl'],
    },
    APOC: {
        hash: '9f0d08ad6f67ec38679d36d3b3aab8d3d5ac8aecd618332291e8cbac0ecfc682',
        members: ['mtnk.vxl', 'mtnktur.vxl', 'mtnkbarl.vxl'],
    },
    SMCV: {
        hash: '0c93d425f9393b734c28f20dc019589029a73d21f506d5319a1d7069ee853328',
        members: ['smcv.vxl'],
    },
    DTRUCK: {
        hash: 'eba4572bc4d8cd575a9d668e218133c28fa82cbc6e403ebf81b0b4cbf0a858c5',
        members: ['trucka.vxl'],
    },
};
