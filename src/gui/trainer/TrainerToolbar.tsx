import React, { useEffect, useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { OptionalToolbarSlot } from '@/gui/hd/OptionalToolbarSlot';
import { offlineTrainer as trainer, TRAINER_ACTIONS, trainerEditableTarget, type TrainerAction } from './TrainerController';
import type { TrainerEffect } from '@/game/trainer/TrainerRuntime';
import { PointerType } from '@/engine/type/PointerType';
import './trainer.css';
type Strings = { get(key: string): string };
function useTrainer(): void {
    const [, update] = useReducer(n => n + 1, 0);
    useEffect(() => trainer.subscribe(update), []);
}
const label = (strings: Strings, key: string) => strings.get(`Trainer:${key}`);
function NumberField({ strings, name, max, min = 0, step = 1 }: { strings: Strings; name: 'credits' | 'power' | 'seconds'; max: number; min?: number; step?: number }) {
    const [invalid, setInvalid] = useState(false);
    const [draft, setDraft] = useState(String(trainer.preferences[name]));
    useEffect(() => { setDraft(String(trainer.preferences[name])); setInvalid(false); }, [trainer.preferences[name]]);
    return <label className="trainer-number">{label(strings, `${name}Value`)}
        <input type="number" aria-label={label(strings, `${name}Value`)} min={min} max={max} step={step}
            value={draft} data-trainer-number={name} aria-invalid={invalid}
            onChange={e => { setDraft(e.target.value); setInvalid(e.target.value.trim() === '' || !trainer.setNumber(name, Number(e.target.value))); }}/>
        {invalid && <span role="alert">{label(strings, 'invalidNumber')}</span>}
    </label>;
}
function Parameters({ strings }: { strings: Strings }) {
    return <div className="trainer-parameters">
        <NumberField strings={strings} name="credits" max={10000000}/>
        <NumberField strings={strings} name="power" max={100000}/>
        <NumberField strings={strings} name="seconds" min={1} max={120} step={0.1}/>
        <p>{label(strings, 'timingHelp')}</p>
    </div>;
}
function Bindings({ strings }: { strings: Strings }) {
    const [error, setError] = useState(false);
    return <details className="trainer-bindings"><summary>{label(strings, 'bindings')}</summary>
        <p>{label(strings, 'bindingsHelp')}</p>
        {error && <p role="alert">{label(strings, 'conflict')}</p>}
        <div className="trainer-binding-grid">{TRAINER_ACTIONS.map(action => <label key={action}>{label(strings, action)}
            <select aria-label={`${label(strings, 'binding')} ${label(strings, action)}`} value={trainer.preferences.bindings[action] ?? ''}
                onChange={e => setError(!trainer.setBinding(action, e.target.value === '' ? undefined : Number(e.target.value)))}>
                <option value="">{label(strings, 'unbound')}</option>
                {Array.from({ length: 10 }, (_, digit) => <option key={digit} value={digit} disabled={trainer.bindingConflict(action, digit)}>Ctrl+Shift+{digit}</option>)}
            </select></label>)}</div>
    </details>;
}
export function TrainerOptions({ strings }: { strings: Strings }) {
    useTrainer();
    return <fieldset className="trainer-options"><legend>{label(strings, 'title')}</legend>
        <label className="trainer-master"><input type="checkbox" checked={trainer.preferences.enabled}
            onChange={e => trainer.setEnabled(e.target.checked)}/>{label(strings, 'enable')}</label>
        {trainer.preferences.enabled && <><p>{label(strings, 'help')}</p><Parameters strings={strings}/><Bindings strings={strings}/></>}
    </fieldset>;
}
const groups = {
    economy: ['addCredits', 'power'],
    targets: ['heal', 'protect', 'unprotect', 'clearProtection', 'transfer'],
    constructionMap: ['construction', 'production', 'technology', 'placement', 'reveal'],
    powers: ['ready', 'recharge'],
} satisfies Record<string, TrainerAction[]>;
function Toolbar({ strings, onClose }: { strings: Strings; onClose(): void }) {
    useTrainer();
    const [open, setOpen] = useState<string>();
    const enabled = trainer.preferences.enabled;
    useEffect(() => { if (!enabled) { setOpen(undefined); trainer.releaseInput(); } }, [enabled]);
    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (!(event.target as HTMLElement)?.closest?.('.trainer-overlay')) { setOpen(undefined); trainer.releaseInput(); }
        };
        const onBlur = () => { setOpen(undefined); trainer.cancelTarget(); trainer.releaseInput(); };
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('blur', onBlur);
        return () => { document.removeEventListener('pointerdown', onPointerDown, true); window.removeEventListener('blur', onBlur); };
    }, []);
    if (!enabled) return null;
    const actionButton = (action: TrainerAction) => {
        const active = !!trainer.session?.isEffectEnabled(action as TrainerEffect) || (action === 'transfer' && trainer.targeting);
        const digit = trainer.preferences.bindings[action];
        return <button key={action} type="button" data-trainer-action={action} aria-pressed={active} disabled={!trainer.canAct}
            title={`${label(strings, `${action}Help`)}${digit === undefined ? '' : ` · Ctrl+Shift+${digit}`}`}
            onClick={() => { trainer.run(action); if (action === 'transfer') { setOpen(undefined); onClose(); } }}>
            <span aria-hidden="true">{active ? '● ' : ''}</span>{label(strings, action)}</button>;
    };
    return <section className="trainer-overlay" aria-label={label(strings, 'title')} onPointerEnter={() => trainer.captureInput()}
        onPointerLeave={() => { if (!open) trainer.releaseInput(); }}
        onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(undefined); trainer.cancelTarget(); trainer.releaseInput(); (document.activeElement as HTMLElement)?.blur(); onClose(); }
            e.stopPropagation();
        }} onKeyUp={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onMouseUp={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
        {open && <div className="trainer-popover" role="region" aria-label={label(strings, open)}>
            <div className="trainer-panel-heading"><strong>{label(strings, open)}</strong><button aria-label={label(strings, 'close')}
                onClick={() => { setOpen(undefined); trainer.releaseInput(); onClose(); }}>×</button></div>
            {open === 'settings' ? <><Parameters strings={strings}/><Bindings strings={strings}/><p>{label(strings, 'help')}</p></> :
                <><div className="trainer-actions">{groups[open as keyof typeof groups].map(actionButton)}</div>
                    {open === 'economy' && <><NumberField strings={strings} name="credits" max={10000000}/>
                        <div className="trainer-actions">{actionButton('setCredits')}{actionButton('minimum')}</div>
                        <NumberField strings={strings} name="power" max={100000}/>
                        <button disabled={!trainer.canAct} onClick={() => trainer.send({ type: 'effect', effect: 'power', enabled: true, value: trainer.preferences.power })}>{label(strings, 'applyPower')}</button></>}
                    {open === 'constructionMap' && <><NumberField strings={strings} name="seconds" min={1} max={120} step={0.1}/>
                        <button disabled={!trainer.canAct} onClick={() => trainer.send({ type: 'effect', effect: 'production', enabled: true, value: trainer.preferences.seconds })}>{label(strings, 'applyTime')}</button>
                        <p>{label(strings, 'timingHelp')}</p><p>{label(strings, 'technologyHelp')}</p><p>{label(strings, 'placementHelp')}</p></>}
                    {open === 'targets' && <p>{label(strings, 'targetsHelp')} · {trainer.session?.protectedObjects.size ?? 0}</p>}
                    {open === 'powers' && <p>{label(strings, 'powersHelp')}</p>}
                </>}
        </div>}
        <div className="trainer-bar"><strong>{label(strings, 'title')}</strong>
            {Object.keys(groups).map(group => <button key={group} aria-expanded={open === group} onClick={() => { trainer.captureInput(); setOpen(open === group ? undefined : group); }}>{label(strings, group)}</button>)}
            <button aria-expanded={open === 'settings'} onClick={() => { trainer.captureInput(); setOpen(open === 'settings' ? undefined : 'settings'); }}>{label(strings, 'settings')}</button>
            {actionButton('reset')}
            <span className="trainer-status" role="status" title={label(strings, 'help')}>
                {trainer.targeting ? label(strings, 'target') : trainer.session?.pending ? `${label(strings, 'queued')} (${trainer.session.pending})` :
                    label(strings, trainer.status === 'queued' ? trainer.session?.lastResult ?? 'applied' : trainer.status)}
                {trainer.session?.modified && ` · ${label(strings, 'modified')}`}
            </span>
        </div>
    </section>;
}
export class TrainerToolbar implements OptionalToolbarSlot {
    readonly placement = 'overlay';
    readonly maxLogicalHeight = 32;
    constructor(private strings: Strings, private viewport: any, private pointer: any, private renderer: any) {}
    mount(host: HTMLElement): () => void {
        const element = document.createElement('div'); element.className = 'trainer-host'; host.appendChild(element);
        const updateSize = () => {
            const scale = this.viewport.value.scale ?? 1;
            element.style.transform = `scale(${scale})`;
            element.style.left = `${(this.viewport.value.x ?? 0) + 12 * scale}px`;
            element.style.bottom = `${36 * scale}px`;
        };
        updateSize(); this.viewport.onChange.subscribe(updateSize);
        const root = createRoot(element);
        root.render(<Toolbar strings={this.strings} onClose={() => (document.activeElement as HTMLElement)?.blur()}/>);
        const handleKey = (event: KeyboardEvent) => {
            if (!trainer.preferences.enabled || !trainer.canUseKeys || !document.hasFocus() || event.repeat || event.isComposing || event.keyCode === 229 ||
                trainerEditableTarget(event.target) || document.querySelector('.message-box') || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
            const digit = /^Digit[0-9]$/.test(event.code) ? Number(event.code.slice(-1)) : -1;
            const action = TRAINER_ACTIONS.find(key => trainer.preferences.bindings[key] === digit && !trainer.bindingConflict(key, digit));
            if (action) { event.preventDefault(); event.stopImmediatePropagation(); trainer.run(action); }
        };
        const lockedBarTarget = (): HTMLElement | undefined => {
            if (!trainer.canUseKeys || !this.pointer.getPointerLock().isActive()) return;
            const p = this.pointer.getPosition(), scale = this.viewport.value.scale ?? 1;
            const x = p.x * scale + (this.viewport.value.x ?? 0), y = p.y * scale + (this.viewport.value.y ?? 0);
            const target = document.elementFromPoint(x, y) as HTMLElement | null;
            return target?.closest('.trainer-bar') && element.contains(target) ? target : undefined;
        };
        let hoveredButton: HTMLButtonElement | undefined;
        const frame = () => {
            const target = lockedBarTarget();
            const button = target?.closest('button') as HTMLButtonElement | undefined;
            if (button !== hoveredButton) {
                hoveredButton?.removeAttribute('data-pointer-hover');
                button?.setAttribute('data-pointer-hover', 'true'); hoveredButton = button;
            }
            if (target) this.pointer.setPointerType(PointerType.Default);
        };
        const heldButtons = new Set<number>();
        let swallowedClickButton: number | undefined;
        const handleMouseDown = (event: MouseEvent) => {
            swallowedClickButton = undefined; heldButtons.delete(event.button);
            const target = lockedBarTarget();
            if (!target) return;
            // Hover keeps relative motion uninterrupted. Only an explicit menu click
            // hands off to native DOM controls; never forward the click to the world.
            heldButtons.add(event.button);
            event.preventDefault(); event.stopImmediatePropagation();
            if (event.button === 0) (target.closest('button') as HTMLButtonElement | null)?.click();
        };
        const handleMouseUp = (event: MouseEvent) => {
            if (!heldButtons.delete(event.button)) return;
            swallowedClickButton = event.button;
            event.preventDefault(); event.stopImmediatePropagation();
        };
        const handleClick = (event: MouseEvent) => {
            if (!event.isTrusted || swallowedClickButton !== event.button) return;
            swallowedClickButton = undefined;
            event.preventDefault(); event.stopImmediatePropagation();
        };
        document.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('mouseup', handleMouseUp, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKey, true); this.renderer.onFrame.subscribe(frame);
        return () => { document.removeEventListener('keydown', handleKey, true); this.renderer.onFrame.unsubscribe(frame);
            document.removeEventListener('mousedown', handleMouseDown, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
            document.removeEventListener('click', handleClick, true);
            this.viewport.onChange.unsubscribe(updateSize); root.unmount(); element.remove(); trainer.endSession(); };
    }
}
