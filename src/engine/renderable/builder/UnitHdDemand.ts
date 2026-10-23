import type { HdSpriteOverride } from './HdSpriteOverride';
import type { VxlFamily } from '../unitVxl/loadVxlFamily';
import type { LoadedPowerPlantHd } from './resolvePowerPlantHd';

type Member = { image: any; override: HdSpriteOverride };
export type DemandFamily = { members: Map<string, Member>; vxl?: VxlFamily; building?: LoadedPowerPlantHd };
type Family = DemandFamily;
export type DemandSelection = Family & { density: number; gpuBytes: number; attempts: any[] };
type Selection = DemandSelection;
type Binding = { image?: any; apply?: (override?: HdSpriteOverride) => void; familyApply?: (family?: Family) => void; warm?: boolean; preview?: boolean };

// A match owns one immutable allocation per complete family. Renderables hold
// leases, including temporary projectile representations and death animations.
export class UnitHdDemand {
  readonly families = new Map<string, Family>();
  readonly report: {
    gpuBytes: number;
    peakBytes: number;
    budget: number;
    families: Record<string, any>;
  };
  private bindings = new Map<string, Set<Binding>>();
  private pending = new Set<string>();
  private blocked = new Set<string>();
  private stopped = false;
  private pumping?: Promise<void>;
  constructor(
    private identities: ReadonlySet<string>,
    budget: number,
    private load: (
      identity: string,
      budget: number,
      cancelled: () => boolean,
    ) => Promise<Selection>,
    private release: (family: Family) => void,
  ) {
    this.report = { gpuBytes: 0, peakBytes: 0, budget: Math.max(0, budget), families: {} };
    identities.forEach(
      (identity) =>
        (this.report.families[identity] = { density: 1, gpuBytes: 0, status: 'NOT_REQUESTED' }),
    );
  }
  bind(identity: string, image: any, apply: Binding['apply']): () => void {
    return this.addBinding(identity, { image, apply });
  }
  bindFamily(identity: string, familyApply: NonNullable<Binding['familyApply']>): () => void {
    return this.addBinding(identity, { familyApply });
  }
  prewarm(identity: string): () => void {
    return this.addBinding(identity, { warm: true });
  }
  preview(identity: string): () => void {
    return this.addBinding(identity, { warm: true, preview: true });
  }
  private hasDemand(identity: string): boolean {
    return [...(this.bindings.get(identity) ?? [])].some(binding => !binding.preview);
  }
  private addBinding(identity: string, binding: Binding): () => void {
    if (this.stopped || !this.identities.has(identity)) return () => {};
    const bindings = this.bindings.get(identity) ?? new Set<Binding>();
    bindings.add(binding);
    // A real renderer takes over the allocation before speculative leases
    // leave. Queue cancellation can still release its own lease safely.
    if (!binding.warm) for (const existing of bindings) if (existing.warm) bindings.delete(existing);
    this.bindings.set(identity, bindings);
    const family = this.families.get(identity);
    if (family) {
      if (!this.report.families[identity].status.startsWith('FAILED')) this.apply(binding, family);
    } else if (!this.report.families[identity].status.startsWith('FAILED')) {
      this.pending.add(identity);
      this.start();
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      bindings.delete(binding);
      if (!bindings.size && !this.stopped) {
        for (const waiting of this.blocked)
          if (this.bindings.get(waiting)?.size) this.pending.add(waiting);
        this.start();
      }
    };
  }
  private apply(binding: Binding, family?: Family) {
    if (binding.warm) return;
    if (binding.familyApply) { binding.familyApply(family); return; }
    if (!family) { binding.apply?.(undefined); return; }
    const member = family.members.get(binding.image.filename);
    binding.apply?.(member?.image === binding.image ? member.override : undefined);
  }
  private start() {
    if (this.pumping || this.stopped || !this.pending.size) return;
    this.pumping = this.drain().finally(() => {
      this.pumping = undefined;
      this.start();
    });
  }
  async idle() {
    while (this.pumping) await this.pumping;
  }
  private async drain() {
    while (this.pending.size && !this.stopped) {
      const identity = [...this.pending].find(name => this.hasDemand(name)) ?? this.pending.values().next().value!;
      this.pending.delete(identity);
      if (
        this.families.has(identity) ||
        !this.bindings.get(identity)?.size ||
        this.report.families[identity].status.startsWith('FAILED')
      )
        continue;
      // No live renderable may reference an allocation being evicted.
      for (const [name, family] of this.families)
        if (!this.bindings.get(name)?.size || (this.hasDemand(identity) && !this.hasDemand(name))) {
          this.release(family);
          this.families.delete(name);
          this.report.gpuBytes -= this.report.families[name].gpuBytes;
          this.report.families[name] = { density: 1, gpuBytes: 0, status: 'EVICTED_IDLE' };
        }
      this.report.families[identity].status = 'LOADING_COMPLETE_FAMILY';
      const superseded = () => !this.hasDemand(identity)
        && [...this.pending].some(name => this.hasDemand(name));
      const retryPreview = () => {
        this.report.families[identity] = { density: 1, gpuBytes: 0, status: 'NOT_REQUESTED' };
        if (this.bindings.get(identity)?.size) this.pending.add(identity);
      };
      try {
        const selected = await this.load(
          identity,
          this.report.budget - this.report.gpuBytes,
          () => this.stopped || superseded(),
        );
        if (this.stopped) {
          this.release(selected);
          break;
        }
        if (superseded()) { this.release(selected); retryPreview(); continue; }
        if (selected.gpuBytes > this.report.budget - this.report.gpuBytes) {
          this.release(selected);
          throw Error('Demand loader exceeded remaining budget');
        }
        const ready = selected.members.size > 0 || !!selected.vxl;
        const capacity =
          !ready && selected.attempts.some((attempt) => attempt.reason === 'combined-budget');
        this.report.families[identity] = {
          density: selected.density,
          gpuBytes: selected.gpuBytes,
          attempts: selected.attempts,
          members: [...selected.members.keys()],
          status: ready ? 'READY' : capacity ? 'BUDGET_FALLBACK' : 'FAILED',
        };
        if (capacity) this.blocked.add(identity);
        else this.blocked.delete(identity);
        if (!ready) continue;
        this.families.set(identity, { members: selected.members, vxl: selected.vxl, building: selected.building });
        this.report.gpuBytes += selected.gpuBytes;
        this.report.peakBytes = Math.max(this.report.peakBytes, this.report.gpuBytes);
        // Synchronous publication: every bound representation switches
        // before the next render, only after the whole family validated.
        for (const binding of this.bindings.get(identity) ?? []) this.apply(binding, selected);
      } catch (error) {
        if (!this.stopped && superseded()) { retryPreview(); continue; }
        const family = this.families.get(identity);
        let retained = false;
        if (family) {
          // A renderer failure must not leave other actors on a
          // partially published family or forget its allocation.
          for (const binding of this.bindings.get(identity) ?? []) {
            try {
              this.apply(binding, undefined);
            } catch {
              retained = true;
            }
          }
          if (!retained) {
            this.release(family);
            this.families.delete(identity);
            this.report.gpuBytes -= this.report.families[identity].gpuBytes;
          }
        }
        this.report.families[identity] = {
          density: 1,
          gpuBytes: retained ? this.report.families[identity].gpuBytes : 0,
          status: retained ? 'FAILED_RETAINED_ALLOCATION' : 'FAILED',
          attempts: [{ reason: error instanceof Error ? error.message : 'load-failure' }],
        };
      }
    }
  }
  dispose() {
    this.stopped = true;
    this.pending.clear();
    this.blocked.clear();
    this.bindings.clear();
    this.families.forEach(this.release);
    this.families.clear();
    this.report.gpuBytes = 0;
  }
}
