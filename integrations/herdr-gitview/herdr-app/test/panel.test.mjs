// The panel's show/hide edges (placement.js cycleEdge, PanelCycle): what
// the list closes and opens when the person hides and shows it.
import { world, reset } from "./stub.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
const { cycleEdge, listPlacement } = await import("../mods/gitview/placement.js");
const { location } = await import("../mods/gitview/layout.js");
const { setOwnSource, viewIn } = await import("../mods/gitview/shared.js");
const { default: GitList } = await import("../mods/gitview/main.js");
const { FileList } = await import("../mods/gitview/filelist.js");
const { MODES } = await import("../mods/gitview/modes.js");
const { confirmDiscard } = await import("../mods/gitview/actions.js");
const { openCommit } = await import("../mods/gitview/history.js");

test("o in an empty list opens just its worktree in the configured editor", async () => {
  reset();
  world.files["/tmp/gv-test-home/mods/gitview/config.json"] = '{"bin":"gitview"}';
  const root = "/linked tree";
  const work = new FileList({ sections: [] }, { root, on: null });
  work.rebuild(false);
  const calls = [], pending = [];
  world.exec = (cmd, args) => {
    calls.push([cmd, args]);
    return { code: 0, stdout: JSON.stringify({ argv: ["editor", root] }) };
  };
  MODES.files.keys.find(key => key.on.o).on.o({ work }, { spawn: fn => pending.push(fn()) });
  await Promise.all(pending);
  assert.deepEqual(calls[0]?.[1].slice(-4), ["json", "visual", "--repo", root]);
  assert.deepEqual(calls[1], ["editor", [root]]);
});

test("w cycles through default and parent comparisons before returning to worktree", () => {
  const list = new GitList(), seen = [];
  Object.assign(list, { scope: "worktree", setMode() {}, refresh() { seen.push(this.scope); } });
  const press = MODES.files.keys.find(key => key.on.w).on.w;
  for (let i = 0; i < 3; i++) press(list, {});
  assert.deepEqual(seen, ["trunk", "parent", "worktree"]);
});

const A = { id: "spA", active: true, tabs: [{ id: "t1" }, { id: "t2" }] };
const B = { id: "spB", active: false, tabs: [{ id: "t3" }] };
// A layout whose changes slot shows gitview, open or hidden.
const panel = (hidden) => ({ id: "root", children: [{ id: "panel", hidden, children: [{ id: "changes", content: { mod: "gitview" } }] }] });
const at = (shown, space = A) => ({ shown, space: space?.id ?? null, tabs: space?.tabs.map((t) => t.id) ?? [] });

/** @param {boolean} fail */
function stagePanel(fail) {
  reset({ spaces: [A] });
  world.files["/tmp/gv-test-home/mods/gitview/config.json"] = '{"bin":"gitview"}';
  const where = { root: "/repo", on: "remote" };
  const section = (id, paths) => ({ id, cached: id === "staged", files: paths.map((path) => ({ path })) });
  const status = { root: where.root, scope: "worktree", sections: [section("changes", ["a.rs", "b.rs"])] };
  const work = new FileList(status, where);
  work.rebuild(false);
  world.exec = (_cmd, args) => {
    const op = args[args.indexOf("json") + 1];
    if (op === "stage") return { code: fail ? 1 : 0, stdout: fail ? '{"error":"Staging failed"}' : '{}' };
    assert.equal(op, "status");
    const sections = [section("staged", ["a.rs"]), section("changes", ["b.rs"])];
    return { code: 0, stdout: JSON.stringify({ ...status, sections }) };
  };

  const pending = [];
  const view = new GitList();
  Object.assign(view, {
    place: { context: () => ({ cwd: where.root, on: where.on }), tab: () => "t1", showsFirstFile: true },
    mode: "files", scope: "worktree", roots: new Map(), noSubmodules: new Set(), watcher: {}, work,
    scroll: { reveal() {} }, tr: { line() {} },
    loads: {
      run: (cx, _kind, task) => pending.push(task(cx)),
      latest: (cx, _kind, task) => pending.push(task(cx, () => true)),
    },
  });
  view.ctx = view.context();
  view.loadedKey = view.ctx.key;
  const cx = { spawn() {} };
  view.select(work.find("a.rs"), cx, { open: false, browse: false });
  return { work, pending, view, cx };
}

