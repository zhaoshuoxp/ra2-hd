import { Task } from "@/game/gameobject/task/system/Task";
import { ObjectType } from "@/engine/type/ObjectType";
import { Building, BuildStatus } from "@/game/gameobject/Building";
import { MoveTask } from "@/game/gameobject/task/move/MoveTask";
import { ObjectMorphEvent } from "@/game/event/ObjectMorphEvent";
import { TurnTask } from "@/game/gameobject/task/TurnTask";
import { PackBuildingTask } from "@/game/gameobject/task/morph/PackBuildingTask";
export class MorphIntoTask extends Task {
    protected game: any;
    protected morphInto: any;
    constructor(game: any) {
        super();
        this.game = game;
    }
    onStart(unit: any): void {
        if (!this.morphInto)
            throw new Error("morphInto not set");
        if (unit.isBuilding() &&
            unit.buildStatus !== BuildStatus.BuildDown &&
            this.morphInto.type !== ObjectType.Building) {
            this.children.push(new PackBuildingTask(this.game));
        }
        if (unit.isVehicle() &&
            this.morphInto.type === ObjectType.Building) {
            this.children.push(new TurnTask(unit.rules.deployFacing));
        }
    }
    onTick(unit: any): boolean {
        if (!this.morphInto)
            throw new Error("morphInto not set");
        const selection = this.game.getUnitSelection();
        const isSelected = selection.isSelected(unit);
        const controlGroup = selection.getOrCreateSelectionModel(unit).getControlGroupNumber();
        const morphTarget = this.morphInto;
        const health = unit.healthTrait?.health;
        let newObject: any;
        let slaves: any;
        if (morphTarget.type === ObjectType.Building) {
            if (unit.isVehicle() &&
                unit.parasiteableTrait?.isInfested() &&
                !unit.parasiteableTrait.beingBoarded) {
                return true;
            }
            const tile = unit.tile;
            const constructionWorker = this.game.getConstructionWorker(unit.owner);
            if (!constructionWorker.canPlaceAt(this.morphInto.name, tile, {
                ignoreAdjacent: true,
                ignoreObjects: [unit]
            })) {
                return true;
            }
            slaves = unit.slaveMinerTrait?.detachForMorph();
            this.game.unspawnObject(unit);
            unit.dispose();
            [newObject] = constructionWorker.placeAt(this.morphInto.name, tile);
            newObject.healthTrait.health = unit.healthTrait.health;
        }
        else {
            const moveTasks = unit.unitOrderTrait.getTasks()
                .filter((task: any) => task instanceof MoveTask);
            slaves = unit.slaveMinerTrait?.detachForMorph();
            this.game.unspawnObject(unit);
            unit.dispose();
            newObject = this.game.createUnitForPlayer(this.morphInto, unit.owner);
            newObject.direction = 180;
            newObject.healthTrait.health = unit.healthTrait.health;
            const foundationCenter = unit.art.foundationCenter;
            this.game.spawnObject(newObject, this.game.map.tiles.getByMapCoords(unit.tile.rx + foundationCenter.x, unit.tile.ry + foundationCenter.y));
            moveTasks.forEach((task: any) => newObject.unitOrderTrait.addTask(task));
        }
        if (slaves) newObject.slaveMinerTrait?.adopt(slaves);
        if (unit.veteranTrait && newObject.veteranTrait) newObject.veteranTrait.inheritFrom(unit.veteranTrait, this.game);
        if (health !== undefined && newObject.healthTrait) newObject.healthTrait.health = health;
        newObject.purchaseValue = unit.purchaseValue;
        unit.replacedBy = newObject;
        if (isSelected) {
            selection.addToSelection(newObject);
        }
        if (controlGroup !== undefined) {
            selection.addUnitsToGroup(controlGroup, [newObject], false);
        }
        this.game.events.dispatch(new ObjectMorphEvent(unit, newObject));
        return true;
    }
}
