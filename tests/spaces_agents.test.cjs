const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('mods/spaces-agents/main.js', 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export default class/, 'class').replace(/export function /g, 'function ');
const { agentsForSpace, agentName, agentOrder } = vm.runInNewContext(source + '\n({agentsForSpace, agentName, agentOrder})', { View: class {} });

// A small view fake records styles without starting Herdr.
function renderRows(active, tree = null, count = 1, activeSpace = 'one', focusSpace = activeSpace) {
  const elements = [];
  const commands = [];
  const saved = {};
  function element() {
    const styles = {};
    const node = new Proxy(styles, { get(target, key) {
      if (key === 'when') return (condition, apply) => { if (condition) apply(node); return node; };
      return (...args) => {
        const name = key === 'on_mouse_down' || key === 'on_mouse_up' ? key + args[0] : key;
        target[name] = args;
        return node;
      };
    } });
    elements.push(styles);
    return node;
  }
  const space = { id: 'one', name: 'Project', tabs: [], active: activeSpace === 'one' };
  const empty = { id: 'empty', name: 'Empty', tabs: [], active: activeSpace === 'empty' };
  const Spaces = vm.runInNewContext(source + '\nSpaces', {
    View: class {}, h_flex: element, v_flex: element, div: element, svg: element,
    agents: () => Array.from({ length: count }, (_, index) => ({
      address: index ? `agent-${index}` : 'agent', pane: `pane-${index}`, space: 'one',
      pane_name: index ? `Task ${index}` : 'Task', status: 'working',
    })),
    terminals: () => [], spaces: () => [space, empty], machines: () => [],
    focused: () => focusSpace === null ? null : ({ agent: active, space: focusSpace }), shared: () => ({}),
    openOverlay: menu => commands.push(['menu', menu]), run: (...args) => commands.push(args), localStorage: { setItem: (key, value) => { saved[key] = value; } },
  });
  const view = new Spaces();
  Object.assign(view, {
    ordered: () => [{ w: space, i: 0, g: null, tree }, { w: empty, i: 1, g: null, tree: null }],
    foldedAgents: new Set(), machines: [], reconnecting: {}, pressed: null, shown: new Set(['one', 'empty']),
  });
  view.grouped({ foreground: 'bright', muted: 'muted', dim: 'dim', accent: 'accent', selected: 'selected' }, false);
  Object.assign(elements, { view, commands, saved });
  return elements;
}

test('space_heading__stronger_than_agent__keeps_readable_text', () => {
  // Ожидание: название спейса полужирное, у группы есть отступ, а текст агента остаётся 12 px.
  const elements = renderRows(null);
  const heading = elements.find(e => e.child?.[0] === 'Project');
  assert.ok(heading.font_bold);
  assert.ok(elements.find(e => e.id?.[0] === 'space-one').mt[0] > 0);
  assert.equal(elements.find(e => e.child?.[0] === 'Task').text_size[0], 12);
  assert.ok(!elements.some(e => e.child?.[0] === '>_'));
});

test('focused_agent__blue_fill_without_stripe__only_for_active_agent', () => {
  // Ожидание: только активный агент получает контрастный текст и заливку, без акцентной полоски.
  const active = renderRows('agent');
  const inactive = renderRows(null);
  assert.equal(active.find(e => e.id?.[0] === 'agent-agent').bg?.[0], '#5b8def26');
  assert.equal(inactive.find(e => e.id?.[0] === 'agent-agent').bg, undefined);
  assert.equal(active.find(e => e.child?.[0] === 'Task').text_color[0], 'bright');
  assert.equal(inactive.find(e => e.child?.[0] === 'Task').text_color[0], 'muted');
  assert.ok(!active.some(e => e.w?.[0] === 2 && e.bg?.[0] === 'accent'));
  assert.ok(!inactive.some(e => e.w?.[0] === 2 && e.bg?.[0] === 'accent'));
});

