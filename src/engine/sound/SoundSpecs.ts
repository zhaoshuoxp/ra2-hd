import { SoundSpec } from "./SoundSpec";
export enum SoundType {
    Global = 0,
    Normal = 1,
    Screen = 2,
    Local = 3,
    Player = 4,
    Unshroud = 5,
    Shroud = 6
}
export enum SoundPriority {
    Lowest = 0,
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4
}
export enum SoundControl {
    All = 0,
    Loop = 1,
    Random = 2,
    Predelay = 3,
    Interrupt = 4,
    Attack = 5,
    Decay = 6,
    Ambient = 7
}
export class SoundSpecs {
    private ini: any;
    private specs: Map<string, SoundSpec>;
    private defaults: any;
    private readonly indexedNames: string[];
    constructor(ini: any) {
        this.ini = ini;
        // The retail loader allocates nonempty names once, in list order. Numeric
        // INI keys and empty entries are not sound indices (RA2 0x714736-0x714844).
        const names = new Map<string, string>();
        for (const value of ini.getSection('SoundList')?.entries.values() ?? []) {
            if (typeof value !== 'string') continue;
            const name = value.trim(), key = name.toLowerCase();
            if (name && !names.has(key)) names.set(key, name);
        }
        this.indexedNames = [...names.values()];
        this.specs = new Map();
        this.parse();
    }
    private parse(): void {
        let defaultsSection = this.ini.getSection("Defaults");
        if (defaultsSection) {
            this.defaults = {
                minVolume: defaultsSection.getNumber("MinVolume"),
                range: defaultsSection.getNumber("Range"),
                volume: defaultsSection.getNumber("Volume"),
                limit: defaultsSection.getNumber("Limit"),
                type: defaultsSection.getEnumArray("Type", SoundType, /\s+/, [], true),
                priority: defaultsSection.getEnum("Priority", SoundPriority, SoundPriority.Normal, true),
            };
            let soundListSection = this.ini.getSection("SoundList");
            if (soundListSection) {
                for (let soundName of new Set(soundListSection.entries.values())) {
                    if (soundName) {
                        let soundSection = this.ini.getSection(soundName);
                        if (soundSection) {
                            this.specs.set(String(soundName).toLowerCase(), new SoundSpec().read(soundSection, this.defaults));
                        }
                        else {
                            console.warn(`Missing sound section [${soundName}]`);
                        }
                    }
                }
            }
            else {
                console.warn("Missing sound [SoundList] section. Sounds will not be played.");
            }
        }
        else {
            console.warn("Missing sound [Defaults] section. Sounds will not be played.");
        }
    }
    getSpec(name: string): SoundSpec | undefined {
        return this.specs.get(name.toLowerCase());
    }
    getOriginalName(index: number): string {
        const name = this.indexedNames[index];
        if (!Number.isSafeInteger(index) || index < 0 || !name || !this.getSpec(name)) {
            throw new Error(`Unknown original sound index: ${index}`);
        }
        return name;
    }
    getAll(): SoundSpec[] {
        return [...this.specs.values()];
    }
}
