const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, realpathSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

/** @param {import('node:test').TestContext} t */
async function setup(t) {
  const { default: register } = await import('../integrations/herdr-gitview/pi/gitview-worktree.js');
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'pi-gitview-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const checkout = join(dir, 'linked checkout');
  const repo = join(dir, 'repo');
  execFileSync('git', ['init', '--quiet', '--initial-branch=master', repo]);
  execFileSync('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.org',
    'commit', '--quiet', '--allow-empty', '-m', 'Initial commit']);
  execFileSync('git', ['-C', repo, 'worktree', 'add', '--quiet', '-b', 'feature', checkout]);
  const cwd = join(checkout, 'nested');
  mkdirSync(cwd);
  /** @type {string[][]} */
  const labels = [];
  const terminal = 't-test';
  const previousTerminal = process.env.HC_TERMINAL_ID;
  process.env.HC_TERMINAL_ID = terminal;
  t.after(() => {
    if (previousTerminal === undefined) delete process.env.HC_TERMINAL_ID;
    else process.env.HC_TERMINAL_ID = previousTerminal;
  });
  const pi = {
    on(event, handler) {
      if (event === 'session_start') this.start = handler;
    },
    exec(command, args, options) {
      if (command === 'hc') {
        labels.push(args);
        return { code: 0 };
      }

      const result = spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8' });
      return { code: result.status, stdout: result.stdout, stderr: result.stderr };
    },
    start: undefined,
  };
  register(pi);
  return { pi, dir, checkout, cwd, labels, terminal };
}

/** Ожидание: после открытия сессии Gitview получает корень отдельной рабочей копии, даже из подпапки. */
test('session_start__resume_in_linked_checkout__publishes_checkout_root', async (t) => {
  const { pi, checkout, cwd, labels, terminal } = await setup(t);
  await pi.start({ reason: 'resume' }, { cwd, hasUI: true });
  assert.deepEqual(labels, [['label', terminal, `gitview.worktree=${checkout}`]]);
});

/** Ожидание: перезагрузка расширений не затирает метку рабочей копии, заданную агентом. */
test('session_start__reload__preserves_existing_label', async (t) => {
  const { pi, cwd, labels } = await setup(t);
  await pi.start({ reason: 'reload' }, { cwd, hasUI: true });
  assert.deepEqual(labels, []);
});

/** Ожидание: переход в каталог вне Git убирает метку прежней рабочей копии. */
test('session_start__resume_outside_git__clears_old_label', async (t) => {
  const { pi, dir, labels, terminal } = await setup(t);
  await pi.start({ reason: 'resume' }, { cwd: dir, hasUI: true });
  assert.deepEqual(labels, [['label', terminal, 'gitview.worktree=']]);
});

/** Ожидание: Pi вне терминала Herdr и фоновый запуск не меняют метки. */
test('session_start__no_herdr_or_no_ui__does_not_publish', async (t) => {
  const { pi, cwd, labels } = await setup(t);
  await pi.start({ reason: 'startup' }, { cwd, hasUI: false });
  delete process.env.HC_TERMINAL_ID;
  await pi.start({ reason: 'startup' }, { cwd, hasUI: true });
  assert.deepEqual(labels, []);
});
