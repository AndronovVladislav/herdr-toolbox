const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const api = import('../mods/taktik/timer.js');
const M = 60000;

test('extend before the warning reschedules it; extend afterwards repeats it and preserves overtime', async () => {
  const { initial, step, clock } = await api;
  let s = step(initial(), 0, 'toggle').state;
  s = step(s, 10*M, 'extend').state;
  assert.equal(step(s, 20*M).signal, null);
  let r = step(s, 25*M);
  assert.equal(r.signal, 'focus-warning');
  assert.equal(clock(r.state, 26*M), '+01:00');
  s = step(r.state, 26*M, 'extend').state;
  r = step(s, 30*M);
  assert.equal(r.signal, 'focus-warning');
  assert.equal(step(r.state, 30*M+300).signal, null);
  r = step(r.state, 35*M);
  assert.equal(r.signal, 'break-start');
  assert.equal(r.state.lastFocus, 35*M);
  assert.equal(r.state.deadline, 40*M);
});

test('pause freezes elapsed focus and restores the remainder across midnight', async () => {
  const { initial, step, restore, clock } = await api;
  let r = step(initial(), 1000, 'toggle');
  r = step(r.state, 1000+12*M, 'toggle');
  assert.equal(r.events.at(-1).elapsed, 12*M);
  const paused = restore(JSON.stringify(r.state));
  assert.equal(clock(paused, 86400000), '13:00');
  r = step(paused, 86400000, 'toggle');
  assert.equal(r.state.deadline, 86400000 + 13*M);
  assert.equal(r.events.at(-1).type, 'resume');
});

test('sleep across both deadlines records planned boundaries but delivers only the invitation', async () => {
  const { initial, step } = await api;
  const s = step(initial(), 0, 'toggle').state;
  const r = step(s, 60*M);
  assert.equal(r.signal, 'focus-ready');
  assert.deepEqual(r.events.filter(e => e.type === 'end').map(e => [e.phase, e.at]), [['focus',25*M],['short',30*M]]);
  assert.deepEqual(r.events.filter(e => e.type === 'signal').map(e => [e.signal,e.at,e.deliveredAt]), [
    ['focus-warning',20*M,null],['break-start',25*M,null],['break-warning',29*M,null],['focus-ready',30*M,60*M],
  ]);
  assert.equal(r.state.deadline, null);
  assert.equal(r.state.round, 2);
  assert.equal(step(r.state, 61*M).events.length, 0);
  assert.equal(step(r.state, 62*M,'toggle').signal, null);
});

test('fourth focus triggers a 15-minute break and warns one minute before its end', async () => {
  const { initial, step } = await api;
  let s = initial(), now = 0;
  for (let round=1; round<=4; round++) {
    s = step(s, now, 'toggle').state;
    now += 25*M;
    let r = step(s, now);
    assert.equal(r.signal, 'break-start');
    assert.equal(r.state.phase, round === 4 ? 'long' : 'short');
    now += (round === 4 ? 15 : 5)*M;
    r = step(r.state, now-M);
    assert.equal(r.signal, 'break-warning');
    s = step(r.state, now).state;
  }
  assert.equal(s.round, 1);
});

test('migration preserves deadline and paused remainder, invalid state falls back to idle', async () => {
  const { initial, restore, step, clock } = await api;
  const legacy = {phase:'focus',round:1,left:25*M,deadline:25*M};
  assert.equal(step(restore(JSON.stringify(legacy)), 25*M).signal, 'break-start');
  assert.equal(clock(restore(JSON.stringify({...legacy,left:8*M,deadline:null})), 50*M), '08:00');
  for (const v of [null,'{','{}']) assert.deepEqual(restore(v),initial());
});

test('reset abandons a running or paused interval, not the round or history', async () => {
  const { initial, step, clock } = await api;
  const focus = step(initial(), 0, 'toggle').state;
  const extended = step(focus, 21*M, 'extend').state;
  const paused = step(extended, 26*M, 'toggle').state;
  for (const s of [extended, paused]) {
    const r = step(s, 26*M, 'reset');
    assert.equal(r.signal, null);
    assert.deepEqual(r.state, initial());
    assert.equal(r.events.at(-1).type, 'reset');
    assert.equal(r.events.at(-1).elapsed, 26*M);
    assert.equal(step(r.state, 27*M, 'reset').events.length, 0);
  }
  const rest = step({ ...focus, round: 4 }, 25*M).state;
  const r = step(rest, 27*M, 'reset');
  assert.equal(clock(r.state, 28*M), '15:00');
  assert.equal(r.state.deadline, null);
  assert.equal(r.state.round, 4);
  assert.equal(r.state.lastFocus, 25*M);
});

test('cycle reset returns running, paused and waiting rounds to idle focus one without an end or signal', async () => {
  const { initial, step, canResetCycle } = await api;
  const focus = step({...initial(), round:4},0,'toggle').state;
  const extended = step(focus,10*M,'extend').state;
  const rest = step(extended,30*M).state;
  const paused = step(rest,32*M,'toggle').state;
  for(const s of [extended, rest, paused, {...initial(), round:2}]) {
    assert.ok(canResetCycle(s));
    const result = step(s,s.phase==='focus'?12*M:32*M,'reset-cycle');
    assert.deepEqual(result.state,initial());
    assert.equal(result.signal,null);
    assert.deepEqual(result.events.map(e=>e.type),['reset-cycle']);
    assert.equal(result.events[0].round,s.round);
  }
  assert.deepEqual(step(paused,99*M,'reset-cycle').events.map(e=>e.elapsed),[2*M]);
  assert.equal(canResetCycle(initial()),false);
  assert.deepEqual(step(initial(),0,'reset-cycle').events,[]);
});

test('cycle reset after a missed deadline preserves completed boundaries without playing stale cues', async () => {
  const { initial, step } = await api;
  const focus=step(initial(),0,'toggle').state;
  const r=step(focus,26*M,'reset-cycle');
  assert.deepEqual(r.state,initial());
  assert.equal(r.signal,null);
  assert.deepEqual(r.events.filter(e=>e.type==='end').map(e=>e.at),[25*M]);
  assert.equal(r.events.at(-1).elapsed,M);
  assert.equal(r.events.at(-1).phase,'short');
  assert.ok(r.events.filter(e=>e.type==='signal').every(e=>e.deliveredAt===null));
});

test('layout places Taktik last in the sidebar', () => {
  const layout = JSON.parse(readFileSync(resolve(__dirname, '../layouts/herdr-toolbox.json')));
  const items = layout.children.find(n => n.id === 'sidebar').children;
  const i = items.findIndex(n => n.content?.mod === 'taktik');
  assert.equal(items[i - 1]?.id, 'sidebar-lists');
  assert.equal(i, items.length - 1);
  assert.equal(items[i].hidden, true);
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../mods/taktik/mod.json')));
  assert.equal(manifest.place, 'none');
  assert.ok(manifest.palette.some(entry => entry.command === 'layout.toggle' && entry.args.id === items[i].id));
});
