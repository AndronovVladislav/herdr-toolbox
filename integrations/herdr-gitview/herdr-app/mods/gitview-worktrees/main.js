import { View, div } from "gpui-kit";
import { v_flex, Input, InputState, ScrollHandle } from "gpui-base";
import { checking, closeOverlay, exec, focused, hc, panes, props, shared, theme } from "herdr";
import { snapshot, apply } from "./picker.js";

const KEYS = { escape: "dismiss", up: "up", down: "down", enter: "accept" };

export default class Worktrees extends View {
  init(_props,cx) {
    const p = props() || {};
    this.source = p.source;
    this.overlay = p.overlay;
    this.rows = []; this.selected = 0;
    this.input = InputState.new({placeholder:"Найти ветку или путь…"});
    this.handle = cx.focus_handle(); this.scroll = ScrollHandle.new();
    this.input.on("change",(_e,cx) => { this.selected = 0; this.scroll.scroll_to_item(0); cx.notify(); });
    this.input.on("submit",(_e,cx) => this.choose(this.matches()[this.selected],cx));
    if (checking() || !this.source) return;
    this.input.focus();
    cx.bind_keys(Object.entries(KEYS).map(([keystroke, action]) => ({ keystroke, action: "gitview_worktrees_" + action, context: "GitviewWorktrees" })));
    this.loading = true;
    cx.spawn(async cx => {
      try { const data = await snapshot(exec,this.source); this.repo=data.repo; this.rows=data.rows; }
      catch(e) { this.error=String(e.message || e); }
      finally { this.loading=false; cx.notify(); }
    });
  }
  matches() {
    const q = this.input.value().trim().toLowerCase();
    return [{path:null,name:"Следовать за сессией"}, ...this.rows].filter(r => (r.name+" "+(r.path || "")).toLowerCase().includes(q));
  }
  current() {
    const s=this.source, f=focused();
    if (f?.tab !== s.tab || f.space !== s.space) return false;
    const ps=panes();
    const paneCwd=ps.find(p => p.terminal === s.terminal)?.cwd;
    if (!s.worktree && paneCwd && paneCwd !== s.sourceCwd) return false;
    if (shared("gitview.own")?.[s.space] === s.tab) {
      const saved=shared("gitview.ownSource")?.[s.space];
      return saved?.tab !== s.tab || saved.location?.terminal === s.terminal;
    }
    const terminal=ps.find(p => p.tab === s.tab && p.pane === f.pane)?.terminal || f.terminal;
    return !terminal || terminal === s.terminal;
  }
  async choose(row,cx) {
    if (!row || this.busy || this.loading || !this.source) return;
    this.busy=true; cx.notify();
    cx.spawn(async task => {
      try { await apply({exec,hc,current:()=>this.current()},this.source,this.repo,row.path); closeOverlay(this.overlay); }
      catch(e) { this.error=String(e.message || e); }
      finally { this.busy=false; task.notify(); }
    });
  }
  render() {
    const t=theme(), rows=this.matches(), s=this.source;
    const root = v_flex().id("gitview-worktrees").key_context("GitviewWorktrees").track_focus(this.handle).size_full().min_h(0).p(14).gap(8).bg(t.popover).text_color(t.foreground).text_size(13);
    for (const action of Object.values(KEYS)) root.on_action("gitview_worktrees_" + action, (_e, cx) => {
      cx.stop_propagation();
      if (action === "dismiss") closeOverlay(this.overlay);
      else if (action === "accept") this.choose(rows[this.selected],cx);
      else if (rows.length) {
        this.selected=(this.selected+rows.length+(action === "down" ? 1 : -1)) % rows.length;
        this.scroll.scroll_to_item(this.selected); cx.notify();
      }
    });
    return root
      .child(div().font_semibold().child("Рабочая копия для Gitview и Spectra"))
      .child(Input.new(this.input).h(32).px(8).border_1().border_color(t.border))
      .child(v_flex().id("worktree-list").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).children(rows.map((r,i) =>
        v_flex().id("wt-"+i).flex_none().px(10).py(5).cursor_pointer().when(i===this.selected,el=>el.bg(t.selected)).hover(el=>el.bg(t.hover))
          .child(div().truncate().child((s && (r.path === null ? !s.pinned : r.path === s.worktree && s.pinned) ? "✓ " : "")+r.name))
          .when(Boolean(r.path),el=>el.child(div().text_size(11).text_color(t.dim).truncate().child(r.path)))
          .tooltip(r.path || "Снять ручное закрепление").on_click((_e,cx)=>this.choose(r,cx)))))
      .child(div().text_size(11).text_color(this.error ? t.blocked : t.dim).child(this.error || (this.loading ? "Загрузка…" : rows.length ? "↑↓ выбрать · Enter применить · Esc отменить" : "Нет совпадений")));
  }
}
