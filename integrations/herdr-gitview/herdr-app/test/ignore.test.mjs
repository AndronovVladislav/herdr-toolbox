import { world, reset } from './stub.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const actions = await import('../mods/gitview/actions.js');
const { MODES } = await import('../mods/gitview/modes.js');
const { actionFor, cardOf } = await import('../mods/gitview/keymap.js');
const { default: GitList } = await import('../mods/gitview/main.js');
const { default: GitviewAsk } = await import('../mods/gitview-ask/main.js');

const where = { root: '/repo with spaces', on: 'server' };

test('ignore_dialog__file_or_folder__explicit_target_and_frozen_repo', () => {
  // Ожидание: выбор назначения передаёт точный путь и исходный репозиторий, включая удалённую машину.
  for (const row of [{ kind: 'file', file: { path: '--file[1].txt' } },
    { kind: 'dir', path: 'build/' }]) {
    reset();
    actions.askIgnore(row, where);
    const dialog = world.overlays[0];
    assert.equal(dialog.mod, 'gitview-ask');
    assert.equal(dialog.modal, true);
    const choices = dialog.props.choices;
    assert.deepEqual(choices.map(c => c.label), ['.gitignore', '.git/info/exclude', 'Cancel']);
    for (const [index, target] of ['gitignore', 'exclude'].entries()) {
      assert.deepEqual(choices[index].steps[0].gitview,
        ['ignore', '--repo', where.root, '--worktree-root', '--on', 'server', '--target', target,
          '--', row.kind === 'dir' ? row.path : row.file.path]);
    }
    assert.deepEqual(choices[2].steps, []);
    assert.match(dialog.props.detail, /Tracked files remain tracked/);
  }
});

test('ignore_shortcut__selected_file_or_folder__opens_destination_dialog', () => {
  // Ожидание: i открывает выбор назначения для выбранного файла или папки.
  for (const row of [{ kind: 'file', file: { path: 'local.log' } }, { kind: 'dir', path: 'build/' }]) {
    reset();
    const v = Object.assign(Object.create(GitList.prototype), {
      mode: 'files', scope: 'worktree', work: { row: () => row, where },
      handedOff: () => false, list: () => null,
      context: () => ({ key: 'checkout' }), loadedKey: 'checkout',
    });
    const action = actionFor([MODES.files.keys], 'i');
    assert.equal(typeof action, 'function');
    action(v, { notify() {} });
    assert.equal(world.overlays.length, 1);
    assert.ok(world.overlays[0].props.detail.startsWith(row.path ?? row.file.path));
    const card = cardOf([{ title: '', table: MODES.files.keys }], v);
    assert.ok(card[0].keys.some(e => e.caps.includes('i')));
  }
});

test('ignore_shortcut__branch_scope_or_history__does_not_modify_repo', () => {
  // Ожидание: i не открывает диалог вне рабочего дерева и не предлагается в списке клавиш сравнения.
  reset();
  const v = Object.assign(Object.create(GitList.prototype), {
    mode: 'files', scope: 'branch', work: { row: () => ({ kind: 'file', file: { path: 'local.log' } }), where },
    handedOff: () => false, list: () => null,
  });
  actionFor([MODES.files.keys], 'i')(v, { notify() {} });
  assert.equal(world.overlays.length, 0);
  assert.ok(!cardOf([{ title: '', table: MODES.files.keys }], v)[0].keys.some(e => e.caps.includes('i')));
  assert.equal(actionFor([MODES.commit.keys], 'i'), null);
});

test('ignore_dialog__agent_switches_after_prompt__does_not_write_rule', async () => {
  // Ожидание: смена рабочей копии до подтверждения отменяет запись правила.
  reset();
  world.files['/tmp/gv-test-home/mods/gitview/config.json'] = '{"bin":"gitview"}';
  const commands = [];
  world.exec = (command, args) => {
    commands.push([command, args]);
    return { code: 0, stdout: '{"state":"live","labels":{"gitview.worktree":"/next"}}' };
  };
  actions.askIgnore({ kind: 'file', file: { path: 'local.log' } }, where,
    { terminal: 'server/agent', worktree: where.root });
  await new GitviewAsk().doSteps(world.overlays[0].props.choices[0].steps);
  assert.deepEqual(commands, [['hc', ['get', 'server/agent', '--json']]]);
});

test('ignore_dialog__section_or_history__does_not_offer_mutation', () => {
  // Ожидание: заголовок секции и исторический список не позволяют добавить правило.
  reset();
  actions.askIgnore({ kind: 'header' }, where);
  actions.askIgnore({ kind: 'file', file: { path: 'file' } }, { ...where, commit: 'abc' });
  assert.equal(world.overlays.length, 0);
});
