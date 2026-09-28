import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { SAVE_KEY } from './config.ts';
import { newState, type State, serialize } from './economy.ts';
import { clearSave, initializeRun, loadSave, resetRun, run, writeSave } from './storage.ts';

function liveState(): State {
  assert.ok(run.state);
  return run.state;
}

let data: Map<string, string>;
let calls: string[];
beforeEach(() => {
  data = new Map();
  calls = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => {
        calls.push('get');
        return data.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        calls.push('set');
        data.set(key, value);
      },
      removeItem: (key: string) => {
        calls.push('remove');
        data.delete(key);
      },
    },
  });
  run.now = () => 1000;
  run.mode = 'owned';
  run.state = null;
  run.accountedAtMs = 0;
  run.stormEndsAtMs = 0;
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});
test('owned以外は共有保存にアクセスしない', () => {
  for (const mode of ['blocked', 'ephemeral', 'released', 'acquiring'] as const) {
    run.mode = mode;
    run.state = null;
    assert.equal(loadSave(), null);
    assert.equal(writeSave(newState(), 1000), false);
    assert.equal(clearSave(), false);
  }
  assert.deepEqual(calls, []);
  run.mode = 'ephemeral';
  assert.equal(initializeRun(1000), 0);
  assert.ok(run.state);
  run.state.scrap = 123;
  initializeRun(2000);
  assert.equal(liveState().scrap, 123);
  resetRun(3000);
  assert.equal(liveState().scrap, 0);
  assert.deepEqual(calls, []);
});
test('保存成功時だけlastSave更新、失敗でも同じrunを維持', () => {
  const s = newState();
  s.scrap = 12;
  run.state = s;
  run.accountedAtMs = 1000;
  assert.equal(writeSave(s, 2000), true);
  assert.equal(s.lastSave, 2000);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('denied');
    },
  });
  assert.equal(writeSave(s, 3000), false);
  assert.equal(s.lastSave, 2000);
  assert.equal(run.state, s);
  assert.equal(loadSave(), null);
  assert.equal(clearSave(), false);
});
test('離席29/30/7200/7201秒の境界と即時保存、一度だけ', () => {
  const now = 10_000_000;
  for (const seconds of [29, 30, 7200, 7201]) {
    const s = newState();
    s.owned[0] = 4;
    s.lastSave = now - seconds * 1000;
    data.set(SAVE_KEY, serialize(s));
    run.state = null;
    const gain = initializeRun(now);
    assert.equal(gain, seconds < 30 ? 0 : Math.min(seconds, 7200));
    assert.equal(liveState().scrap, gain);
    assert.equal(JSON.parse(data.get(SAVE_KEY) ?? '{}').lastSave, now);
    assert.equal(initializeRun(now + 1000), 0);
  }
});
test('無効・未来日時では離席0、読み取り不能でも初期化できる', () => {
  for (const lastSave of [0, -1, 'bad', 11_000_000]) {
    data.set(SAVE_KEY, JSON.stringify({ ...newState(), owned: [4, 0, 0, 0, 0, 0], lastSave }));
    run.state = null;
    assert.equal(initializeRun(10_000_000), 0);
    assert.equal(liveState().owned[0], 4);
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('denied');
    },
  });
  run.state = null;
  assert.equal(initializeRun(10_000_000), 0);
  assert.equal(liveState().scrap, 0);
});

test('稼働中の単調時間と保存日時を分離し、実日時の逆行でも収入を失わない', () => {
  const s = newState();
  s.owned[0] = 4;
  run.state = s;
  run.accountedAtMs = 1_000_000;
  run.now = () => 1_000_000;
  writeSave(s, 100_000);
  run.now = () => 1_060_000;
  writeSave(s, 90_000);
  assert.equal(s.scrap, 120);
  assert.equal(s.lastSave, 90_000);
  assert.equal(run.accountedAtMs, 1_060_000);
});
