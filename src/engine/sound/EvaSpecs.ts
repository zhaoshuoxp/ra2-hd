import { SideType } from "../../game/SideType";
export enum EvaPriority {
    Low = 0,
    Normal = 1,
    Important = 2,
    Critical = 3
}
interface EvaSpec {
    text: string;
    sound: string;
    priority: EvaPriority;
    queue: boolean;
}
export function normalizeSpeechText(text: string): string {
    // Original dialog annotations contain Windows-1252 punctuation decoded
    // through the archive's byte-preserving legacy string reader.
    return text.replace(/[\u0080-\u009f]/g, character =>
        new TextDecoder('windows-1252').decode(Uint8Array.of(character.charCodeAt(0))));
}
export class EvaSpecs {
    private sideType: SideType;
    private specs = new Map<string, EvaSpec>();
    constructor(sideType: SideType) {
        this.sideType = sideType;
    }
    readIni(ini: any): EvaSpecs {
        let dialogListSection = ini.getSection("DialogList");
        if (!dialogListSection) {
            throw new Error("Missing eva.ini [DialogList] section");
        }
        const dialogNames = new Set(dialogListSection.entries.values());
        const sidePrefix = this.sideType === SideType.GDI ? "Allied" : this.sideType === SideType.ThirdSide ? "Yuri" : "Russian";
        for (let dialogName of dialogNames) {
            if (dialogName) {
                let dialogSection = ini.getSection(dialogName);
                if (dialogSection) {
                    const spec: EvaSpec = {
                        text: normalizeSpeechText(dialogSection.getString("Text")),
                        sound: dialogSection.getString(sidePrefix),
                        priority: dialogSection.getEnum("Priority", EvaPriority, EvaPriority.Normal, true),
                        queue: dialogSection.getString("Type").trim().toLowerCase() === "queue",
                    };
                    this.specs.set(dialogName as string, spec);
                }
                else {
                    console.warn(`Missing eva section [${dialogName}]`);
                }
            }
        }
        return this;
    }
    getSpec(name: string): EvaSpec | undefined {
        return this.specs.get(name);
    }
}
