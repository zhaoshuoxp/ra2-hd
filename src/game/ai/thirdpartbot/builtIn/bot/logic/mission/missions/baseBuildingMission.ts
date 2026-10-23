import { GameApi, PlayerData, QueueType, TechnoRules } from "../../../../game-api";
import { MissionContext } from "../../common/context";
import { DebugLogger, maxBy } from "../../common/utils";
import { buildStructureAtLocation, Mission, MissionAction, noop } from "../mission";
import { GlobalThreat } from "../../threat/threat";
import {
    BUILDING_NAME_TO_RULES,
    DEFAULT_BUILDING_PRIORITY,
    getDefaultPlacementLocation,
} from "../../building/buildingRules";
import { queueTypeToName } from "../../building/queueController";

// Legacy mission encompassing the old "build queue" logic.
export class BaseBuildingMission extends Mission {
    constructor(
        private queueType: QueueType,
        logger: DebugLogger,
    ) {
        super(`building-mission-${queueTypeToName(queueType)}`, logger);
    }

    _onAiUpdate(context: MissionContext): MissionAction {
        const options = context.player.production.getAvailableObjects(this.queueType);
        const playerData = context.game.getPlayerData(context.player.name);
        if (options.length === 0) {
            return noop();
        }

        const { game, matchAwareness } = context;
        const threatCache = matchAwareness.getThreatCache();

        const optionWithPriority = options.map((option) => {
            return {
                option,
                priority: this.getPriorityForBuildingOption(option, game, playerData, threatCache),
            };
        });

        for (const candidate of optionWithPriority.sort((a, b) => b.priority - a.priority)) {
            if (candidate.priority <= 0) continue;
            const location = this.getBestLocationForStructure(game, playerData, candidate.option);
            if (location) return buildStructureAtLocation(candidate.option.name, candidate.priority, location.rx, location.ry);
        }
        return noop();
    }

    getGlobalDebugText(): string | undefined {
        return undefined;
    }

    getPriority(): number {
        return 0;
    }

    private getPriorityForBuildingOption(
        option: TechnoRules,
        game: GameApi,
        playerStatus: PlayerData,
        threatCache: GlobalThreat | null,
    ) {
        if (BUILDING_NAME_TO_RULES.has(option.name)) {
            let logic = BUILDING_NAME_TO_RULES.get(option.name)!;
            return logic.getPriority(game, playerStatus, option, threatCache);
        } else {
            // Fallback priority when there are no rules.
            return (
                DEFAULT_BUILDING_PRIORITY - game.getVisibleUnits(playerStatus.name, "self", (r) => r == option).length
            );
        }
    }

    private getBestLocationForStructure(
        game: GameApi,
        playerData: PlayerData,
        objectReady: TechnoRules,
    ): { rx: number; ry: number } | undefined {
        if (BUILDING_NAME_TO_RULES.has(objectReady.name)) {
            let logic = BUILDING_NAME_TO_RULES.get(objectReady.name)!;
            return logic.getPlacementLocation(game, playerData, objectReady);
        } else {
            // fallback placement logic
            return getDefaultPlacementLocation(game, playerData, playerData.startLocation, objectReady);
        }
    }

    private handleBuildingReady(context: MissionContext, objectReady: TechnoRules) {
        const { game, player } = context;
        const { actions: actionsApi } = player;
        const playerData = game.getPlayerData(player.name);
        let location: { rx: number; ry: number } | undefined = this.getBestLocationForStructure(
            game,
            playerData,
            objectReady,
        );
        if (location !== undefined) {
            this.logger(
                `Completed (${queueTypeToName(this.queueType)}): ${objectReady.name}, placing at ${location.rx},${
                    location.ry
                }`,
            );
            actionsApi.placeBuilding(objectReady.name, location.rx, location.ry);
        } else {
            this.logger(`Completed (${queueTypeToName(this.queueType)}): ${objectReady.name} but nowhere to place it`);
        }
    }
}
