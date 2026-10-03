import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';
import { ACHIEVEMENTS_KEY, SAVE_KEY, SETTINGS_KEY } from './config.ts';
import { newState, type State, serialize } from './economy.ts';
import { platform } from './platform.ts';
import {
  clearSave,
  grantAchievements,
  initializeAchievements,
  initializeRun,
  initializeSoundSettings,
  loadSave,
  resetRun,
  run,
  setSoundEnabled,
  writeAchievements,
  writeSave,
  writeSoundSettings,
} from './storage.ts';

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
  run.settings.soundEnabled = true;
  run.achievements = {};
  run.accountedAtMs = 0;
  run.stormEndsAtMs = 0;
  run.frenzyMult = 1;
  run.frenzyEndsAtMs = 0;
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

test('音声設定はbooleanのみ復元し不正・欠落はON', () => {
  for (const raw of [null, '{', 'null', '[]', 'false', '0', '{}', '{"soundEnabled":"false"}', '{"soundEnabled":0}']) {
    if (raw === null) data.delete(SETTINGS_KEY);
    else data.set(SETTINGS_KEY, raw);
    run.settings.soundEnabled = false;
    initializeSoundSettings();
    assert.equal(run.settings.soundEnabled, true, String(raw));
  }
  for (const enabled of [true, false]) {
    data.set(SETTINGS_KEY, JSON.stringify({ soundEnabled: enabled, extra: 'ignored' }));
    initializeSoundSettings();
    assert.equal(run.settings.soundEnabled, enabled);
  }
});

test('タイトル相当の設定保存は進行と離席基準に触れず即時復元できる', () => {
  const s = newState();
  s.owned[0] = 4;
  s.lastSave = 1_000_000;
  data.set(SAVE_KEY, serialize(s));
  const raw = data.get(SAVE_KEY);
  run.accountedAtMs = 123;
  run.offline = 45;
  setSoundEnabled(false);
  assert.equal(writeSoundSettings(), true);
  assert.equal(data.get(SAVE_KEY), raw);
  assert.equal(run.state, null);
  assert.equal(run.accountedAtMs, 123);
  assert.equal(run.offline, 45);
  run.settings.soundEnabled = true;
  initializeSoundSettings();
  assert.equal(run.settings.soundEnabled, false);
  assert.equal(initializeRun(1_060_000), 60);
  assert.equal(initializeRun(1_060_001), 0);
});

test('設定変更とNEW RUNで進行・設定それぞれの保存値を保護', () => {
  const s = newState();
  s.scrap = 123;
  run.state = s;
  run.accountedAtMs = 1000;
  writeSave(s, 2000);
  const before = serialize(s);
  setSoundEnabled(false);
  writeSoundSettings();
  assert.equal(serialize(s), before);
  assert.equal(s.lastSave, 2000);
  assert.equal(data.get(SETTINGS_KEY), JSON.stringify({ soundEnabled: false }));
  const settings = data.get(SETTINGS_KEY);
  resetRun(1000);
  assert.equal(run.settings.soundEnabled, false);
  assert.equal(data.get(SETTINGS_KEY), settings);
  assert.equal(liveState().scrap, 0);
});

test('音声設定も非ownedで共有保存にアクセスせず一時プレイはライブ値維持', () => {
  for (const mode of ['blocked', 'ephemeral', 'released', 'acquiring'] as const) {
    calls.length = 0;
    run.mode = mode;
    run.settings.soundEnabled = false;
    initializeSoundSettings();
    setSoundEnabled(true);
    assert.equal(run.settings.soundEnabled, mode === 'ephemeral');
    assert.equal(writeSoundSettings(), false);
    assert.deepEqual(calls, []);
  }
  run.mode = 'ephemeral';
  setSoundEnabled(false);
  initializeSoundSettings();
  resetRun();
  assert.equal(run.settings.soundEnabled, false);
  assert.deepEqual(calls, []);
});

for (const failure of ['property', 'read', 'write']) {
  test(`音声設定の${failure}例外でも操作を維持`, () => {
    const fail = () => {
      throw new Error('denied');
    };
    if (failure === 'property') {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: fail });
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
          getItem: failure === 'read' ? fail : () => null,
          setItem: fail,
        },
      });
    }
    initializeSoundSettings();
    assert.equal(run.settings.soundEnabled, true);
    setSoundEnabled(false);
    assert.equal(writeSoundSettings(), false);
    assert.equal(run.settings.soundEnabled, false);
    assert.equal(run.state, null);
  });
}

