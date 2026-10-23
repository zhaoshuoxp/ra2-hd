import { PointerType } from '@/engine/type/PointerType';
const starts = Object.values(PointerType).filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
export function commandCursorFamily(frame: number): { name: string; start: number; phase: number } | undefined {
    const start = [...starts].reverse().find(value => value <= frame);
    return start === undefined || frame > 516 ? undefined : { name: PointerType[start], start, phase: frame - start };
}
