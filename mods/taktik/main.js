import { View, div } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { appHome, checking, exec, notify, playSound, settings, theme } from 'herdr';
import { canReset, clock, format, restore, step } from './timer.js';
import { appearance, names, nextStyle } from './styles.js';
import { face } from './face.js';

const KEY = 'timer.v1';
const label = { focus:'Фокус', short:'Перерыв', long:'Длинный перерыв' };
const messages = { 'focus-warning':'До конца фокуса 5 минут.', 'break-warning':'До конца отдыха минута.',
  'focus-ready':'Отдых окончен. Нажми ▶, когда будешь готов начать фокус.' };
const summary = ms => `Фокус: ${ms/60000} мин · +${(ms-25*60000)/60000} мин сверх плана`;

export default class Taktik extends View {
  init(_props, cx) {
    this.width = 268;
    const saved = localStorage.getItem('appearance');
    this.style = Object.hasOwn(names, saved) ? saved : 'ribbon';
    this.queue = Promise.resolve();
    this.sync(cx);
    cx.timer.every(1000, cx => this.sync(cx));
  }

  log(events) {
    if (!events.length) return;
    this.queue = this.queue.then(async () => {
      if (localStorage.getItem('journal.full') === 'true') return;
      const root = appHome();
      const result = await exec('/usr/bin/env', ['python3', `${root}/mods/taktik/journal.py`,
        `${root}/data/taktik/events.jsonl`, JSON.stringify(events)]);
      if (result.code !== 0) throw new Error(result.stderr || 'Failed to append timer events');
      if (result.stdout.trim() === 'full') {
        localStorage.setItem('journal.full','true');
        notify({title:'Тактик', body:'Журнал заполнен (10 МБ). Запись статистики остановлена, таймер продолжает работать.'});
      }
      this.logError = false;
    }).catch(() => {
      if (!this.logError) notify({title:'Тактик', body:'Не удалось записать статистику. Таймер продолжает работать.'});
      this.logError = true;
    });
  }

  sync(cx, action) {
    const now = Date.now();
    const before = restore(localStorage.getItem(KEY));
    const { state, events, signal } = step(before, now, action);
    if (!checking() && state !== before) {
      localStorage.setItem(KEY, JSON.stringify(state));
      this.log(events);
      if (signal) {
        playSound(`mods/taktik/sounds/${signal}.mp3`);
        notify({title:'Тактик', body:signal === 'break-start'
          ? `${summary(state.lastFocus)}. ${label[state.phase]}: ${format(state.left)}.` : messages[signal]});
      }
    }
    const time = clock(state, now);
    const changed = this.time !== time || this.state?.deadline !== state.deadline || this.state?.phase !== state.phase || this.state?.round !== state.round;
    this.state = state;
    this.time = time;
    if (changed || action === 'reset') cx.notify();
  }

  cycleStyle(cx) {
    this.style = nextStyle(this.style);
    localStorage.setItem('appearance', this.style);
    cx.notify();
  }

  render() {
    const t = theme(), s = this.state;
    const a = appearance(s, Date.now());
    const running = s.deadline !== null;
    const compact = this.width < 180;
    const extend = running && s.phase === 'focus';
    const resetButton = !compact && canReset(s);
    const waiting = s.phase === 'focus' && !running && s.started === null;
    const caption = waiting ? 'Начать фокус' : label[s.phase];
    const next = `Следующий вид: ${names[nextStyle(this.style)]}`;
    const hint = [...(compact ? [caption, `⌥ + клик: ${next}`] : []),
      ...(extend && s.extra ? [`До отдыха: ${format(s.deadline - Date.now())}`] : []),
      ...(s.lastFocus > 25*60000 ? [`Прошлый фокус: +${(s.lastFocus-25*60000)/60000} мин сверх плана`] : []),
      ...(!resetButton && canReset(s) ? ['Shift + клик: сбросить интервал'] : []),
      ...(extend && compact ? ['Правый клик: ещё 5 минут'] : [])].join('\n');
    const action = running ? 'Ⅱ' : '▶';
    const instrument = h_flex().id('taktik-toggle').w_full().flex_1().min_h(0).justify_center().items_center()
      .cursor_pointer().when(Boolean(hint), el => el.tooltip(hint)).hover(el => el.bg(t.hover))
      .on_click((e,cx) => compact && e.modifiers?.alt ? this.cycleStyle(cx) : this.sync(cx,e.modifiers?.shift ? 'reset' : 'toggle'))
      .when(extend && compact, el => el.on_mouse_down('right', (_e,cx) => { cx.stop_propagation(); this.sync(cx,'extend'); }))
      .child(face(this.style,a,t,this.width < 236));
    const button = (id, text, tip, press) => div().id(id).px(5).h(22).flex().items_center().rounded(4)
      .text_size(12).cursor_pointer().text_color(t.muted).hover(el => el.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).on_click((_e,cx) => press(cx)).child(text);
    return v_flex().id('taktik').size_full().min_w(0).overflow_hidden().bg(t.chrome).text_color(t.foreground)
      .border_t(1).border_color(t.border).px(compact ? 1 : 8).py(4)
      .on_size_change((size,cx) => {
        const width = size.width / (settings().zoom || 1);
        if ([180,236].some(cut => (width < cut) !== (this.width < cut))) cx.notify();
        this.width = width;
      })
      .child(h_flex().w_full().h(22).flex_none().items_center().gap(4)
        .when(compact, el => el.justify_center())
        .when(!compact, el => el.child(div().flex_1().min_w(0).truncate().text_size(11).font_semibold().child(names[this.style])))
        .child(div().font_family('Menlo').text_color(t.muted).text_size(10).child(`${s.round}/4`))
        .when(!compact, el => el.child(button('taktik-style','◫',next,cx => this.cycleStyle(cx)))))
      .child(instrument)
      .child(h_flex().w_full().h(26).flex_none().items_center().gap(compact ? 0 : 3)
        .when(compact, el => el.justify_center())
        .child(h_flex().id('taktik-clock').min_w(0).items_center().gap(4).cursor_pointer()
          .on_click((_e,cx) => this.sync(cx,'toggle'))
          .when(!compact, el => el.flex_1().child(div().text_size(10).text_color(t.muted).child(action)))
          .child(div().flex_none().font_family('Menlo').font_semibold().text_size(compact ? 9 : 14)
            .text_color(a.over ? t.ansi3 : t.foreground).child(this.time))
          .when(!compact, el => el.child(div().min_w(0).truncate().text_size(11).text_color(t.muted).child(caption))))
        .when(extend && !compact, el => el.child(button('taktik-extend','+5','Ещё 5 минут фокуса',cx => this.sync(cx,'extend'))))
        .when(resetButton, el => el.child(button('taktik-reset','↺','Сбросить текущий интервал',cx => this.sync(cx,'reset')))));
  }
}
