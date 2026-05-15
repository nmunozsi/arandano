'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rules, MAPPING } = require('../rules.cjs');

const parse = (header) => ({ header });

test('gitmoji-leading: accepts curated shortcode + conventional shape', () => {
  const [ok] = rules['gitmoji-leading'](parse(':sparkles: feat(cli): add flag'));
  assert.equal(ok, true);
});

test('gitmoji-leading: rejects missing emoji', () => {
  const [ok, msg] = rules['gitmoji-leading'](parse('feat(cli): add flag'));
  assert.equal(ok, false);
  assert.match(msg, /must match/);
});

test('gitmoji-leading: rejects uncurated emoji', () => {
  const [ok, msg] = rules['gitmoji-leading'](parse(':rocket: feat(cli): add flag'));
  assert.equal(ok, false);
  assert.match(msg, /not in the curated set/);
});

test('gitmoji-type-match: accepts matching pair', () => {
  const [ok] = rules['gitmoji-type-match'](parse(':bug: fix(core): correct off-by-one'));
  assert.equal(ok, true);
});

test('gitmoji-type-match: rejects wrong pair', () => {
  const [ok, msg] = rules['gitmoji-type-match'](parse(':sparkles: fix(core): nope'));
  assert.equal(ok, false);
  assert.match(msg, /must pair with type `feat`/);
});

test('gitmoji-type-match: skips when leading rule already failed', () => {
  const [ok] = rules['gitmoji-type-match'](parse('feat(cli): no emoji'));
  assert.equal(ok, true);
});

test('curated mapping: every aliased fix-type emoji maps to fix', () => {
  for (const e of [':bug:', ':ambulance:', ':lock:']) assert.equal(MAPPING[e], 'fix');
});
