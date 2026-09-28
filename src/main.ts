import Phaser from 'phaser';
import { AUTOSAVE_MS, HEIGHT, SESSION_UI, WIDTH } from './config.ts';
import { Boot } from './scenes/Boot.ts';
import { Game } from './scenes/Game.ts';
import { Preloader } from './scenes/Preloader.ts';
import { Title } from './scenes/Title.ts';
import { Victory } from './scenes/Victory.ts';
import { acquireSession, type PlaySession } from './session.ts';
import { initializeRun, run, settleRun, writeSave } from './storage.ts';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  title: 'Dust Baron',
  backgroundColor: '#1a0f0a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game-container',
    width: WIDTH,
    height: HEIGHT,
  },
  scene: [Boot, Preloader, Title, Game, Victory],
};
// ライブ時間は単調増加時計に固定し、NTP補正で生産や一時効果を失わない。
const clockEpoch = Date.now();
const clockOrigin = performance.now();
run.now = () => clockEpoch + performance.now() - clockOrigin;
let game: Phaser.Game | null = null;
let session: PlaySession | null = null;
let disposed = false;
let wasTemporary = false;
let generation = 0;
let stopping: Promise<void> = Promise.resolve();
const notice = document.getElementById('session-notice') as HTMLElement;

function showNotice(mode: string): void {
  notice.replaceChildren();
  notice.dataset.mode = mode;
  notice.hidden = mode !== 'blocked';
  if (notice.hidden) return;
  const heading = document.createElement('h1');
  heading.textContent = SESSION_UI.blockedTitle;
  const explanation = document.createElement('p');
  explanation.textContent = SESSION_UI.blockedBody;
  notice.append(heading, explanation);
}
async function boot(): Promise<void> {
  const current = ++generation;
  await stopping;
  const acquired = wasTemporary ? { mode: 'ephemeral' as const, async release() {} } : await acquireSession();
  if (disposed || current !== generation) {
    await acquired.release();
    return;
  }
  session = acquired;
  run.mode = acquired.mode;
  wasTemporary = acquired.mode === 'ephemeral';
  showNotice(acquired.mode);
  if (acquired.mode === 'blocked') return;
  if (acquired.mode === 'owned') run.state = null;
  else initializeRun(Date.now(), run.now());
  settleRun();
  game = new Phaser.Game(config);
  if (import.meta.env.DEV) {
    game.registry.set('run', run);
    (window as unknown as { game: Phaser.Game | null }).game = game;
  }
}
function flush(): void {
  settleRun();
  if (run.state) writeSave(run.state);
}
function stop(): void {
  ++generation;
  flush();
  const previous = session;
  session = null;
  if (game) {
    // destroyは通常次のフレームまで遅延する。非表示時も破棄完了後にロックを解放する。
    game.destroy(true);
    game.headlessStep(performance.now(), 0);
    game = null;
    if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game | null }).game = null;
  }
  run.mode = 'released';
  stopping = previous ? previous.release() : Promise.resolve();
}
const onVisibility = (): void => {
  flush();
};
const onPageHide = (): void => {
  stop();
};
const onPageShow = (event: PageTransitionEvent): void => {
  if (event.persisted) void boot();
};
document.addEventListener('visibilitychange', onVisibility);
window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);
const autosave = setInterval(flush, AUTOSAVE_MS);
void boot();
if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    disposed = true;
    clearInterval(autosave);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    stop();
    await stopping;
  });
}
