import { div } from 'gpui-kit';
import { h_flex, v_flex } from 'gpui-base';
import { drawing } from './styles.js';

export function face(style, state, palette, small) {
  const ink = state.over ? palette.ansi3 : state.rest ? palette.ansi2 : palette.accent;
  const size = small || style === 'ribbon' ? 9 : 11;
  const el = v_flex().items_start().flex_none().text_size(size).line_height('11px')
    .text_color(state.status === 'paused' ? palette.muted : ink);
  // Keep columns aligned even when the inherited UI font is proportional.
  for (const row of drawing(style,state,small)) {
    const line = h_flex().h(11).flex_none();
    for (const ch of row) line.child(div().w(size * 0.6).flex_none().flex().justify_center().child(ch));
    el.child(line);
  }
  return el;
}
