// Native frame numbers remain edition-owned; these members share accepted pixels.
export function sharedAlliedUnitHdIdentity(identity: string, image: { filename?: string }) {
    return identity === 'ENGINEER' && image.filename === 'engineer.shp' ? 'SENGINEER' : identity;
}

export function unitHdAvailableInEdition(family: { identity: string; edition?: string }, edition: string) {
    return !family.edition || family.edition === edition
        || (edition === 'ra2' && (family.identity === 'CCOMAND' || family.identity === 'PTROOP'));
}
