import { IniFile } from '@/data/IniFile';
import { AiDifficulty } from '../gameopts/GameOpts';
import { isCampaignDifficulty, type CampaignDifficulty } from '../../data/campaign/CampaignDefinition';

export class DifficultyRules {
    firepower = 1;
    groundSpeed = 1;
    airSpeed = 1;
    armor = 1;
    rof = 1;
    cost = 1;
    buildTime = 1;
    repairDelay = .02;
    buildDelay = .03;
    teamDelay = 2500;

    static read(ini: IniFile, isAi: boolean, difficulty?: AiDifficulty): DifficultyRules {
        // Retail skirmish indexes: 0 = hard, 1 = normal, 2 = easy.
        // The handicap sections run in the opposite direction to the UI labels.
        const index = isAi && difficulty === AiDifficulty.Brutal ? 0
            : isAi && difficulty === AiDifficulty.Easy ? 2 : 1;
        return this.readSection(ini, index, index);
    }

    static readCampaign(ini: IniFile, controlledByHuman: boolean, difficulty: CampaignDifficulty): DifficultyRules {
        if (!isCampaignDifficulty(difficulty)) throw new Error('Unsupported campaign difficulty');
        const playerIndex = { easy: 0, normal: 1, hard: 2 }[difficulty];
        const aiIndex = 2 - playerIndex;
        return this.readSection(ini, controlledByHuman ? playerIndex : aiIndex, aiIndex);
    }

    private static readSection(ini: IniFile, index: number, teamIndex: number): DifficultyRules {
        const result = new DifficultyRules();
        const section = ini.getSection(['Easy', 'Normal', 'Difficult'][index]);
        for (const [key, tag] of [
            ['firepower', 'Firepower'], ['groundSpeed', 'Groundspeed'], ['airSpeed', 'Airspeed'],
            ['armor', 'Armor'], ['rof', 'ROF'], ['cost', 'Cost'], ['buildTime', 'BuildTime'],
            ['repairDelay', 'RepairDelay'], ['buildDelay', 'BuildDelay'],
        ] as const) result[key] = section?.getNumber(tag, result[key]) ?? result[key];
        result.teamDelay = ini.getSection('General')?.getNumberArray('TeamDelays')[teamIndex] ?? result.teamDelay;
        return result;
    }
}
