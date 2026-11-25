// A split line holds indices into the engine's unified rows, never copies of the file.
// Null means padding, not a line the cursor or a note can attach to.
export function splitLayout(rows) {
  const lines = [], positions = new Array(rows.length);
  function push(left, right) {
    for (const index of [left, right]) if (index !== null) positions[index] = lines.length;
    lines.push({ left, right });
  }
  for (let i = 0; i < rows.length;) {
    if (rows[i].k !== 'del' && rows[i].k !== 'add') {
      push(i, i);
      i++;
      continue;
    }
    const left = [], right = [];
    while (i < rows.length && (rows[i].k === 'del' || rows[i].k === 'add')) {
      (rows[i].k === 'del' ? left : right).push(i++);
    }
    for (let j = 0; j < Math.max(left.length, right.length); j++) push(left[j] ?? null, right[j] ?? null);
  }
  return { lines, positions };
}

export function sideOf(layout, index, preferred) {
  return layout.lines[layout.positions[index]]?.[preferred] === index ? preferred : preferred === 'left' ? 'right' : 'left';
}

export function splitStep(layout, index, delta, preferred) {
  const at = layout.positions[index];
  if (at === undefined) return index;
  const line = layout.lines[Math.max(0, Math.min(layout.lines.length - 1, at + delta))];
  return line[preferred] ?? line.left ?? line.right;
}

export function splitRange(layout, anchor, cursor, side) {
  const a = layout.positions[anchor], b = layout.positions[cursor];
  return layout.lines.slice(Math.min(a, b), Math.max(a, b) + 1).map(line => line[side]).filter(i => i !== null);
}
