import './stub.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sideOf, splitLayout, splitRange, splitStep } from '../mods/gitview-diff/split.js';
const { splitRows, containsIndex, noteRange, displayRows } = await import('../mods/gitview-diff/diffview.js');
const { default: GitDiff } = await import('../mods/gitview-diff/main.js');

const rows = [
  { k: 'ctx', o: 1, n: 1, m: ' same' },
  { k: 'del', o: 2, m: '-old' }, { k: 'del', o: 3, m: '-extra' },
  { k: 'add', n: 2, m: '+new' }, { k: 'fold' },
  { k: 'add', n: 18, m: '+only' }, { k: 'ctx', o: 20, n: 19, m: ' end' },
];
const layout = splitLayout(rows);

test('split aligns a replacement and pads an unequal block without pairing across a fold', () => {
  assert.deepEqual(layout.lines.map(({ left, right }) => [left, right]),
    [[0, 0], [1, 3], [2, null], [4, 4], [null, 5], [6, 6]]);
  assert.deepEqual(layout.positions, [0, 1, 2, 1, 3, 4, 5]);
  assert.deepEqual(splitLayout([]).lines, []);
});

test('split keeps folds, notes, the composer and the truncation notice full-width', () => {
  const notes = [{ end: 0, text: 'file' }, { end: 3, oldSide: true, text: 'removed' }, { end: 2, text: 'changed' }];
  const output = splitRows({ rows, truncated: true }, layout, notes, 2);
  assert.deepEqual(output.map(d => d.note?.text ?? (d.pair ? 'pair' : d.row?.k ?? (d.composer ? 'compose' : 'cut'))),
    ['file', 'pair', 'pair', 'changed', 'pair', 'removed', 'compose', 'fold', 'pair', 'pair', 'cut']);
  assert.ok(containsIndex(output[2], 1) && containsIndex(output[2], 3));
  assert.ok(!containsIndex(output[4], null));
  assert.equal(displayRows({ rows }, notes, null).findIndex(d => d.note?.text === 'removed'), 4);
});

test('cursor navigation counts visible code lines, uses a real cell at padding and clamps at the ends', () => {
  assert.equal(splitStep(layout, 0, 1, 'right'), 3);
  assert.equal(splitStep(layout, 3, 1, 'right'), 2);
  assert.equal(sideOf(layout, 2, 'right'), 'left');
  assert.equal(splitStep(layout, 2, 1, 'right'), 4);
  assert.equal(splitStep(layout, 3, Infinity, 'right'), 6);
  assert.equal(splitStep(layout, 1, -Infinity, 'left'), 0);
});

test('notes use only selected-side text and preserve the old line number on offset context', () => {
  const right = splitRange(layout, 0, 3, 'right');
  assert.deepEqual(right, [0, 3]);
  assert.deepEqual(noteRange({ rows }, 0, 3, new Set(right), 'right'), { start: 1, end: 2, snippet: ' same\n+new\n' });
  assert.deepEqual(splitRange(layout, 2, 1, 'left'), [1, 2]);
  assert.equal(noteRange({ rows }, 6, 6, null, 'left').start, 20);
});

test('b toggles the diff without replacing its data or moving the source cursor', () => {
  const view = new GitDiff();
  Object.assign(view, { diff: { rows }, cursor: 3, anchor: null, split: false,
    scroll: { resetX() {} }, inPreview: () => false, ready: () => true });
  for (const expected of [true, false]) {
    assert.equal(view.key({ key: 'b', modifiers: {} }, {}), true);
    assert.equal(view.split, expected);
    assert.equal(view.cursor, 3);
    assert.equal(view.diff.rows, rows);
  }
});