/** Ожидание: клавиша s переносит выделение и diff на следующий файл только после успешного staging. */
test("stage_key__git_succeeds__advances_selection_and_diff", async () => {
  const { work, pending, view, cx } = stagePanel(false);
  MODES.files.keys.find((key) => key.on.s).on.s(view, cx);
  assert.equal(work.row().file.path, "a.rs");
  for (const task of pending) await task;
  assert.equal(work.row().key, "changes:b.rs");
  assert.equal(viewIn("t1").path, "b.rs");
});

/** Ожидание: при ошибке staging выделение и diff остаются на исходном файле. */
test("stage_key__git_fails__keeps_selection_and_diff", async () => {
  const { work, pending, view, cx } = stagePanel(true);
  MODES.files.keys.find((key) => key.on.s).on.s(view, cx);
  for (const task of pending) await task;
  assert.equal(work.row().key, "changes:a.rs");
  assert.equal(viewIn("t1").path, "a.rs");
});

test("agent_worktree__changes_panel__updates_with_terminal_label", () => {
  // Ожидание: Changes читает метку агента и обновляет путь даже при фокусе на diff.
  reset({ spaces: [{ ...A, folder: "/repo" }], focused: { tab: "t1", pane: "p1", terminal: "agent" },
    panes: [{ tab: "t1", pane: "p1", terminal: "agent", cwd: "/repo" }, { tab: "t1", pane: "diff", terminal: null }],
  });
  world.terminals = [{ address: "agent", state: "live", labels: { "gitview.worktree": "/first" } }];
  const changes = listPlacement();
  const initial = changes.context(null);
  assert.equal(initial.cwd, "/first");
  world.focused = { tab: "t1", pane: "diff" };
  world.terminals[0].labels["gitview.worktree"] = "/second";
  assert.equal(changes.context(initial).cwd, "/second");
  delete world.terminals[0].labels["gitview.worktree"];
  assert.equal(changes.context(initial).cwd, "/repo");
});

test("agent_worktree__gitview_tab_reused__follows_new_source_terminal", () => {
  // Ожидание: повторный Cmd+G привязывает открытую вкладку к агенту, с которого его вызвали.
  reset({ spaces: [A], focused: { tab: "t1", terminal: "agent", cwd: "/repo" } });
  world.terminals = [
    { address: "agent", state: "live", labels: { "gitview.worktree": "/first" } },
    { address: "other", state: "live", labels: { "gitview.worktree": "/second" } },
  ];
  const source = location();
  const own = listPlacement({ ...source, space: "spA", tab: "t2", own: true });
  assert.equal(own.context().cwd, "/first");
  world.focused = { tab: "t1", terminal: "other", cwd: "/repo" };
  setOwnSource("spA", "t2", location());
  assert.equal(own.context().cwd, "/second");
  assert.equal(own.context().tab, "t2");
});

test("agent_worktree__diff_has_focus__uses_the_only_report_in_the_tab", () => {
  // Ожидание: Cmd+G из diff использует метку агента в той же вкладке.
  reset({ spaces: [{ ...A, folder: "/repo" }], focused: { tab: "t1", pane: "diff" },
    panes: [{ tab: "t1", pane: "p1", terminal: "agent", cwd: "/repo" }, { tab: "t1", pane: "diff", terminal: null }],
  });
  world.terminals = [{ address: "agent", state: "live", labels: { "gitview.worktree": "/linked" } }];
  const own = listPlacement({ ...location(), space: "spA", tab: "t2", own: true });
  assert.equal(own.context().cwd, "/linked");
});

test("agent_worktree__invalid_report__clears_previous_checkout", () => {
  // Ожидание: пока путь из метки неверен, Changes не показывает файлы предыдущей копии.
  reset({ spaces: [A], focused: { tab: "t1", terminal: "agent", cwd: "/repo" } });
  world.terminals = [{ address: "agent", state: "live", labels: { "gitview.worktree": "relative" } }];
  const view = new GitList();
  Object.assign(view, { place: listPlacement(), roots: new Map(), scope: "worktree", work: {} });
  view.refresh({});
  assert.equal(view.work, null);
  assert.equal(view.error, "Agent worktree must be an absolute path");
});

