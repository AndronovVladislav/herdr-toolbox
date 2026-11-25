// The diff pane's rows as drawn (diffview.js displayRows): where notes and
// the composer go.
import { world, reset } from "./stub.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
const { displayRows, displayColumns, widestColumns } = await import("../mods/gitview-diff/diffview.js");
const { default: GitDiff } = await import("../mods/gitview-diff/main.js");

test("o opens the project and shown file without handing off the diff pane", async () => {
  reset();
  world.files["/tmp/gv-test-home/mods/gitview/config.json"] = '{"bin":"gitview"}';
  const view = new GitDiff();
  view.view = { root: "/repo", path: "with spaces.txt", on: null };
  const calls = [];
  world.exec = (cmd, args) => {
    calls.push([cmd, args]);
    return cmd === "/usr/bin/env"
      ? { code: 0, stdout: '{"argv":["/bin/editor","--reuse","/repo","/repo/with spaces.txt"]}' }
      : { code: 0 };
  };
  const pending = [];
  assert.equal(view.key({ key: "o", modifiers: {} }, { spawn: (task) => pending.push(task()) }), true);
  await Promise.all(pending);
  assert.deepEqual(calls[0][1].slice(-6), ["json", "visual", "--repo", "/repo", "--path", "with spaces.txt"]);
  assert.deepEqual(calls[1], ["/bin/editor", ["--reuse", "/repo", "/repo/with spaces.txt"]]);
  assert.equal(calls.length, 2);
});

const rows = [{ k: "ctx", o: 1, n: 1 }, { k: "del", o: 2, n: null }, { k: "ins", o: null, n: 2 }, { k: "ctx", o: 3, n: 3 }];
const shape = (out) => out.map((x) => (x.note ? `note:${x.note.text}` : x.composer ? "composer" : `row:${x.index}`));

const { addNote, notesOf, removeNotes } = await import("../mods/gitview/shared.js");

function noteEditor() {
  reset();
  const view = new GitDiff();
  let value;
  Object.assign(view, {
    view: { root: "/repo", path: "a.rs", section: "changes" },
    diff: { rows: [{ n: 1, m: " first" }, { n: 2, m: "+second" }, { n: 3, m: "+third" }] },
    anchor: null, cursor: 0,
    composer: { set_value: (text) => { value = text; }, focus() {} },
    flash: { clear() {} }, focusHere() {}, publishCursor() {},
  });
  const key = view.notesKey();
  addNote(key, { file: "a.rs", section: "changes", cached: false, start: 1, end: 1, snippet: " first\n", text: "Before" });
  return { view, key, note: notesOf(key)[0], draft: () => value, cx: { notify() {} } };
}

/** Ожидание: редактирование обновляет текст, диапазон и фрагмент кода без смены ID. */
test("edit note with selected lines updates the same note", () => {
  const { view, key, note, draft, cx } = noteEditor();
  view.anchor = 1;
  view.cursor = 2;
  view.editNote(note, cx);
  assert.equal(draft(), "Before");
  view.saveNote("After!", cx);
  assert.deepEqual(notesOf(key), [{ ...note, start: 2, end: 3, snippet: "+second\n+third\n", text: "After!" }]);
});

/** Ожидание: щелчок в открытом редакторе привязывает заметку к одной строке, не сбрасывая черновик. */
test("edit note then click a line updates the anchor without resetting the draft", () => {
  const { view, key, note, draft, cx } = noteEditor();
  view.editNote(note, cx);
  view.composer.set_value("Draft");
  view.down(2, { modifiers: {} }, cx);
  view.up(cx);
  assert.equal(draft(), "Draft");
  assert.deepEqual(notesOf(key), [note]);
  view.saveNote(draft(), cx);
  assert.deepEqual(notesOf(key), [{ ...note, start: 3, end: 3, snippet: "+third\n", text: "Draft" }]);
});

