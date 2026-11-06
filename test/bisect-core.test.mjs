import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bisect,
  compareVersions,
  groupRuns,
  isValidPackageName,
  versionsInRange,
} from '../src/bisect-core.mjs';

const vs = ['1.0.0', '1.0.1', '1.1.0', '1.2.0', '1.10.0', '2.0.0'];

test('versions sort numerically, not as text', () => {
  assert.ok(compareVersions('1.10.0', '1.2.0') > 0);
});

test('range is inclusive and skips pre-releases', () => {
  const all = ['1.0.0', '2.0.0-beta.1', '1.1.0', '2.0.0', '3.0.0'];
  assert.deepEqual(versionsInRange(all, '1.1.0', '2.0.0'), ['1.1.0', '2.0.0']);
});

test('finds the first changed version wherever it sits', async () => {
  for (let i = 1; i < vs.length; i++) {
    const r = await bisect(vs, async (v) => (vs.indexOf(v) >= i ? 'bad' : 'ok'));
    assert.equal(r.firstChanged, vs[i]);
    assert.equal(r.lastSame, vs[i - 1]);
  }
});

test('reports no change when every checked version matches', async () => {
  const r = await bisect(vs, async () => 'same');
  assert.equal(r.changed, false);
});

test('uses far fewer runs than testing every version', async () => {
  const many = Array.from({ length: 256 }, (_, i) => `1.0.${i}`);
  const r = await bisect(many, async (v) => (many.indexOf(v) >= 100 ? 'bad' : 'ok'));
  assert.equal(r.firstChanged, '1.0.100');
  assert.ok(r.tested.size <= 14);
});

test('detects behaviour that changed and later changed back', async () => {
  const many = Array.from({ length: 57 }, (_, i) => `4.0.${i}`);
  const r = await bisect(many, async (v) => {
    const i = many.indexOf(v);
    return i >= 20 && i < 56 ? 'other' : 'base';
  });
  assert.equal(r.changed, true);
  assert.equal(r.returned, true);
  assert.equal(r.firstChanged, '4.0.20');
});

test('groups a sweep into runs of equal results', () => {
  assert.deepEqual(groupRuns(['1.0.0', '1.0.1', '1.0.2'], ['a', 'a', 'b']), [
    { from: '1.0.0', to: '1.0.1', result: 'a' },
    { from: '1.0.2', to: '1.0.2', result: 'b' },
  ]);
});

test('accepts normal package names', () => {
  for (const name of ['zod', 'hono', '@scope/pkg', 'lodash.merge']) {
    assert.ok(isValidPackageName(name), name);
  }
});

test('rejects names that could reach a shell', () => {
  for (const name of ['zod & calc', 'zod;rm', '$(whoami)', '`x`', '../x', '-g', 'a b', '']) {
    assert.equal(isValidPackageName(name), false, name);
  }
});