test("agent_worktree__discard_confirmed_after_switch__does_not_act_on_previous_checkout", () => {
  // Ожидание: подтверждение сброса после переключения не меняет файлы в прежней рабочей копии.
  reset({ spaces: [A], focused: { tab: "t1", terminal: "agent", cwd: "/repo" } });
  world.terminals = [{ address: "agent", state: "live", labels: { "gitview.worktree": "/first" } }];
  const view = new GitList();
  const where = { root: "/first", on: null };
  const actions = [];
  const messages = [];
  Object.assign(view, {
    place: listPlacement(), roots: new Map(), scope: "worktree", work: { where },
    act: (...args) => actions.push(args), flash: { set: (message) => messages.push(message) },
  });
  view.loadedKey = view.context().key;
  confirmDiscard("gitview", "changed.txt", { where, paths: ["changed.txt"], section: "changes" });
  const [token] = Object.keys(world.shared["gitview.discards"]);
  world.terminals[0].labels["gitview.worktree"] = "/second";

  view.discardConfirmed(`discard:${token}`, {});

  assert.deepEqual(actions, []);
  assert.deepEqual(messages, ["Checkout changed"]);
});

test("agent_worktree__status_returns_after_report_changes__ignores_old_checkout", async () => {
  // Ожидание: ответ от прежней копии не обновляет список, даже если панель ещё не начала новую загрузку.
  reset({ spaces: [{ ...A, machine: "remote" }], focused: { tab: "t1", terminal: "remote/agent", cwd: "/repo" } });
  world.terminals = [{ address: "remote/agent", state: "live", labels: { "gitview.worktree": "/first" } }];
  world.files["/tmp/gv-test-home/mods/gitview/config.json"] = '{"bin":"gitview"}';
  const started = Promise.withResolvers();
  const reply = Promise.withResolvers();
  world.exec = () => { started.resolve(); return reply.promise; };
  const view = new GitList();
  const updates = [];
  const work = { where: { root: "/first", on: "remote" }, status: { scope: "worktree" },
    update: (...args) => updates.push(args) };
  let load;
  Object.assign(view, {
    place: listPlacement(), roots: new Map(), scope: "worktree", work,
    noSubmodules: new Set(), watcher: {}, followSelection() {},
    loads: { latest: (cx, _kind, task) => { load = task(cx, () => true); } },
  });
  view.ctx = view.context();
  view.loadedKey = view.ctx.key;

  view.refresh({ spawn() {} });
  await started.promise;
  world.terminals[0].labels["gitview.worktree"] = "/second";
  reply.resolve({ code: 0, stdout: '{"root":"/first","scope":"worktree"}' });
  await load;

  assert.deepEqual(updates, []);
});

test("agent_worktree__app_snapshot_lags__verifies_with_herdr_core_before_discard", async () => {
  // Ожидание: при расхождении с актуальной меткой Gitview отменяет сброс до вызова Git.
  reset({ spaces: [A], focused: { tab: "t1", terminal: "agent", cwd: "/repo" } });
  world.terminals = [{ address: "agent", state: "live", labels: { "gitview.worktree": "/first" } }];
  world.files["/tmp/gv-test-home/mods/gitview/config.json"] = '{"bin":"gitview"}';
  const commands = [];
  world.exec = (command, args) => {
    commands.push([command, args]);
    return { code: 0, stdout: '{"state":"live","labels":{"gitview.worktree":"/second"}}' };
  };
  const view = new GitList();
  const where = { root: "/first", on: null };
  let action;
  Object.assign(view, {
    place: listPlacement(), roots: new Map(), scope: "worktree", work: { where },
    loads: { run: (cx, _kind, task) => { action = task(cx); } },
  });
  view.loadedKey = view.context().key;

  view.act(["discard", "--", "changed.txt"], where, {});
  await action;

  assert.deepEqual(commands, [["hc", ["get", "agent", "--json"]]]);
});

test("agent_worktree__commit_files_finish_after_switch__leaves_current_diff_alone", async () => {
  // Ожидание: завершившийся запрос истории не открывает diff из прежней рабочей копии.
  reset();
  world.files["/tmp/gv-test-home/mods/gitview/config.json"] = '{"bin":"gitview"}';
  const reply = Promise.withResolvers();
  world.exec = () => reply.promise;
  let load;
  let changed = false;
  const modes = [];
  const view = {
    work: { where: { root: "/first", on: null } },
    isCurrentCheckout: () => !changed,
    loads: { run: (cx, _kind, task) => { load = task(cx); } },
    setMode: mode => modes.push(mode),
  };
  openCommit(view, { sha: "abc" }, {});
  changed = true;
  reply.resolve({ code: 0, stdout: '{"files":[]}' });
  await load;
  assert.deepEqual(modes, []);
});

