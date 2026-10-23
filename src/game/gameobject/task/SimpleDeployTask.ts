import { Task } from './system/Task';
import { TurnTask } from './TurnTask';
import { ZoneType } from '../unit/ZoneType';
import { TriggerAnimEvent } from '@/game/event/TriggerAnimEvent';
import { globalRules } from '@/game/rules/globalRules';
import { GameSpeed } from '@/game/GameSpeed';
export class SimpleDeployTask extends Task {
    private started = false;
    private finishTick = 0;
    private deploying = false;
    constructor(private game: any) { super(); this.cancellable = false; this.preventLanding = false; }
    onTick(unit: any): boolean {
        if (unit.zone === ZoneType.Air) return false;
        if (!this.started) {
            const direction = globalRules(this.game.rules).getNumber('DeployDir', 2) * 45;
            if (unit.direction !== direction) { this.children.push(new TurnTask(direction)); return false; }
            this.started = true;
            this.deploying = !unit.deployerTrait.isDeployed();
            const name = unit.rules.deployingAnim, art = name && this.game.art.getAnimation(name);
            const frames = art ? art.animationFrameCount / (art.art.getBool('Shadow') ? 2 : 1) : 0;
            this.finishTick = this.game.currentTick + Math.ceil(frames * GameSpeed.BASE_TICKS_PER_SECOND / (art?.art.getNumber('Rate', 900) / 60 || 15));
            unit.simpleDeployAnimating = true;
            unit.attackTrait.setDisabled(true);
            if (name) this.game.events.dispatch(new TriggerAnimEvent(name, unit.tile, !this.deploying,
                undefined, undefined, { identity: unit.name, color: unit.owner.color }));
        }
        if (this.game.currentTick < this.finishTick) return false;
        unit.deployerTrait.setDeployed(this.deploying);
        unit.moveTrait.setDisabled(this.deploying);
        unit.attackTrait.setDisabled(false);
        unit.simpleDeployAnimating = false;
        return true;
    }
}
