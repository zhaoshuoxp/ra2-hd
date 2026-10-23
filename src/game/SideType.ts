export enum SideType {
    GDI = 0,
    Nod = 1,
    Civilian = 2,
    Mutant = 3,
    ThirdSide = 4
}

export function combatSideIndex(side: SideType): number {
    return side === SideType.ThirdSide ? 2 : side;
}
