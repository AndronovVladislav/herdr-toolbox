import { elapsed, planned } from './timer.js';

export const names = { ribbon: 'Пять секций', recorder: 'Самописец' };
const order = Object.keys(names);
export const nextStyle = style => order[(order.indexOf(style) + 1) % order.length];
const clamp = x => Math.max(0, Math.min(1, x));

export function appearance(s, now) {
  const used = elapsed(s, now), plan = planned(s);
  const ready = s.deadline === null && s.started === null && used === 0;
  return { status: ready ? 'ready' : s.deadline === null ? 'paused' : 'running', rest: s.phase !== 'focus',
    minutes: plan / 60000, usedMinutes: Math.floor(used / 60000), extraMinutes: s.extra / 60000,
    progress: clamp(used / plan), extended: s.extra > 0, over: s.extra > 0 && used >= plan,
    overtime: s.extra ? clamp((used - plan) / s.extra) : 0 };
}

// One cell per planned minute. In a narrow sidebar the sections wrap vertically.
function sections(a, narrow) {
  const span = a.minutes / 5;
  const groups = Array.from({length:5}, (_,i) => {
    const filled = Math.max(0, Math.min(span, a.usedMinutes-i*span));
    return '['+'#'.repeat(filled)+'.'.repeat(span-filled)+']';
  });
  return narrow ? groups : [groups.join(' ')];
}

function recorder(a,narrow) {
  const step = narrow ? a.minutes/5 : 1;
  const length = a.minutes/step;
  const mark = Math.min(length,Math.floor(a.usedMinutes/step));
  const labels = Array(length+2).fill(' '), ticks = Array(length+1).fill('-');
  for(let n=0;n<=length;n+=length/5) {
    ticks[n]='|';
    if (!n || n===length || (!narrow && length/5>=3)) {
      const label=String(n*step); labels.splice(n,label.length,...label);
    }
  }
  return [labels.join('').trimEnd(),ticks.join(''),'='.repeat(mark)+'^'+'.'.repeat(length-mark)];
}

export function drawing(style,a,narrow=false) {
  const rows = style==='recorder' ? recorder(a,narrow) : sections(a,narrow);
  if(a.extended) {
    const used=Math.max(0,a.usedMinutes-a.minutes), span=Math.min(5,a.extraMinutes);
    const filled=Math.min(span,Math.floor(used*span/a.extraMinutes));
    const tail='#'.repeat(filled)+'/'.repeat(span-filled);
    if(narrow) rows.push('+'+a.extraMinutes,tail);
    else rows.push('+'+a.extraMinutes+' ['+tail+']');
  }
  const width=Math.max(...rows.map(r=>r.length));
  return rows.map(r=>r.padEnd(width));
}
