import { reset, world } from './stub.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
const { closeCurrent } = await import('../mods/gitview-tab/close.js');

function scene() {
  reset({ spaces: [{ id:'s', tabs:['source','neighbor','review'].map(id=>({id})) }], panes:[{tab:'source',pane:'right',terminal:'agent'}], focused:{space:'s',tab:'review'} });
  Object.assign(world.shared, {'gitview.own':{s:'review'}, 'gitview.origins':{s:'source'}, 'gitview.ownSource':{s:{tab:'review',location:{terminal:'agent'}}}});
}
test('closing review returns to the source terminal, not its tab neighbor', async () => {
  scene(); await closeCurrent('s','review');
  assert.deepEqual(world.runs,[['tab.close',{id:'review',confirmed:true}],['tab.select',{id:'source'}],['pane.focus',{pane:'right'}]]);
});
test('ordinary tab close keeps native confirmation; a vanished origin is not recreated', async () => {
  scene(); world.focused.tab='neighbor'; await closeCurrent('s','neighbor');
  assert.deepEqual(world.runs,[['tab.close',{id:'neighbor'}]]);
  scene(); world.spaces[0].tabs.shift(); await closeCurrent('s','review');
  assert.deepEqual(world.runs,[['tab.close',{id:'review',confirmed:true}]]);
});
