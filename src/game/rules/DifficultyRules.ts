import { IniFile } from '@/data/IniFile';
import { AiDifficulty } from '../gameopts/GameOpts';

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
        const result = new DifficultyRules();
        const section = ini.getSection(['Easy', 'Normal', 'Difficult'][index]);
        for (const [key, tag] of [
            ['firepower', 'Firepower'], ['groundSpeed', 'Groundspeed'], ['airSpeed', 'Airspeed'],
            ['armor', 'Armor'], ['rof', 'ROF'], ['cost', 'Cost'], ['buildTime', 'BuildTime'],
            ['repairDelay', 'RepairDelay'], ['buildDelay', 'BuildDelay'],
        ] as const) result[key] = section?.getNumber(tag, result[key]) ?? result[key];
        result.teamDelay = ini.getSection('General')?.getNumberArray('TeamDelays')[index] ?? result.teamDelay;
        return result;
    }
}
