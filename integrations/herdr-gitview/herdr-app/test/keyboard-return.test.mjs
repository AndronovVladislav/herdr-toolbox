import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reset, world } from './stub.mjs';
const { default: GitList } = await import('../mods/gitview/main.js');

test('drawing the selected list with no keyboard focus schedules a repair', () => {
  const pane = { tab: 'tab1', pane: 'p1', mod: 'gitview' };
  reset({ focused: pane, panes: [pane] });
  world.window = { active: true };
  try {
    const view = Object.assign(new GitList(), {
      place: { takesKeyboard: true, tab: () => pane.tab, frame: el => el },
      handle: { is_focused: () => false }, stale: () => false,
      notes: () => [], tr: { drew() {} }, mode: 'files', flash: {},
      loads: { busy: () => false, shown: () => false },
    });
    const jobs = [];
    assert.ok(view.draw({ spawn: fn => jobs.push(fn) }));
    assert.equal(jobs.length, 1);
    assert.equal(view.keyRepair.pane, pane.pane);
  } finally { delete world.window; }
});
const { restorePaneKeys } = await import('../mods/gitview/modkit.js');

async function check(states, leave=false) {
  let target='p', held=false, jobs=[], reads=0;
  const view={handle:{is_focused:()=>held,focus:()=>{held=true;}}};
  const cx={spawn:f=>jobs.push(f),sleep:async()=>{},notify(){}};
  const observe=()=>restorePaneKeys(view,cx,()=>target,async()=>{if(leave)target=null; return states[reads++];});
  observe(); observe();
  for(const f of jobs) await f(cx);
  return [held,reads,jobs.length];
}
const shown = {focused_pane:'p',overlays:[]};
test('a selected mod pane takes keys once, after the launcher closes', async()=>{
  assert.deepEqual(await check([{...shown,overlays:['gitview-tab']},shown]),[true,2,1]);
});
test('never take keys from dialogs, another pane or a target left while checking', async()=>{
  for(const snapshot of [null,{...shown,overlays:['palette']},{...shown,focused_pane:'other'}])
    assert.deepEqual(await check([snapshot]),[false,1,1]);
  assert.deepEqual(await check([shown],true),[false,1,1]);
});
