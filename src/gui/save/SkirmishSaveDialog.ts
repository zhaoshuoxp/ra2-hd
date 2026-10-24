import { activeEdition } from '@/editions/activeEdition';
import { ScreenType } from '@/gui/screen/ScreenType';
import { mountNativeUiBackdrop } from '@/gui/hd/NativeUiBackdrop';
import { mountSaveMenuArt, type SaveMenuArt } from './SaveMenuArt';
import { SaveError, SkirmishSave } from './SkirmishSave';
import { SkirmishSaveStorage } from './SkirmishSaveStorage';
import './SkirmishSaveDialog.css';

interface Strings { get(key: string, ...args: any[]): string }
export interface SavePageOptions {
    engineVersion: string;
    modHash?: string;
    currentGame?: boolean;
    menuArt?: SaveMenuArt;
    capture?(name: string, id?: string): SkirmishSave;
}
export interface SavePageHost {
    setButtons(buttons: { label: string; action: string; disabled?: boolean; isBottom?: boolean; onClick(): void }[]): void;
    back(): Promise<void>;
}

export function mountSkirmishSavePage(container: HTMLElement, strings: Strings, controller: any,
    options: SavePageOptions, host: SavePageHost): () => void {
    const saving = !!options.capture;
    const text = (key: string) => strings.get('HD:' + key);
    const native = (key: string) => strings.get('GUI:' + key);
    const dialog = document.createElement('section');
    dialog.className = 'skirmish-saves'; dialog.dataset.testid = 'skirmish-saves';
    dialog.dataset.mode = saving ? 'save' : 'load';
    dialog.dataset.edition = activeEdition;
    dialog.setAttribute('aria-label', text(saving ? 'SaveGame' : 'LoadGame'));
    const screen = document.createElement('div'); screen.className = 'save-native-screen';
    const content = document.createElement('section'); content.className = 'save-file-content';
    const panel = document.createElement('canvas'); panel.className = 'save-file-background';
    panel.setAttribute('aria-hidden', 'true');
    const heading = document.createElement('h2'); heading.textContent = native(saving ? 'SaveMission' : 'SelectMission');
    const list = document.createElement('div'); list.className = 'save-native-list'; list.tabIndex = 0;
    list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', text('SavedGames'));
    const name = document.createElement('input'); name.type = 'text'; name.maxLength = 80;
    name.className = 'save-native-name'; name.value = new Date().toLocaleString();
    name.setAttribute('aria-label', text('SaveName')); name.autocomplete = 'off';
    const details = document.createElement('p'); details.className = 'save-native-details';
    const status = document.createElement('span'); status.setAttribute('role', 'status');
    details.append(status);
    content.append(panel, heading, list);
    if (saving) content.append(name);
    content.append(details); screen.append(content);
    const popup = document.createElement('dialog'); popup.className = 'save-native-popup';
    const popupPanel = document.createElement('section'); popupPanel.className = 'save-popup-panel';
    popupPanel.setAttribute('role', 'alertdialog'); popupPanel.setAttribute('aria-modal', 'true');
    const popupArt = document.createElement('canvas'); popupArt.setAttribute('aria-hidden', 'true');
    const popupText = document.createElement('p'); popupText.id = 'save-popup-message';
    popupPanel.setAttribute('aria-labelledby', popupText.id);
    const popupButtons = document.createElement('div'); popupButtons.className = 'save-popup-buttons';
    popupPanel.append(popupArt, popupText, popupButtons); popup.append(popupPanel);
    dialog.append(screen);
    const storage = new SkirmishSaveStorage();
    let saves: SkirmishSave[] = [], selectedId = '', busy = false, closed = false;
    let popupKind: 'confirm' | 'working' | 'notice' | undefined;
    const releases: (() => void)[] = [];
    let popupReleases: (() => void)[] = [], buttonState = "";
    const selected = () => saves.find(save => save.id === selectedId);
    const button = (label: string, action: string, handler: () => void, parent = popupButtons) => {
        const element = document.createElement('button'); element.type = 'button';
        element.className = 'save-native-button'; element.textContent = label; element.dataset.action = action;
        element.onclick = handler; parent.append(element);
        return element;
    };
    const update = () => {
        if (closed) return;
        const locked = busy || !!popupKind;
        name.disabled = locked; list.tabIndex = locked ? -1 : 0;
        list.setAttribute('aria-disabled', String(locked));
        for (const row of list.querySelectorAll<HTMLButtonElement>('[role=option]')) {
            row.disabled = locked;
            row.setAttribute('aria-selected', String(row.dataset.id === selectedId));
        }
        const nextButtonState = [busy, !!selected(), !!name.value.trim()].join();
        if (buttonState !== nextButtonState) {
            buttonState = nextButtonState;
            host.setButtons([
                { label: native(saving ? 'Save' : 'Load'), action: saving ? 'SaveGame' : 'LoadGame',
                    disabled: busy || (saving ? !name.value.trim() : !selected()), onClick: activate },
                { label: text('DeleteSave'), action: 'DeleteSave', disabled: busy || !selected(), onClick: remove },
                { label: native('Back'), action: 'CloseSaves', disabled: busy, isBottom: true, onClick: close },
            ]);
        }
        if (!busy) {
            const save = selected();
            status.textContent = save ? (save.gameOpts.mapTitle ?? save.gameOpts.mapName) + '  ' +
                Math.floor(save.tick / 900) + ':' + String(Math.floor(save.tick / 15) % 60).padStart(2, '0') : text('NoSavedGames');
        }
    };
    const releasePopup = () => {
        for (const release of popupReleases) release();
        popupReleases = [];
    };
    const focusPrimary = () => document.querySelector<HTMLButtonElement>(
        '[data-action=' + (saving ? 'SaveGame' : 'LoadGame') + ']')?.focus();
    const dismissPopup = () => {
        popupKind = undefined; popup.close(); releasePopup(); filesBackdrop.refresh(); update(); focusPrimary();
    };
    const showPopup = (kind: typeof popupKind, message: string) => {
        popupKind = kind; popupText.textContent = message;
        if (!popup.open) {
            // The dimmed shell backdrop returns space for a full-density popup.
            // Restore its normal HD canvas as soon as the popup closes.
            filesBackdrop.refresh();
            popupReleases = [mountSaveMenuArt(popup), mountNativeUiBackdrop(popupArt, 'dialog')];
            popup.showModal();
        }
        popupButtons.replaceChildren(); popupPanel.setAttribute('aria-busy', String(kind === 'working')); update();
    };
    const notice = (message: string) => {
        showPopup('notice', message);
        button(native('OK'), 'AcknowledgeSave', dismissPopup, popupButtons).focus();
    };
    const confirm = (key: string, operation: () => void) => {
        showPopup('confirm', key === 'ConfirmReplaceSave' ? strings.get('TXT_CONFIRM_SAVE') : text(key));
        const proceed = button(text('ConfirmSaveAction'), 'ConfirmSaveAction', () => {
            dismissPopup(); operation();
        }, popupButtons);
        button(text('CancelSaveAction'), 'CancelSaveAction', dismissPopup, popupButtons);
        proceed.focus();
    };
    const close = () => { if (!busy && !closed) void host.back(); };
    const run = async (operation: () => Promise<void>, working?: 'SavingGame' | 'LoadingGame') => {
        if (busy || closed) return;
        busy = true;
        if (working) showPopup('working', strings.get(working === 'SavingGame' ? 'TXT_SAVING_GAME' : 'TXT_LOADING'));
        update();
        try {
            if (working) await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            await operation();
        } catch (error) {
            console.error('[Skirmish saves]', error);
            if (!closed) notice(strings.get(error instanceof SaveError ? error.key : 'HD:SaveStorageError'));
        } finally { busy = false; update(); }
    };
    const choose = (id: string) => {
        if (busy || popupKind) return;
        selectedId = id;
        if (saving && selected()) name.value = selected()!.name;
        update();
    };
    const refresh = async (id?: string) => {
        saves = await storage.list(activeEdition); selectedId = id ?? saves[0]?.id ?? '';
        list.replaceChildren(...saves.map(save => {
            const row = document.createElement('button'); row.type = 'button'; row.tabIndex = -1;
            row.setAttribute('role', 'option'); row.dataset.id = save.id;
            const label = document.createElement('span'), date = document.createElement('time');
            label.textContent = save.name; date.textContent = new Date(save.savedAt).toLocaleString();
            row.append(label, date); row.onclick = () => choose(save.id);
            row.ondblclick = () => { choose(save.id); activate(); };
            return row;
        }));
        update();
    };
    const save = (id?: string) => void run(async () => {
        const record = options.capture!(name.value, id);
        await storage.save(record); await refresh(record.id); notice(strings.get('TXT_GAME_WAS_SAVED'));
    }, 'SavingGame');
    const load = () => void run(async () => {
        status.textContent = strings.get('TXT_LOADING');
        const record = await storage.load(selectedId, activeEdition);
        if (record.engineVersion !== options.engineVersion || record.modHash !== (options.modHash ?? ''))
            throw new SaveError('HD:SaveIncompatible');
        await controller.goToScreenBlocking(ScreenType.Game, { create: true, singlePlayer: true,
            gameId: record.gameId, timestamp: record.gameTimestamp, playerName: record.playerName,
            gameOpts: structuredClone(record.gameOpts), savedGame: record });
    });
    const activate = () => {
        if (busy || popupKind) return;
        if (saving) {
            if (!name.value.trim()) return;
            const existing = saves.find(record => record.name === name.value.trim());
            if (existing) confirm('ConfirmReplaceSave', () => save(existing.id));
            else save();
        } else if (selected()) {
            if (options.currentGame) confirm('ConfirmLoadSave', load);
            else load();
        }
    };
    const remove = () => {
        const record = selected();
        if (!record || busy || popupKind) return;
        confirm('ConfirmDeleteSave', () => void run(async () => {
            await storage.delete(record.id); await refresh();
        }));
    };
    list.onkeydown = event => {
        if (busy || popupKind) return;
        const index = saves.findIndex(record => record.id === selectedId);
        const next = event.key === 'ArrowDown' ? Math.min(saves.length - 1, index + 1)
            : event.key === 'ArrowUp' ? Math.max(0, index - 1)
            : event.key === 'Home' ? 0 : event.key === 'End' ? saves.length - 1 : undefined;
        if (next !== undefined && saves[next]) {
            event.preventDefault(); choose(saves[next].id);
            list.querySelector<HTMLElement>('[data-id="' + selectedId + '"]')?.scrollIntoView({ block: 'nearest' });
        } else if (event.key === 'Enter') { event.preventDefault(); activate(); }
        else if (event.key === 'Delete') { event.preventDefault(); remove(); }
    };
    name.oninput = update;
    name.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); activate(); } };
    const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopImmediatePropagation();
            if (busy) return;
            if (popupKind) dismissPopup(); else close();
        }
    };
    popup.oncancel = event => { event.preventDefault(); if (!busy) dismissPopup(); };
    dialog.addEventListener('keydown', event => event.stopPropagation());
    popup.addEventListener('keydown', event => event.stopPropagation());
    document.addEventListener('keydown', keydown, true);
    container.append(dialog);
    document.getElementById('ra2web-root')!.append(popup);
    const filesBackdrop = mountNativeUiBackdrop(panel, 'files', options.menuArt?.faction, options.menuArt?.background,
        () => popupKind ? 1 : 2);
    releases.push(filesBackdrop);
    document.exitPointerLock?.();
    void run(() => refresh()).then(() => { if (!closed && !popupKind) (saving ? name : list).focus(); });
    return () => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', keydown, true);
        for (const release of releases) release();
        releasePopup(); popup.close(); popup.remove(); dialog.remove();
    };
}