test('goldの一時効果は保存せず、既存進行を再読込・新規ランで保持または解除する', () => {
  initializeRun(1000, 1000);
  const s = liveState();
  s.scrap = 777;
  s.total = 900;
  s.pick = 3;
  s.owned[0] = 4;
  run.frenzyMult = 777;
  run.frenzyEndsAtMs = 21000;
  writeSave(s, 1000, 1000);
  const saved = JSON.parse(data.get(SAVE_KEY) ?? '{}');
  assert.equal('frenzyMult' in saved, false);
  assert.equal('frenzyEndsAtMs' in saved, false);
  const before = calls.length;
  assert.equal(initializeRun(2000, 2000), 0);
  assert.equal(run.state, s);
  assert.equal(calls.length, before);
  run.state = null;
  initializeRun(1000, 1000);
  assert.equal(liveState().scrap, 777);
  assert.equal(liveState().pick, 3);
  assert.equal(liveState().owned[0], 4);
  assert.equal(run.frenzyMult, 1);
  assert.equal(run.frenzyEndsAtMs, 0);
  run.frenzyMult = 777;
  run.frenzyEndsAtMs = 21000;
  resetRun(1000);
  assert.equal(liveState().scrap, 0);
  assert.equal(run.frenzyMult, 1);
  assert.equal(run.frenzyEndsAtMs, 0);
});

test('実績は別キーで保存し、NEW RUNでも消えず、プラットフォームへ1回だけ通知する', () => {
  const reported: string[] = [];
  const original = platform.unlockAchievement;
  platform.unlockAchievement = (id) => reported.push(id);
  try {
    initializeRun(1000);
    const s = liveState();
    s.clicks = 100;
    assert.deepEqual(grantAchievements(5000), ['dig_100']);
    assert.deepEqual(run.achievements, { dig_100: 5000 });
    assert.deepEqual(JSON.parse(data.get(ACHIEVEMENTS_KEY) ?? 'null'), { dig_100: 5000 });
    assert.notEqual(data.get(ACHIEVEMENTS_KEY), data.get(SAVE_KEY), 'a different key from the save');
    assert.deepEqual(grantAchievements(6000), [], 'nothing new the second time');
    assert.deepEqual(reported, ['dig_100']);
    assert.equal(run.achievements.dig_100, 5000, 'the first unlock time is kept');

    resetRun(7000); // NEW RUN
    assert.equal(liveState().clicks, 0);
    assert.deepEqual(JSON.parse(data.get(ACHIEVEMENTS_KEY) ?? 'null'), { dig_100: 5000 });
    assert.deepEqual(grantAchievements(8000), [], 'a wiped run does not unlock it again');
    initializeAchievements();
    assert.deepEqual(run.achievements, { dig_100: 5000 }, 'and it is read back after a reload');
  } finally {
    platform.unlockAchievement = original;
  }
});

test('実績の読み込みは不正な値を捨て、既知のidだけ受け入れる', () => {
  for (const raw of [null, '{', 'null', '[]', '42', '"x"']) {
    if (raw === null) data.delete(ACHIEVEMENTS_KEY);
    else data.set(ACHIEVEMENTS_KEY, raw);
    run.achievements = { dig_100: 1 };
    initializeAchievements();
    assert.deepEqual(run.achievements, {}, String(raw));
  }
  data.set(
    ACHIEVEMENTS_KEY,
    JSON.stringify({ dig_100: 123, dig_1k: 'x', dig_10k: -5, crown_1: null, crown_2: 0, nope: 99, crown_3: 7.5 }),
  );
  initializeAchievements();
  assert.deepEqual(run.achievements, { dig_100: 123, crown_3: 7.5 });
});

test('一時プレイの実績はメモリだけに残し、保存領域に触れない', () => {
  run.mode = 'ephemeral';
  initializeRun(1000);
  liveState().clicks = 100;
  assert.deepEqual(grantAchievements(5000), ['dig_100']);
  assert.equal(writeAchievements(), false);
  initializeAchievements();
  assert.deepEqual(run.achievements, { dig_100: 5000 }, 'a restart in the same page keeps it');
  assert.deepEqual(calls, []);
  run.mode = 'blocked';
  run.state = null;
  assert.deepEqual(grantAchievements(), [], 'nothing to grant without a live run');
});
