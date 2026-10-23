import { PointerType } from '@/engine/type/PointerType';
import { ActionFilter, type DefaultActionHandler } from './DefaultActionHandler';
import type { UnitSelectionHandler } from './UnitSelectionHandler';

// A one-click command reuses the native target, order and replay pipeline.
export class AttackMoveMode {
    readonly cancelOnEscape = true;
    private readonly modifiers = { targetedAttackMove: true };
    constructor(private handler: DefaultActionHandler, private selection: UnitSelectionHandler,
        private pointer: { setPointerType(type: PointerType): void }) {}
    enter(): void {}
    hover(hover: any, minimap = false): void {
        if (!hover?.tile) { this.pointer.setPointerType(PointerType.Default); return; }
        this.handler.update(hover, this.selection.getSelectedUnits(), false, this.modifiers, minimap);
        const type = this.handler.getPointerType(minimap);
        this.pointer.setPointerType(type === PointerType.Default || type === PointerType.Mini
            ? minimap ? PointerType.NoActionMini : PointerType.NoAction : type);
    }
    execute(hover: any, minimap = false): boolean {
        if (!hover?.tile) return false;
        return this.handler.execute(hover, this.selection.getSelectedUnits(), ActionFilter.NoSelect,
            false, false, this.modifiers, minimap);
    }
    cancel(): void {}
}