test("agent_worktree__manual_pin__wins_until_cleared", () => {
  // Ожидание: изменения в метке агента не переопределяют закреплённый путь.
  reset({ spaces: [A], focused: { tab: "t1", terminal: "agent", cwd: "/repo" } });
  const labels = { "gitview.worktree": "/first", "gitview.pinnedWorktree": "/chosen" };
  world.terminals = [{ address: "agent", state: "live", labels }];
  const panel = listPlacement();
  assert.equal(panel.context(null).cwd, "/chosen");
  labels["gitview.worktree"] = "/second";
  assert.equal(panel.context(null).source, "Pinned worktree");
  delete labels["gitview.pinnedWorktree"];
  assert.equal(panel.context(null).cwd, "/second");
});

test("agent_worktree__same_path_on_two_machines__uses_focused_terminal_machine", () => {
  // Ожидание: одинаковые пути на разных машинах не смешиваются.
  reset({ spaces: [A], focused: { tab: "t1", pane: "p1", terminal: "remote/agent" },
    panes: [{ tab: "t1", pane: "p1", terminal: "remote/agent", cwd: "/repo" }],
  });
  world.terminals = [{ address: "remote/agent", state: "live", labels: { "gitview.worktree": "/linked" } }];
  const context = listPlacement().context(null);
  assert.equal(context.cwd, "/linked");
  assert.equal(context.on, "remote");
});

test("agent_worktree__source_terminal_stops__does_not_fall_back_to_original_checkout", () => {
  // Ожидание: Cmd+G не подменяет рабочую копию после закрытия терминала-источника.
  reset({ spaces: [A] });
  world.terminals = [{ address: "agent", state: "finished" }];
  const own = listPlacement({ own: true, space: "spA", tab: "t2", terminal: "agent", cwd: "/repo" });
  assert.equal(own.context().cwd, null);
  assert.equal(own.context().problem, "Source terminal is no longer running");
});

test("agent_worktree__diff_without_previous_source__does_not_guess_between_terminals", () => {
  // Ожидание: без выбранного терминала Gitview не решает, какой из двух считать источником.
  reset({ spaces: [{ ...A, folder: "/repo" }], focused: { tab: "t1", pane: "diff" },
    panes: [{ tab: "t1", pane: "p1", terminal: "a", cwd: "/repo" },
      { tab: "t1", pane: "p2", terminal: "b", cwd: "/repo" }, { tab: "t1", pane: "diff" }],
  });
  world.terminals = [{ address: "a", state: "live", labels: { "gitview.worktree": "/linked" } },
    { address: "b", state: "live" }];
  assert.equal(listPlacement().context(null).problem, "Select a terminal to choose the checkout");
});

test("the first look at a shown panel is a show (the list opens its file)", () => {
  assert.equal(cycleEdge({ shown: null, space: null }, at(true)).edge, "shown");
});

test("a hide in the same space closes that space's tabs' unit, not another's", () => {
  const { edge } = cycleEdge({ shown: true, space: "spA" }, at(false));
  assert.deepEqual([...edge.hidden], ["t1", "t2"]);
  assert.equal(edge.space, "spA");
});

test("going to a space whose panel is closed closes nothing (coming back finds the diff as it was)", () => {
  assert.equal(cycleEdge({ shown: true, space: "spA" }, at(false, B)).edge, null);
});

test("no change, no edge: a look every 300 ms doesn't reopen or close anything", () => {
  assert.equal(cycleEdge({ shown: true, space: "spA" }, at(true)).edge, null);
  assert.equal(cycleEdge({ shown: false, space: "spA" }, at(false)).edge, null);
});

// Round 9: the launcher closed the panes itself and the list's look came
// only after the panel was shown again: no edge, no file.
test("a cmd-shift-g hide the look missed: its unit closes, and the next look is a show", () => {
  reset({ spaces: [A, B], layout: panel(false) });
  const cycle = listPlacement().cycle();
  assert.equal(cycle.look(), "shown");
  const hidden = cycle.hiddenBy("spA"); // the panel shown again before any look
  assert.deepEqual([...hidden.hidden], ["t1", "t2"]);
  assert.equal(cycle.look(), "shown");
});

test("cmd-shift-g's hide closes the space it hid, even after a quick switch to another", () => {
  reset({ spaces: [{ ...A, active: false }, { ...B, active: true }], layout: panel(false) });
  const cycle = listPlacement().cycle();
  cycle.look();
  assert.equal(cycle.hiddenBy("spA").space, "spA");
});

test("a hide the look saw first isn't closed a second time by cmd-shift-g's message", () => {
  reset({ spaces: [A], layout: panel(false) });
  const cycle = listPlacement().cycle();
  cycle.look();
  world.layout = panel(true);
  assert.ok(cycle.look()?.hidden);
  assert.equal(cycle.hiddenBy("spA"), null);
});
