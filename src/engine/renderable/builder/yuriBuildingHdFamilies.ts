// Native Yuri production identities. Only complete catalog selections load.
export const yuriBuildingHdNames = ['YACNST', 'YAPOWR', 'YABRCK', 'YAWEAP', 'YAYARD',
    'YAREFN', 'NAPSIS', 'NACLON', 'YATECH', 'YAGRND', 'NATBNK', 'YAGGUN',
    'YAPSYT', 'GAFWLL', 'YAGNTC', 'YAPPET'] as const;
export type YuriBuildingHdFamily = typeof yuriBuildingHdNames[number];
export function isYuriBuildingHdFamily(name: string): name is YuriBuildingHdFamily {
    return (yuriBuildingHdNames as readonly string[]).includes(name);
}
