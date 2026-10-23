export const DIAGNOSTIC_ID = 'WINHD-20261008-D38F136-C9';
export const SCHEMA_VERSION = 1;
export const BASE_COMMIT = 'd38f1366942f586a1a9df2964a40f05cc9db4cdc';
export const FIXED_TIMESTAMP = 1700000000000;

export function parseDiagnosticArgs(args) {
    const values = {};
    for (const arg of args) {
        const match = /^--diag-(mode|scene|control|seconds)=(.+)$/.exec(arg);
        if (match) values[match[1]] = match[2];
    }
    const config = { mode: values.mode ?? '4x', scene: values.scene ?? 'small',
        control: values.control ?? 'none', seconds: Number(values.seconds ?? 15),
        trace: args.includes('--diag-trace'), manual: args.includes('--diag-manual') };
    if (!['original', '2x', '4x'].includes(config.mode)) throw Error('Invalid diagnostic mode');
    if (!['small', 'stress'].includes(config.scene)) throw Error('Invalid diagnostic scene');
    if (!['none', '720p', 'frozen', 'shadows-off'].includes(config.control)) throw Error('Invalid diagnostic control');
    if (!Number.isInteger(config.seconds) || config.seconds < 3 || config.seconds > 60) throw Error('Invalid diagnostic duration');
    const contentSize = config.scene === 'stress' ? [1707, 1067] : [1280, 800];
    return { ...config, experimentId: `${DIAGNOSTIC_ID}-${config.scene}-${config.mode}-${config.control}`,
        timestamp: FIXED_TIMESTAMP, edition: 'yr', shadows: config.control === 'shadows-off' ? 0 : 3,
        renderResolution: config.control === '720p' ? '720p' : 'native',
        contentSize, displayMode: config.scene === 'stress' ? 'native-fullscreen' : 'window',
        presentationHeight: 900 };
}

export function scenarioPreferences(config) {
    const stress = config.scene === 'stress';
    return {
        '_edition:yr:_r_gameRes': '2',
        '_edition:yr:_r_hostOpts': '5;10000;10;1;1;1;1;1;;0;1;0;0',
        '_edition:yr:_r_lastBots': '0,-1,-1,-1,-1,' + Array(stress ? 7 : 1).fill('2,-2,-2,-2,-2').join(','),
        '_edition:yr:_r_lastColor': '2', '_edition:yr:_r_lastCountry': '0',
        '_edition:yr:_r_lastMap': stress ? 'xmp27t8.map' : 'xmp03t4.map',
        '_edition:yr:_r_lastMode': '1', '_edition:yr:_r_lastStartPos': '0',
        '_edition:yr:_r_mixer_v3': '0,1;6,1;5,1;2,1;3,1;4,1;1,1',
        '_edition:yr:soloSpeedTierV1': '2',
        '_edition:yr:_r_trainer_v1': JSON.stringify({ version: 1, enabled: true, credits: 100000,
            power: 1000, seconds: 1, bindings: { addCredits: 1, power: 2, heal: 3, protect: 4,
                transfer: 5, reveal: 6, construction: 7, technology: 8, placement: 9, clearProtection: 0 } }),
    };
}

export function summarize(values, timing = true) {
    const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    const quantile = q => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? null;
    const result = { n: sorted.length, median: quantile(.5), p95: quantile(.95), p99: quantile(.99),
        maximum: sorted.at(-1) ?? null };
    return timing ? { ...result,
        above33ms: sorted.filter(v => v > 33).length, above50ms: sorted.filter(v => v > 50).length,
        above100ms: sorted.filter(v => v > 100).length } : result;
}