test('empty_space_selected__stale_agent_focus__only_empty_space_highlighted', () => {
  // Ожидание: выбор пустого спейса снимает заливку и яркий текст с агента предыдущего спейса.
  for (const focusSpace of ['one', 'empty', null]) {
    const elements = renderRows('agent', null, 1, 'empty', focusSpace);
    assert.equal(elements.find(e => e.id?.[0] === 'space-empty').bg?.[0], 'selected');
    assert.equal(elements.find(e => e.id?.[0] === 'space-one').bg, undefined);
    assert.equal(elements.find(e => e.id?.[0] === 'agent-agent').bg, undefined);
    assert.equal(elements.find(e => e.child?.[0] === 'Task').text_color[0], 'muted');
  }
});

test('compact_sidebar__empty_space_selected__only_active_space_highlighted', () => {
  // Ожидание: в узкой панели выбран только пустой спейс, прежний спейс не выделен.
  const elements = renderRows('agent', null, 1, 'empty', 'one');
  const rows = elements.view.ordered();
  for (const row of rows) elements.view.compact(row, { selected: 'selected', muted: 'muted' });
  assert.equal(elements.findLast(e => e.id?.[0] === 'space-empty').bg?.[0], 'selected');
  assert.equal(elements.findLast(e => e.id?.[0] === 'space-one').bg, undefined);
});

test('active_space__focus_elsewhere_or_missing__agent_not_highlighted', () => {
  // Ожидание: активный спейс выделен, но агент без актуального фокуса не имеет заливки.
  for (const focusSpace of ['empty', null]) {
    const elements = renderRows('agent', null, 1, 'one', focusSpace);
    assert.equal(elements.find(e => e.id?.[0] === 'space-one').bg?.[0], 'selected');
    assert.equal(elements.find(e => e.id?.[0] === 'agent-agent').bg, undefined);
    assert.equal(elements.find(e => e.child?.[0] === 'Task').text_color[0], 'muted');
  }
});

test('agent_tree__last_branch__ends_at_row_center_and_follows_worktree_indent', () => {
  // Ожидание: последняя ветвь заканчивается в середине строки и сдвигается под вложенный worktree.
  for (const [tree, left] of [[null, 17], ['└─', 37]]) {
    const elements = renderRows(null, tree);
    const line = elements.find(e => e.id?.[0] === 'agent-tree-agent');
    assert.equal(line.left[0], left);
    assert.equal(line.top[0], 0);
    assert.equal(line.bottom[0], 13);
    const branch = elements.find(e => e.id?.[0] === 'agent-branch-agent');
    assert.equal(branch.left[0], left);
    assert.equal(branch.top[0], 13);
  }
});

test('agent_tree__multiple_agents__line_continues_until_last_agent', () => {
  // Ожидание: у промежуточного агента линия проходит до низа строки, у последнего — до середины.
  const elements = renderRows(null, null, 2);
  assert.equal(elements.find(e => e.id?.[0] === 'agent-tree-agent').bottom[0], 0);
  assert.equal(elements.find(e => e.id?.[0] === 'agent-tree-agent-1').bottom[0], 13);
});

test('space_row__single_and_double_click__select_without_folding', () => {
  // Ожидание: одиночный и двойной клики по строке выбирают спейс и не сворачивают агентов.
  const elements = renderRows(null);
  const row = elements.find(e => e.id?.[0] === 'space-one');
  const cx = { notify() {} };
  const click = click_count => {
    row.on_mouse_downleft[1]({ click_count }, cx);
    row.on_mouse_upleft[1]({ click_count }, cx);
  };
  click(1);
  assert.equal(elements.view.foldedAgents.has('one'), false);
  assert.equal(elements.commands.at(-1)[0], 'space.select');
  click(2);
  assert.equal(elements.view.foldedAgents.has('one'), false);
  assert.equal(elements.commands.at(-1)[0], 'space.select');
  assert.equal(elements.saved['spaces-agents.folded'], undefined);
});

