import { NoAction } from '@/game/action/NoAction';
import { GameStatus } from '@/game/Game';
import { GameSpeed } from '@/game/GameSpeed';
import { EventDispatcher } from '@/util/event';

export class SoloPlayTurnManager {
    private gameTurnMillis = 1000 / GameSpeed.BASE_TICKS_PER_SECOND;
    private errorState = false;
    private gameSpeedChanged = false;
    private paused = false;
    private campaignPaused = false;
    public readonly onActionsSent = new EventDispatcher<this, void>();

    private readonly onGameSpeedChanged = () => {
        this.gameSpeedChanged = true;
    };

    constructor(
        private readonly game: any,
        private readonly currentPlayer: any,
        private readonly inputActions: { dequeueAll(): any[] },
        private readonly actionLogger?: { debug(message: string): void },
        private readonly replayRecorder?: { recordActions?(tick: number, actions: any[]): void },
        private readonly saveJournal?: { beforeTick(game: any, actions: any[]): void }
    ) { }

    init(): void {
        this.game.desiredSpeed.onChange.subscribe(this.onGameSpeedChanged);
        this.computeGameTurn(this.game.speed.value);
    }

    private computeGameTurn(speed: number): void {
        this.gameTurnMillis = 1000 / (speed * GameSpeed.BASE_TICKS_PER_SECOND);
    }

    setErrorState(): void {
        this.errorState = true;
        this.updatePlayClock();
    }

    getErrorState(): boolean {
        return this.errorState;
    }
    setCampaignPaused(paused: boolean): void {
        if (!this.game.campaign) throw new Error('Campaign pause requires a campaign world');
        this.campaignPaused = paused;
        this.updatePlayClock();
    }

    getTurnMillis(): number {
        return this.gameTurnMillis;
    }
    isSimulationPaused(): boolean { return this.errorState || this.paused || this.campaignPaused; }

    setPaused(paused: boolean): void {
        this.paused = paused;
        this.updatePlayClock();
        if (!paused) this.computeGameTurn(this.game.speed.value);
    }

    doGameTurn(_timestamp: number): boolean {
        this.updatePlayClock();
        if (this.errorState || this.paused) {
            return false;
        }
        if (this.campaignPaused) return true;

        if (this.game.status !== GameStatus.Ended && !this.game.campaign?.failure) {
            let actions = this.inputActions.dequeueAll();
            actions.forEach(action => action.player = this.currentPlayer);
            this.saveJournal?.beforeTick(this.game, actions);
            if (actions.length) {
                this.replayRecorder?.recordActions?.(this.game.currentTick, actions);
                this.onActionsSent.dispatch(this);
            } else {
                actions = [new NoAction()];
            }
            this.processActions(actions);
            this.game.campaign?.journal.record(this.game, this.currentPlayer, actions);
        }

        this.game.update();
        this.updatePlayClock();

        if (this.gameSpeedChanged) {
            this.game.speed.value = this.game.desiredSpeed.value;
            this.computeGameTurn(this.game.speed.value);
            this.gameSpeedChanged = false;
        }

        return true;
    }

    private processActions(actions: any[]): void {
        actions.forEach((action) => {
            action.player = this.currentPlayer;
            action.process();
            const printable = action.print?.();
            if (printable) {
                this.actionLogger?.debug(`(${action.player.name})@${this.game.currentTick}: ${printable}`);
            }
        });
    }

    private updatePlayClock(): void {
        const campaign = this.game.campaign;
        (this.game.playTime ?? campaign?.playTime)?.setRunning(!this.errorState && !this.paused && !this.campaignPaused
            && !campaign?.restoring && !campaign?.result && !campaign?.failure && this.game.status === GameStatus.Started);
    }

    dispose(): void {
        (this.game.playTime ?? this.game.campaign?.playTime)?.setRunning(false);
        this.game.desiredSpeed.onChange.unsubscribe(this.onGameSpeedChanged);
    }
}
