import { Strategy } from "./strategy";
import { ExpansionMissionFactory } from "../logic/mission/missions/expansionMission";
import { ScoutingMissionFactory } from "../logic/mission/missions/scoutingMission";
import { AttackMissionFactory } from "../logic/mission/missions/attackMission";
import { DefenceMissionFactory } from "../logic/mission/missions/defenceMission";
import { EngineerMissionFactory } from "../logic/mission/missions/engineerMission";
import { SupabotContext } from "../logic/common/context";
import { MissionController } from "../logic/mission/missionController";
import { DebugLogger } from "../logic/common/utils";
import { Compositions, getValidCompositions, SideComposition } from "./compositionUtils";
import { createInfantryLoadingMissions } from '../logic/mission/missions/loadInfantryMission';

// These could be loaded from ai.ini
const DEFAULT_COMPOSITIONS: Compositions = {
    guardianInfantry: { composition: { GGI: 1, E1: 2 }, minimumUnits: 3, maximumUnits: 9 },
    robotTanks: { composition: { ROBO: 2, MTNK: 2 }, minimumUnits: 4, maximumUnits: 10 },
    sovietAirSupport: { composition: { SCHP: 2, BORIS: 1 }, minimumUnits: 3, maximumUnits: 3 },
    yuriSupport: { composition: { VIRUS: 1, BRUTE: 2, INIT: 2, CAOS: 1 }, minimumUnits: 3, maximumUnits: 6 },
    initiates: { composition: { INIT: 1 }, minimumUnits: 3, maximumUnits: 10 },
    yuriTanks: { composition: { LTNK: 4, YTNK: 2 }, minimumUnits: 3, maximumUnits: 18 },
    yuriControl: { composition: { MIND: 1, LTNK: 3, YTNK: 2 }, minimumUnits: 4, maximumUnits: 12 },
    yuriArtillery: { composition: { TELE: 2, LTNK: 2, YTNK: 1 }, minimumUnits: 3, maximumUnits: 10 },
    floatingDiscs: { composition: { DISK: 1 }, minimumUnits: 2, maximumUnits: 4 },
    conscripts: {
        composition: {
            E2: 1,
        },
        minimumUnits: 3,
        maximumUnits: 10,
    },
    gis: {
        composition: {
            E1: 1,
        },
        minimumUnits: 3,
        maximumUnits: 10,
    },
    sovietTanks: {
        composition: {
            HTNK: 5,
            HTK: 1,
        },
        minimumUnits: 2,
        maximumUnits: 20,
    },
    alliedTanks: {
        composition: {
            MTNK: 5,
            FV: 1,
        },
        minimumUnits: 2,
        maximumUnits: 20,
    },
    kirovs: {
        composition: {
            ZEP: 1,
        },
        minimumUnits: 1,
        maximumUnits: 3,
    },
    rocketeers: {
        composition: {
            JUMPJET: 1,
        },
        minimumUnits: 2,
        maximumUnits: 6,
    },
    heavySovietTanks: {
        composition: {
            APOC: 2,
            HTNK: 1,
        },
        minimumUnits: 2,
        maximumUnits: 10,
    },
    heavyAlliedTanks: {
        composition: {
            MTNK: 2,
            MGTK: 1,
        },
        minimumUnits: 2,
        maximumUnits: 10,
    },
    sovietArtillery: {
        composition: {
            V3: 2,
            HTNK: 1,
        },
        minimumUnits: 3,
        maximumUnits: 10,
    },
    alliedArtillery: {
        composition: {
            SREF: 2,
            MTNK: 1,
        },
        minimumUnits: 3,
        maximumUnits: 10,
    },
};

export class DefaultStrategy implements Strategy {
    private expansionFactory = new ExpansionMissionFactory();
    private scoutingFactory = new ScoutingMissionFactory();
    private attackFactory = new AttackMissionFactory();
    private defenceFactory = new DefenceMissionFactory();
    private engineerFactory = new EngineerMissionFactory();

    onAiUpdate(context: SupabotContext, missionController: MissionController, logger: DebugLogger) {
        createInfantryLoadingMissions(context, missionController, logger);
        this.expansionFactory.maybeCreateMissions(context, missionController, logger);
        this.scoutingFactory.maybeCreateMissions(context, missionController, logger);

        const composition = this.selectRandomAttackComposition(context, logger);
        if (composition) {
            this.attackFactory.maybeCreateMissions(context, missionController, logger, composition);
        }

        this.defenceFactory.maybeCreateMissions(context, missionController, logger);
        this.engineerFactory.maybeCreateMissions(context, missionController, logger);

        return this;
    }

    private selectRandomAttackComposition(context: SupabotContext, logger: DebugLogger): SideComposition | null {
        const playerData = context.game.getPlayerData(context.player.name);
        const side = playerData.country?.side;
        if (side === undefined) {
            return null;
        }

        const validCompositions = getValidCompositions(context, DEFAULT_COMPOSITIONS);

        if (validCompositions.length === 0) {
            return null;
        }

        logger(`Valid compositions: ${validCompositions.join(", ")}`);

        const randomIndex = context.game.generateRandomInt(0, validCompositions.length - 1);
        const compositionId = validCompositions[randomIndex];
        return DEFAULT_COMPOSITIONS[compositionId];
    }
}
