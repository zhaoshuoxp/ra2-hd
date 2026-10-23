import { EnterBuildingTask } from './EnterBuildingTask';
export class EnterAbsorberTask extends EnterBuildingTask {
    protected isAllowed(unit: any): boolean { return !this.target.isDestroyed && this.target.absorberTrait?.canEnter(unit); }
    protected onEnter(unit: any): void { this.target.absorberTrait.enter(unit, this.game); }
}
