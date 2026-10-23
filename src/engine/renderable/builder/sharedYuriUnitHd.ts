// Reuse only the source-identical YR member or the declared native child.
export function sharedYuriUnitHdIdentity(identity: string, image: { filename?: string }, edition: string) {
    if (edition !== 'yr') return identity;
    if (identity === 'YENGINEER' && image.filename === 'engineer.shp') return 'SENGINEER';
    if (identity === 'SLAV' && image.filename === 'slav.shp') return 'SMIN';
    if (identity === 'YDOG' && image.filename === 'dog.shp') return 'DOG';
    if (identity === 'YADOG' && image.filename === 'adog.shp') return 'ADOG';
    return identity;
}
