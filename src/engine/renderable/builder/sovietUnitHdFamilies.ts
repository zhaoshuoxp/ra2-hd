import type { HdSource } from './resolveHdSprite';

type ProjectileBinding = { weapon: string; projectile: string; member: string };

// Each family includes every native visible representation of the unit.
export const sovietUnitHdFamilies = {
    LUNR: {
        identity: 'LUNR', edition: 'yr',
        familyHash: '85a3f1b904063107edf63aa29a828794f965dc408e3434982fbb0a5281013afa',
        members: [
            { member: 'lunr.shp', frames: 435, totalFrames: 870, canvas: [94, 116],
                sourceHash: 'f77d9f32a5d48ca1ec983f1be83059f46cb26c0038636e1616ae407de2b35633',
                manifestHash: '1fa4038cfd853bb0d46a5cfbb63ad168e4b233de5437446eb034e42ce2901477' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    BORIS: {
        identity: 'BORIS', edition: 'yr',
        familyHash: '2bc4e330a2fe5e5c70974fec0d193d6bd0feaba0e263fa7ff3b3186b8723280f',
        members: [
            { member: 'boris.shp', frames: 409, totalFrames: 818, canvas: [98, 88],
                sourceHash: '00c67236fb55c3992d3bd0ab55279adc058b83aa4105f5cd095ae8b9441db02e',
                manifestHash: '88f2148b2a274de1e5bfd3ea57532b56e3b867d4c10a4763d1f477d41a1b33b4' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    CCOMAND: {
        identity: 'CCOMAND', edition: 'yr',
        familyHash: '9dba6abf7211cdf67e81aa2960a7a0d9dd5fcedf5e598fb4bd1dd31bbe471ec4',
        members: [
            { member: 'ccomand.shp', frames: 348, totalFrames: 696, canvas: [118, 72],
                sourceHash: '5aba156dbbf64e84b794a2659216086566caf113cdeab3c1e414bc09cfb4549a',
                manifestHash: 'e3cb9f37cb991c025418e460928d5cf6476aab15cf325f61c57661c9a2accbbf' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    PTROOP: {
        identity: 'PTROOP', edition: 'yr',
        familyHash: 'e9d3222d000743c72d7153feb8088c60154d86ad20d01a69389841cbad3e2ffe',
        members: [
            { member: 'ptroop.shp', frames: 315, totalFrames: 630, canvas: [56, 70],
                sourceHash: 'a0344e19daceed8ae1642a58eab79a9dea20829f272e70fe0650b3f781e937ee',
                manifestHash: '9876f76e879cbcca7b4a7a97f711e66013a775c6c4b48047dc3420c7291964c2' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    SCHP: {
        identity: 'SCHP', edition: 'yr',
        familyHash: '1668a6475b3b73a4e989b8a0d9935e3717d639708c8e74aeaa3da47b0f38ce67',
        members: [
            { member: 'schpdepl.shp', frames: 11, totalFrames: 22, canvas: [154, 118],
                sourceHash: 'aaf691e3ba92bb071003005da69ebf02402ab727fb6b2f1d95b9c0050802250a',
                manifestHash: 'fb7d4e9ef5d08d73440dfcb2d66198be153cfd9fde83716fb06f0516b20d2686' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    SQD: {
        identity: 'SQD',
        blockedReason: 'USER_REQUESTED_ORIGINAL: keep native swimming and grapple artwork',
        familyHash: '5b91c94ca404c7e4e020bef188fc10e20206ba76e0c040a2122c2f36cb76b11e',
        members: [
            { member: 'sqd.shp', frames: 296, totalFrames: 296, canvas: [198, 198],
                sourceHash: 'dcbac9af11d7d13be98de775ab23deff04116e5d9cc2920887930db2ae6835d2',
                manifestHash: '7e3b48113fe8c91ac41c5ee0596bd166b2ee092ac07bfb587d053f58fdcfbd4e' },
            { member: 'sqdg.shp', frames: 240, totalFrames: 240, canvas: [196, 138],
                sourceHash: 'f75be15eb3b2d63c98966a8787a218aca3b6f975c6d1cc0c1127052835ae144c',
                manifestHash: '10b966509bbcc270b61337e4ddeca210029245474d1e2dbf25731119e5432d47' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    YURIPR: {
        identity: 'YURIPR',
        blockedReason: 'UPSTREAM_GAMEPLAY_BLOCKED: Psi Wave kills its caster; resource review only',
        familyHash: 'b6c83e85f44879b3ceb7fe3a002056c384737376db7ffb43e9db918439a73aa8',
        members: [
            { member: 'yuripr.shp', frames: 315, totalFrames: 630, canvas: [82, 86],
                sourceHash: '1c73fa3a7bdce534f4c4d3a6470a974490dccad18ee2da7bca01177aa1098ef9',
                manifestHash: '067959d98968bc6a29024e30e75e2430de76ecd7ab6ffc5032062430e874fb3a' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    DESO: {
        identity: 'DESO',
        familyHash: '26621527e2db3bf101c2f9004e507f0ebf8173112eb516bae1f62364abbac7e5',
        members: [
            { member: 'deso.shp', frames: 322, totalFrames: 644, canvas: [126, 88],
                sourceHash: '7f157a5089a3ec822ae73eb951993a410c8fabc0d1fa839ddb0eed255aabfcc4',
                manifestHash: 'e95c364e9672f289c0250da14d204a5e6c8759de87bb50731a4eae3eb33be296' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    TERROR: {
        identity: 'TERROR',
        familyHash: '5bf6f05959f569e92935f4eb7609aac9bd6939b07fe3f0fb2b8be37a4d1db13d',
        members: [
            { member: 'trst.shp', frames: 188, totalFrames: 376, canvas: [78, 76],
                sourceHash: '96a6ff78111593f5435116a0b3f36c1e9d740c72421ca62419282225cacd78db',
                manifestHash: 'a16b591cf0387797088f54bc95d3bea1e2a5ee2c35cf43bb4edaf545cac751cf' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    YURI: {
        identity: 'YURI',
        familyHash: '730b894d0bf13baae40f438497fdf2685b4234929400a054f20d2c4ed72c5eed',
        members: [
            { member: 'yuri.shp', frames: 316, totalFrames: 632, canvas: [46, 68],
                sourceHash: '8d5964c758cb6e51699ec0118a323c9ab096ac37df060bf3024ecbac0bfd9a3f',
                manifestHash: '7da93c3ee06384eeaa89a67c5f8b92dfcf9f4df648d1ad8143152fc0980fc692' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    CIVAN: {
        identity: 'CIVAN',
        familyHash: 'ce4b7b3e63a29d08f80ddc2e62b67a798eeaa43f7503b5b789cde7027a2846e2',
        members: [
            { member: 'civan.shp', frames: 267, totalFrames: 534, canvas: [104, 88],
                sourceHash: '48569d57cf5a77fe611a000ea8db14992160d0515d4e4b9bf22c03198c010523',
                manifestHash: '48375110c9bb1ddcce8170deb6b6961fb47271b008bd0aa820fd67e1beb4fee9' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    IVAN: {
        identity: 'IVAN',
        familyHash: 'cdad47e0a3a0cb3719da98317991cb79fbbdc5dc1afa76a4e4c3ccc61b753762',
        members: [
            { member: 'ivan.shp', frames: 267, totalFrames: 534, canvas: [100, 88],
                sourceHash: '4a78fb72494d380cdd34fa89bebf7f4c6c2270724202c3b6811340af66bc7959',
                manifestHash: '81dbf03ea5cab39ce03e82b35fbfd8dcae9f7c6742c2b865fa9de71761411428' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    SHK: {
        identity: 'SHK',
        familyHash: '3d57f6ad8e2d98649ff56dde55adbc60504b52399a2aed47d9a2dfaee9faa515',
        members: [
            { member: 'shk.shp', frames: 301, totalFrames: 602, canvas: [66, 76],
                sourceHash: '7d46dcfc1509ce6684c89782be388f7a438f8946bd187300bd0490a48f8f4122',
                manifestHash: 'f505362529de871034c113dd19a28ba840eaf0513888d5388d724419a833827b' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    FLAKT: {
        identity: 'FLAKT',
        familyHash: 'ddc9965b12098e9e906e9606c4fe9cd900631ec8feb64f9032580d24b7d20e5d',
        members: [
            { member: 'flakt.shp', frames: 301, totalFrames: 602, canvas: [98, 94],
                sourceHash: '2be57b9db70eefa6630f9c19abfb96715cc3da58de57a6c8fef08523851e64d9',
                manifestHash: '675fb5858f9c2cfcfd4db08bd56e1d25a50acb0d27cddef219118c9814545301' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    DRON: {
        identity: 'DRON',
        familyHash: 'ea25d9a2c735b0d1163532dba4caf4d28a307a3ef0ffc260a9ee721391bf49dd',
        members: [
            { member: 'dron.shp', frames: 88, totalFrames: 176, canvas: [77, 77],
                sourceHash: 'c5d2a3a0b58c664bd5d8cbf033f865588224e6888552c83ec4b44f2b32dd2e94',
                manifestHash: '145629576ddb0235aad22b2d6100776d193462d8411c4f75525a4866e9226874' },
            { member: 'dronp.shp', frames: 32, totalFrames: 64, canvas: [77, 77],
                sourceHash: 'ce9a848c52f36abe8f873c6c3efe421373c0cde3f304090a03c3188ecadff161',
                manifestHash: 'c4f21d782a134e260062aac8553313cd79562e2333a11e654e754f119e63ba48' },
        ],
        projectiles: [{ weapon: 'DroneJump', projectile: 'JUMP', member: 'dronp.shp' }],
    },
    SENGINEER: {
        identity: 'SENGINEER',
        familyHash: '32c1feee54d370d8a70ea088b7ae3eedc11e65a5d946e1b93c99aacf99620aa9',
        members: [
            { member: 'engineer.shp', frames: 253, totalFrames: 506, canvas: [76, 80],
                sourceHash: 'f8eb0dc0156a877028ac2ed57bf2e71a9445ffcb6ef6a4caf3b0dbb7b111834c',
                manifestHash: 'aa513d37328b77b0fdb0e0c0350e78e244a72f787affa2c53c363d54ce2d832c' },
        ],
        projectiles: [] as readonly ProjectileBinding[],
    },
    DOG: {
        identity: 'DOG',
        familyHash: '49fae0d4a56c08d9eb4a26c610c20ccbdf6fa5134eb7216caacc2e9746400b92',
        members: [
            { member: 'dog.shp', frames: 172, totalFrames: 344, canvas: [74, 72],
                sourceHash: '7fd747a5d874c8a3613fae87eb8ef438e9b31778c32150830afcd7a992383ff7',
                manifestHash: '6dfd9965317e71a1fabc90a413f452bf8aa5c7111bf9d09f82b1c1b7c3bf997d' },
            { member: 'dogp.shp', frames: 32, totalFrames: 64, canvas: [74, 72],
                sourceHash: '9571109f20bddd2ba051bf3ce0eae5071ddfa40275996f631235cc025f18d855',
                manifestHash: 'b725d15c929d409b4c0d23ecf895f9f3a6fef3df1a666ce519910a9e78026469' },
        ],
        projectiles: [{ weapon: 'BadTeeth', projectile: 'DOGJUMP', member: 'dogp.shp' }],
    },
} as const;

export function isSovietUnitHdSource(source: HdSource): boolean {
    return source.theater === 'TEMPERATE' && Object.values(sovietUnitHdFamilies).some(family =>
        family.members.some(member => source.member === member.member && source.sha256 === member.sourceHash
            && source.frames.length === member.frames
            && source.canvas[0] === member.canvas[0] && source.canvas[1] === member.canvas[1]));
}
