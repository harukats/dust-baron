import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buyGen, newState, settleProduction } from './economy.ts';

test('経過時間・小数・同時刻・逆行を正確に精算する', () => {
  const s = newState();
  s.owned[0] = 1;
  const result = settleProduction(s, 1000, 61_000, 0);
  assert.equal(result.gain, 30);
  assert.equal(result.accountedAtMs, 61_000);
  assert.equal(s.scrap, 0, '純粋関数は入力を変更しない');
  assert.equal(settleProduction(s, result.accountedAtMs, 61_000, 0).gain, 0);
  const back = settleProduction(s, 61_000, 1000, 0);
  assert.equal(back.gain, 0);
  assert.equal(back.accountedAtMs, 61_000);
  assert.equal(settleProduction(s, 1000, 1500, 0).gain, 0.25);
});
test('既存砂嵐の有効区間だけ2倍、非表示の長時間も100%', () => {
  const s = newState();
  s.owned[1] = 1;
  assert.equal(settleProduction(s, 1000, 21_000, 6000).gain, 100);
  assert.equal(settleProduction(s, 6000, 21_000, 6000).gain, 60);
  assert.equal(settleProduction(s, 1000, 10_801_000, 0).gain, 43_200);
});
test('購入後の率は過去へ適用しない', () => {
  const s = newState();
  s.owned[0] = 1;
  s.scrap = 100;
  const before = settleProduction(s, 1000, 11_000, 0);
  assert.equal(before.gain, 5);
  buyGen(s, 0, 1);
  assert.equal(settleProduction(s, before.accountedAtMs, 21_000, 0).gain, 10);
});
