import { View, div } from "gpui-kit";
import { Input, InputState, ScrollHandle, v_flex } from "gpui-base";
import { appHome, checking, closeOverlay, exec, focused, props, readTextFile, terminals, theme } from "herdr";

const RECENT_KEY = "recent-snippets.v1";

function recentSnippets() {
  try {
    const names = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(names) ? names.filter(name => typeof name === "string") : [];
  } catch { return []; }
}

export function searchSnippets(files, query, recent = []) {
  const position = new Map(recent.map((name, index) => [name, index]));
  const needle = query.trim().toLowerCase();
  const letters = Array.from(needle);
  const matches = [];
  for (const file of files) {
    const title = file.slice(0, -3).toLowerCase();
    let rank = 0;
    if (needle && title !== needle) {
      if (title.startsWith(needle)) rank = 1;
      else if (title.includes(needle)) rank = 2;
      else {
        let at = 0;
        for (const char of title) {
          if (char === letters[at]) at++;
        }
        if (at !== letters.length) continue;
        rank = 3;
      }
    }
    matches.push({ file, rank });
  }
  return matches.sort((a, b) => a.rank - b.rank
    || (position.get(a.file) ?? recent.length) - (position.get(b.file) ?? recent.length)
    || a.file.localeCompare(b.file)).map(({ file }) => file);
}

export default class Snippets extends View {
  init(_props, cx) {
    this.terminal = focused()?.terminal ?? null;
    this.overlay = props()?.overlay;
    this.directory = `${appHome()}/snippets`;
    this.files = [];
    this.rows = [];
    this.selected = 0;
    this.error = null;
    this.loading = Boolean(this.terminal);
    this.inserting = false;
    this.handle = cx.focus_handle();
    this.list = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "Найти сниппет…" });
    this.input.on("change", (_event, cx) => {
      this.filter();
      this.list.scroll_to_item(0);
      cx.notify();
    });
    this.input.on("submit", (_event, cx) => { void this.insert(this.rows[this.selected], cx); });
    if (checking()) return;
    this.input.focus();
    cx.timer.after(100, () => this.input.focus());
    if (!this.terminal) return;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("/usr/bin/find", [this.directory, "-maxdepth", "1", "-type", "f", "-print0"]);
        if (result.code !== 0) throw new Error("Cannot list the snippets directory");
        this.files = result.stdout.split("\0").map(path => path.slice(path.lastIndexOf("/") + 1))
          .filter(file => /^[^.].*\.md$/i.test(file));
        this.filter();
      } catch {
        this.error = "Не удалось прочитать каталог сниппетов.";
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  filter() {
    this.rows = searchSnippets(this.files, this.input.value(), recentSnippets());
    this.selected = 0;
  }

  async insert(file, cx) {
    if (!file || !this.terminal || this.inserting) return;
    if (!terminals().some(terminal => terminal.address === this.terminal && terminal.state === "live")) {
      this.error = "Исходный терминал закрыт.";
      cx.notify();
      return;
    }

    this.inserting = true;
    this.error = null;
    cx.notify();
    try {
      const text = await readTextFile(`${this.directory}/${file}`);
      if (!text?.trim()) {
        this.error = "Файл сниппета пуст или недоступен.";
        return;
      }
      const config = await readTextFile(`${appHome()}/mods/gitview/config.json`);
      const addresses = config && JSON.parse(config);
      if (!addresses?.bin) {
        this.error = "Для вставки нужен установленный Herdr Gitview.";
        return;
      }
      const env = addresses.hc ? [`GITVIEW_HC=${addresses.hc}`] : [];
      const args = [...env, addresses.bin, "json", "send", "--terminal", this.terminal, "--", text];
      const result = await exec("/usr/bin/env", args, { timeout: 5000 });
      if (result.code !== 0) {
        this.error = "Вставка не удалась. Проверь, открыт ли терминал и поддерживает ли он вставку текста.";
        return;
      }
      // The paste already succeeded. A storage failure must not invite a second paste.
      try {
        const available = new Set(this.files);
        const history = recentSnippets().filter(name => name !== file && available.has(name));
        localStorage.setItem(RECENT_KEY, JSON.stringify([file, ...history]));
      } catch { /* Recency is optional. */ }
      closeOverlay(this.overlay);
    } catch {
      this.error = "Не удалось вставить сниппет.";
    } finally {
      this.inserting = false;
      cx.notify();
    }
  }

  key(event, cx) {
    const { key } = event;
    if (key === "escape") {
      closeOverlay(this.overlay);
    } else if ((key === "up" || key === "down") && this.rows.length) {
      const delta = key === "up" ? -1 : 1;
      this.selected = (this.selected + delta + this.rows.length) % this.rows.length;
      this.list.scroll_to_item(this.selected);
    } else return;
    cx.stop_propagation();
    cx.notify();
  }

  render() {
    const t = theme();
    let message = this.error;
    if (message === null) {
      if (!this.terminal) message = "Открой список из терминала.";
      else if (this.loading) message = "Загрузка…";
      else if (!this.files.length) message = "Добавь Markdown-файлы в каталог snippets.";
      else if (!this.rows.length) message = "Сниппеты не найдены.";
      else if (this.inserting) message = "Вставка…";
    }

    const rows = this.rows.map((file, index) => div().id(file).px(10).py(7).rounded(5).cursor_pointer()
      .when(index === this.selected, el => el.bg(t.selected))
      .hover(el => el.bg(t.hover)).text_color(t.foreground).truncate().child(file.slice(0, -3))
      .on_click((_event, cx) => { void this.insert(file, cx); }));
    return v_flex().id("snippets").track_focus(this.handle).size_full().min_h(0).gap(10).p(14)
      .bg(t.popover).text_size(13).on_key_down((event, cx) => this.key(event, cx))
      .child(Input.new(this.input).h(36).px(10).rounded(6).border_1().border_color(t.accent)
        .bg(t.background).text_color(t.foreground))
      .child(v_flex().id("snippets-list").flex_1().min_h(0).overflow_y_scrollbar()
        .track_scroll(this.list).children(rows))
      .when(Boolean(message), el => el.child(div().text_color(this.error ? t.blocked : t.muted).child(message)));
  }
}
