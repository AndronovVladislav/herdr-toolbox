const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = import('../mods/taktik/styles.js');
const timer = import('../mods/taktik/timer.js');
const M = 60000;

test('both ribbons follow the same phase clock, including pause, extension and overtime', async () => {
  const { appearance, nextStyle } = await api;
  const { initial, step } = await timer;
  let s = step(initial(), 0, 'toggle').state;
  const before = appearance(s, 10*M);
  s = step(s, 10*M, 'extend').state;
  assert.equal(appearance(s, 10*M).progress, before.progress);
  assert.equal(before.progress, 0.4);
  assert.equal(appearance(s, 26*M).overtime, 0.2);
  s = step(s, 26*M, 'toggle').state;
  assert.deepEqual(appearance(s, 26*M), appearance(s, 99*M));
  assert.equal(appearance(s, 99*M).status, 'paused');
  assert.deepEqual(['ribbon','recorder'].map(nextStyle), ['recorder','ribbon']);
});

test('minute cells, cursor and overtime tail use independent scales', async () => {
  const { appearance, drawing } = await api, { initial, step } = await timer;
  const start=step(initial(),0,'toggle').state, extended=step(start,12*M,'extend').state;
  const a=appearance(start,12*M), sections='[#####] [#####] [##...] [.....] [.....]';
  assert.equal(drawing('ribbon',a)[0],sections);
  assert.equal(drawing('ribbon',a,true).join(' '),sections);
  assert.equal(drawing('recorder',a)[2].trimEnd(), '='.repeat(12)+'^'+'.'.repeat(13));
  for(const style of ['ribbon','recorder']) for(const small of [false,true]) {
    const base=drawing(style,a,small).map(s=>s.trimEnd());
    const extra=drawing(style,appearance(extended,12*M),small);
    assert.deepEqual(extra.slice(0,base.length).map(s=>s.trimEnd()),base);
    assert.match(extra.at(-1),/[/]{5}/);
    const late=drawing(style,appearance(extended,27*M),small);
    assert.ok(late.at(-1).includes('##///'));
    if(small) assert.ok(late.every(row=>row.length<=7));
  }
});

test('waiting and breaks have explicit states, not just different colors', async () => {
  const { appearance } = await api;
  const { initial, step } = await timer;
  const s = step(initial(), 0, 'toggle').state;
  const rest = step(s, 25*M).state;
  assert.equal(appearance(rest, 27.5*M).progress, 0.5);
  assert.equal(appearance(rest, 27.5*M).rest, true);
  assert.equal(appearance(step(rest, 30*M).state, 50*M).status, 'ready');
});
