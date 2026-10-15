import Phaser from 'phaser';
import { canPlay, run, settleRun, writeSave } from './storage.ts';

export interface SettingsSession {
  owner: Phaser.Scene;
  inputEnabled: boolean;
  keyboardEnabled: boolean | undefined;
  closing: boolean;
  returningToTitle: boolean;
  onParentShutdown: () => void;
}

const sessions = new WeakMap<Phaser.Game, SettingsSession>();

export function openSettings(owner: Phaser.Scene): void {
  if (!canPlay() || sessions.has(owner.game)) return;
  const session: SettingsSession = {
    owner,
    inputEnabled: owner.input.enabled,
    keyboardEnabled: owner.input.keyboard?.enabled,
    closing: false,
    returningToTitle: false,
    onParentShutdown: () => owner.game.scene.stop('Settings'),
  };
  sessions.set(owner.game, session);
  owner.input.enabled = false;
  if (owner.input.keyboard) owner.input.keyboard.enabled = false;
  owner.events.once(Phaser.Scenes.Events.SHUTDOWN, session.onParentShutdown);
  owner.scene.launch('Settings', session);
}

/** Settingsのshutdownで一度だけ呼び、親の終了時には復元しない。 */
export function releaseSettings(session: SettingsSession): void {
  const { owner } = session;
  const game = owner.game;
  owner.events.off(Phaser.Scenes.Events.SHUTDOWN, session.onParentShutdown);
  const restore = (): void => {
    game.events.off(Phaser.Core.Events.DESTROY, cancel);
    if (sessions.get(game) !== session) return;
    sessions.delete(game);
    if (session.returningToTitle || !owner.sys.isActive()) return;
    owner.input.enabled = session.inputEnabled;
    if (owner.input.keyboard && session.keyboardEnabled !== undefined) {
      owner.input.keyboard.resetKeys();
      owner.input.keyboard.enabled = session.keyboardEnabled;
    }
  };
  const cancel = (): void => {
    game.events.off(Phaser.Core.Events.POST_STEP, restore);
    sessions.delete(game);
  };
  game.events.once(Phaser.Core.Events.POST_STEP, restore);
  game.events.once(Phaser.Core.Events.DESTROY, cancel);
}

export function finishSettings(session: SettingsSession, toTitle = false): void {
  if (session.closing) return;
  session.closing = true;
  const { owner } = session;
  session.returningToTitle = toTitle && owner.scene.key !== 'Title';
  if (toTitle && canPlay()) {
    settleRun();
    if (run.state) writeSave(run.state);
  }
  owner.scene.stop('Settings');
  if (session.returningToTitle) owner.scene.start('Title');
}