/** Ожидание: без выделения правится только текст; отмена не меняет заметку. */
test("edit note without selected lines preserves the range and can be cancelled", () => {
  const { view, key, note, cx } = noteEditor();
  view.cursor = 2;
  view.editNote(note, cx);
  assert.equal(view.key({ key: "escape" }, cx), true);
  view.saveNote("Discarded", cx);
  assert.deepEqual(notesOf(key), [note]);
  view.editNote(note, cx);
  view.saveNote("After!", cx);
  assert.deepEqual(notesOf(key), [{ ...note, text: "After!" }]);
});

/** Ожидание: сохранение черновика не восстанавливает удалённую заметку. */
test("editing a note that is removed before save does not recreate it", () => {
  const { view, key, note, cx } = noteEditor();
  view.editNote(note, cx);
  removeNotes(key, [note.id]);
  view.saveNote("After!", cx);
  assert.deepEqual(notesOf(key), []);
});

/** Ожидание: двойной щелчок по строке ставит курсор, но не открывает редактор. */
test("diff__double_click_on_line__moves_cursor_without_opening_editor", () => {
  const view = new GitDiff();
  Object.assign(view, {
    diff: { rows }, cursor: 0, flash: { clear() {} }, focusHere() {}, publishCursor() {},
    edit: () => assert.fail("A double click must not open the editor"),
  });
  const cx = { notify() {} };

  view.down(2, { click_count: 2, modifiers: {} }, cx);
  view.up(cx);

  assert.equal(view.cursor, 2);
  assert.equal(view.anchor, null);
});

test("a file's notes come first; a line's note right under its last line (by the new side)", () => {
  const notes = [{ end: 2, text: "on 2" }, { end: 0, text: "file" }];
  assert.deepEqual(shape(displayRows({ rows }, notes, null)), ["note:file", "row:0", "row:1", "row:2", "note:on 2", "row:3"]);
});

test("a note outside the visible diff and its editor remain accessible", () => {
  assert.deepEqual(shape(displayRows({ rows }, [{ end: 9, text: "folded" }], -1)),
    ["note:folded", "composer", "row:0", "row:1", "row:2", "row:3"]);
});

test("a deleted line (no new number) gets no note; the composer goes under the row it's for", () => {
  assert.deepEqual(shape(displayRows({ rows }, [], 1)), ["row:0", "row:1", "composer", "row:2", "row:3"]);
});

// #26: the sideways range comes from the data, not from measuring drawn
// rows. A column count drives it, so a wide glyph (CJK, full-width, emoji)
// has to count as the two columns it draws, or the tail of a line of them
// would be cut. This is the one piece of pure logic the range leans on.
test("display columns: ASCII is one per code point, CJK / full-width / emoji are two", () => {
  assert.equal(displayColumns("hello"), 5);
  assert.equal(displayColumns(""), 0);
  assert.equal(displayColumns("\u4e16\u754c"), 4); // 世界: two wide
  assert.equal(displayColumns("a\u4e16b"), 4); // 1 + 2 + 1
  assert.equal(displayColumns("\uff21\uff22"), 4); // ＡＢ full-width
  assert.equal(displayColumns("\u{1f600}"), 2); // 😀 one code point, two columns
  assert.equal(displayColumns("a\u{1f600}b"), 4);
});

test("widest row: the row with the most display columns, summed across its spans", () => {
  const rows = [
    { s: [["short", null, null]] }, // 5
    { s: [["a", null, null], ["\u4e16\u754c", null, null]] }, // 1 + 4 = 5
    { s: [["0123456789", null, null]] }, // 10: the winner
    { k: "fold", s: [] }, // no text
  ];
  assert.equal(widestColumns(rows), 10);
  assert.equal(widestColumns([]), 0);
});

// Round 10 (U1): the engine stops at 5 000 rows and said so; the pane just
// ended, as if the file did.
test("a diff the engine cut ends with a row saying so", () => {
  const out = displayRows({ rows, truncated: true }, [], null);
  assert.deepEqual(out.at(-1), { cut: 4 });
  assert.equal(displayRows({ rows }, [], null).some((x) => x.cut), false);
});