test('space_toggle_area__icon_without_arrow__fold_without_selecting_and_persist', () => {
  // Ожидание: иконка без стрелки меняет и сохраняет состояние без выбора спейса.
  const elements = renderRows(null);
  const arrow = elements.find(e => e.id?.[0] === 'space-agents-toggle-one');
  assert.ok(arrow.h?.[0] >= 28);
  assert.ok(!elements.some(e => e.child?.[0] === '▾' || e.child?.[0] === '▸'));
  assert.ok(arrow.cursor_pointer);
  let stopped = 0;
  const cx = { stop_propagation() { stopped++; }, notify() {} };
  arrow.on_mouse_downleft[1]({ click_count: 1 }, cx);
  arrow.on_mouse_upleft[1]({ click_count: 1 }, cx);
  assert.equal(stopped, 2);
  assert.equal(elements.view.foldedAgents.has('one'), true);
  assert.equal(elements.commands.length, 0);
  assert.deepEqual(JSON.parse(elements.saved['spaces-agents.folded']), ['one']);
  arrow.on_mouse_upleft[1]({ click_count: 1 }, cx);
  assert.equal(elements.view.foldedAgents.has('one'), false);
  assert.deepEqual(JSON.parse(elements.saved['spaces-agents.folded']), []);
});

test('space_drag__double_click_count__does_not_fold_destination', () => {
  // Ожидание: отпускание после перетаскивания не сворачивает агентов целевого спейса.
  const elements = renderRows(null);
  const row = elements.find(e => e.id?.[0] === 'space-one');
  elements.view.pressed = 'another';
  elements.view.over = 'one';
  row.on_mouse_upleft[1]({ click_count: 2 }, { notify() {} });
  assert.equal(elements.view.foldedAgents.has('one'), false);
  assert.equal(elements.commands.at(-1)[0], 'space.move');
});

test('groups primary agents by space and sorts without dropping duplicate names', () => {
  const list = [
    { address: 'a', space: 'one', pane_name: 'Zulu' },
    { address: 'b', space: 'one', pane_name: 'Alpha' },
    { address: 'c', space: 'one', pane_name: 'Alpha' },
    { address: 'child', space: 'one', pane_name: 'Child' },
    { address: 'other', space: 'two', pane_name: 'Other' },
  ];
  const terminals = [{ address: 'child', parent: 'a' }];
  assert.deepEqual(Array.from(agentsForSpace(list, terminals, 'one'), a => a.address), ['b', 'c', 'a']);
  assert.deepEqual(Array.from(agentsForSpace(list, terminals, 'empty')), []);
});

test('manual pane name wins; session and tab titles never supply agent names', () => {
  for (const name of ['Codex', 'Pi', 'Claude Code']) {
    const a = { address: 't3', title: 'Changing session title', tab_name: 'Named tab', program: { name } };
    assert.equal(agentName(a), name);
    assert.equal(agentName({ ...a, pane_name: 'π - Review | API' }), 'π - Review | API');
    assert.equal(agentName({ ...a, pane_name: '' }), name);
  }
});

test('right click targets the clicked pane or space without focusing it', () => {
  const elements = renderRows('agent', null, 2);
  for (const [id, type, target] of [['agent-agent-1','pane',{pane:'pane-1', terminal:'agent-1'}], ['space-empty','space',{id:'empty'}]]) {
    elements.find(el => el.id?.[0] === id).on_mouse_downright[1]();
    const props = elements.commands.at(-1)[1].props;
    assert.equal(props.tab, type);
    assert.deepEqual({...props.target}, target);
  }
  assert.equal(elements.commands.length, 2);
});

test('agent navigation follows space and agent display order, excluding subagents', () => {
  const rows = [
    { w: { id: 'remote', machine: 'server', tabs: [] } },
    { w: { id: 'local', machine: null, tabs: [] } },
  ];
  const agents = [
    { address: 'z', space: 'local', pane_name: 'Z' },
    { address: 'a', space: 'local', pane_name: 'A' },
    { address: 'child', space: 'local', pane_name: 'Child' },
    { address: 'remote', space: 'remote', pane_name: 'Remote' },
  ];
  assert.deepEqual(Array.from(agentOrder(rows, agents, [{ address: 'child', parent: 'a' }])), ['a', 'z', 'remote']);
});
