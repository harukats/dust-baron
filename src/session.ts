import { PLAY_LOCK } from './config.ts';

export type SessionMode = 'acquiring' | 'owned' | 'blocked' | 'ephemeral' | 'released';
export interface PlaySession {
  mode: SessionMode;
  reason?: 'missing' | 'exception';
  release(): Promise<void>;
}

/** API呼び出しは起動時だけ。取得通知と保持Promiseを分離する。 */
export async function acquireSession(): Promise<PlaySession> {
  let locks: LockManager | undefined;
  try {
    locks = navigator.locks;
  } catch {
    return temporary('exception');
  }
  if (!locks) return temporary('missing');
  let unlock!: () => void;
  let announce!: (session: PlaySession) => void;
  const held = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const result = new Promise<PlaySession>((resolve) => {
    announce = resolve;
  });
  let request: Promise<void> = Promise.resolve();
  const session: PlaySession = {
    mode: 'acquiring',
    async release() {
      session.mode = 'released';
      unlock();
      await request.catch(() => {});
    },
  };
  try {
    request = locks.request(PLAY_LOCK, { mode: 'exclusive', ifAvailable: true }, (lock) => {
      session.mode = lock ? 'owned' : 'blocked';
      announce(session);
      return lock ? held : undefined;
    });
    void request.catch(() => announce(temporary('exception')));
  } catch {
    return temporary('exception');
  }
  return result;
}
function temporary(reason: 'missing' | 'exception'): PlaySession {
  const session: PlaySession = {
    mode: 'ephemeral',
    reason,
    async release() {
      session.mode = 'released';
    },
  };
  return session;
}
