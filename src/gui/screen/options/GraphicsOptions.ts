import { ModelQuality } from "@/engine/renderable/entity/unit/ModelQuality";
import { ShadowQuality } from "@/engine/renderable/entity/unit/ShadowQuality";
import { BoxedVar } from "@/util/BoxedVar";
import { parseRenderResolution, type RenderResolution } from '@/engine/gfx/RenderResolution';
import { parseHdDensity, type HdDensity } from '@/engine/gfx/HdDensity';
interface Resolution {
    width: number;
    height: number;
}
export class GraphicsOptions {
    resolution: BoxedVar<Resolution | undefined>;
    hdEnabled = new BoxedVar(true);
    hdDensity = new BoxedVar<HdDensity>(4);
    // Existing family loaders share one preference; validation/fallback stays independent.
    conscriptHd = this.hdEnabled;
    napowrHd = this.hdEnabled;
    nahandHd = this.hdEnabled;
    narefnHd = this.hdEnabled;
    naweapHd = this.hdEnabled;
    nacnstHd = this.hdEnabled;
    powerPlantHd = this.hdEnabled;
    rhinoHd = this.hdEnabled;
    sovietUnitsHd = this.hdEnabled;
    hdAvailability: Record<string, string> = {};
    renderResolution = new BoxedVar<RenderResolution>('native');
    models: BoxedVar<ModelQuality>;
    shadows: BoxedVar<ShadowQuality>;
    constructor() {
        this.resolution = new BoxedVar<Resolution | undefined>(undefined);
        this.models = new BoxedVar(ModelQuality.High);
        this.shadows = new BoxedVar(ShadowQuality.High);
    }
    unserialize(data: string): this {
        const fields = data.split(",");
        const [t, i, r, sampling] = fields;
        this.renderResolution.value = parseRenderResolution(sampling);
        // Old per-family preferences migrate once to the requested default-on policy.
        // New saves preserve an explicit global off choice independently of old slots.
        this.hdEnabled.value = fields[12] !== '0';
        this.hdDensity.value = parseHdDensity(fields[13]);
        this.models.value = Number(t) as ModelQuality;
        this.shadows.value = Number(i) as ShadowQuality;
        if (r !== undefined) {
            const s = r.length ? r.split("x").map((e) => Number(e)) : undefined;
            this.resolution.value = s ? { width: s[0], height: s[1] } : undefined;
        }
        return this;
    }
    serialize(): string {
        return [
            this.models.value,
            this.shadows.value,
            this.resolution.value
                ? [this.resolution.value.width, this.resolution.value.height].join("x")
                : "",
            this.renderResolution.value,
            Number(this.rhinoHd.value),
            Number(this.conscriptHd.value),
            Number(this.powerPlantHd.value),
            Number(this.napowrHd.value),
            Number(this.nahandHd.value),
            Number(this.narefnHd.value),
            Number(this.naweapHd.value),
            Number(this.nacnstHd.value),
            Number(this.hdEnabled.value),
            this.hdDensity.value,
        ].join(",");
    }
    applyLowPreset(): void {
        this.models.value = ModelQuality.Low;
        this.shadows.value = ShadowQuality.Low;
    }
    applyHighPreset(): void {
        this.models.value = ModelQuality.High;
        this.shadows.value = ShadowQuality.High;
    }
}
