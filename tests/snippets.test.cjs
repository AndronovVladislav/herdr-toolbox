const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const MOD = path.join(__dirname, '../mods/snippets/main.js');

function loadModule(apis = {}) {
  const source = fs.readFileSync(MOD, 'utf8')
    .replace(/^import .*;\n/gm, '').replace('export default class', 'class').replace(/export function /g, 'function ');
  return vm.runInNewContext(source + '\n({ Snippets, searchSnippets })', { View: class {}, ...apis });
}

function picker(storage = new Map(), exitCode = 0) {
  let terminal = 't1';
  const calls = [];
  const terminals = [{ address: 't1', state: 'live' }];
  const files = {
    '/herdr/snippets/commit.md': 'First line\nSecond line\n',
    '/herdr/mods/gitview/config.json': '{"bin":"/bin/gitview","hc":"/bin/hc"}',
  };
  const closed = [];
  const { Snippets } = loadModule({
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v) },
    focused: () => ({ terminal }),
    terminals: () => terminals,
    props: () => ({ overlay: 'overlay' }),
    appHome: () => '/herdr',
    checking: () => true,
    InputState: { new: () => ({ on() {}, focus() {}, value() { return ''; } }) },
    ScrollHandle: { new: () => ({}) },
    readTextFile: async (file) => files[file] ?? null,
    exec: async (...args) => { calls.push(args); return { code: exitCode }; },
    closeOverlay: (id) => closed.push(id),
  });
  const view = new Snippets();
  const cx = { focus_handle() {}, notify() {}, timer: { after() {} } };
  view.init({}, cx);
  return { view, cx, files, calls, closed, terminals, changeFocus: (id) => { terminal = id; } };
}

test('search__case_insensitive_fuzzy_match__prefers_prefix_and_ignores_non_matches', () => {
  // Ожидание: точное начало выигрывает, совпадение по разрозненным буквам тоже доступно.
  const { searchSnippets } = loadModule();
  const files = ['cherry-or-merge.md', 'rebase.md', 'precommit.md', 'commit.md', 'COM.md'];
  assert.deepEqual(Array.from(searchSnippets(files, ' CoM ')), [
    'COM.md', 'commit.md', 'precommit.md', 'cherry-or-merge.md',
  ]);
});

test('successful insert moves a snippet to the front across picker instances; failed send does not', async () => {
  const storage = new Map();
  function open(code) {
    const p = picker(storage, code);
    p.view.files = ['alpha.md', 'beta.md', 'commit.md'];
    p.files['/herdr/snippets/beta.md'] = 'sample';
    p.view.filter();
    return p;
  }
  for (const file of ['commit.md', 'beta.md', 'commit.md']) {
    const p = open(0);
    await p.view.insert(file, p.cx);
  }
  const failed = open(1);
  assert.deepEqual(Array.from(failed.view.rows), ['commit.md', 'beta.md', 'alpha.md']);
  await failed.view.insert('beta.md', failed.cx);
  assert.deepEqual(Array.from(open(0).view.rows), ['commit.md', 'beta.md', 'alpha.md']);
});

test('search ranks match quality before recency and ignores missing files', () => {
  const { searchSnippets } = loadModule();
  assert.deepEqual(Array.from(searchSnippets(['foo.md', 'food.md', 'fool.md', 'afoo.md'], 'foo',
    ['removed.md', 'afoo.md', 'fool.md'])), ['foo.md', 'fool.md', 'food.md', 'afoo.md']);
});

test('insert__focus_moves_after_opening__pastes_to_original_terminal_without_submit', async () => {
  // Ожидание: текст с переводами строк передаётся исходному терминалу без флага отправки.
  const { view, cx, files, calls, closed, changeFocus } = picker();
  changeFocus('t2');
  await view.insert('commit.md', cx);
  assert.equal(calls.length, 1);
  assert.deepEqual(Array.from(calls[0][1]), [
    'GITVIEW_HC=/bin/hc', '/bin/gitview', 'json', 'send', '--terminal', 't1', '--',
    files['/herdr/snippets/commit.md'],
  ]);
  assert.ok(!calls[0][1].includes('--submit'));
  assert.deepEqual(closed, ['overlay']);
});

test('insert__file_removed_after_listing__keeps_picker_open', async () => {
  // Ожидание: удалённый сниппет ничего не вставляет, список остаётся открытым и показывает ошибку.
  const { view, cx, files, calls, closed } = picker();
  delete files['/herdr/snippets/commit.md'];
  await view.insert('commit.md', cx);
  assert.deepEqual(calls, []);
  assert.deepEqual(closed, []);
  assert.ok(view.error);
});

test('insert__original_terminal_closed__does_not_paste_elsewhere', async () => {
  // Ожидание: мод сообщает, что исходный терминал закрыт, и ничего не вставляет.
  const { view, cx, terminals, calls, closed, changeFocus } = picker();
  terminals[0].state = 'finished';
  changeFocus('t2');
  await view.insert('commit.md', cx);
  assert.deepEqual(calls, []);
  assert.deepEqual(closed, []);
  assert.equal(view.error, 'Исходный терминал закрыт.');
});
