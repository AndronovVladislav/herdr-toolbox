import { div } from 'gpui-kit';
import { v_flex } from 'gpui-base';
import { drawing } from './styles.js';

export function face(style, state, palette, small) {
  const ink = state.over ? palette.ansi3 : state.rest ? palette.ansi2 : palette.accent;
  const el = v_flex().items_start().flex_none().font_family('Menlo').text_size(small || style === 'ribbon' ? 9 : 11)
    .line_height('11px').text_color(state.status === 'paused' ? palette.muted : ink);
  // Nonbreaking spaces preserve the ASCII grid in GPUI's text layout.
  for (const row of drawing(style,state,small)) el.child(div().h(11).flex_none().child(row.replaceAll(' ', '\u00a0')));
  return el;
}
