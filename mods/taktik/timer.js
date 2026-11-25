const M = 60000;
const base = { focus: 25*M, short: 5*M, long: 15*M };
const ready = (phase, round, lastFocus = null) => ({ phase, round, left: base[phase], deadline: null,
  extra: 0, started: null, warned: false, lastFocus });
export const initial = () => ready('focus', 1);

export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || !Object.hasOwn(base, s.phase) || !Number.isInteger(s.round) || s.round < 1 || s.round > 4) return initial();
    const state = { ...ready(s.phase, s.round), ...s };
    if (!Number.isSafeInteger(state.extra) || state.extra < 0 || !Number.isSafeInteger(s.left) || s.left <= 0
      || s.left > base[s.phase] + state.extra || !(s.deadline === null || Number.isSafeInteger(s.deadline))) return initial();
    // The original timer recorded remaining time and the deadline, but no phase start timestamp.
    if (!('started' in s) && s.deadline !== null) state.started = s.deadline - base[s.phase];
    return state;
  } catch { return initial(); }
}

const left = (s, now) => s.deadline === null ? s.left : Math.max(0, Math.min(base[s.phase] + s.extra, s.deadline-now));
export const planned = s => base[s.phase];
export const canReset = s => s.deadline !== null || s.started !== null || s.extra > 0 || s.left !== planned(s);
export const elapsed = (s, now) => planned(s) + s.extra - left(s, now);
export function format(ms) {
  const seconds = Math.ceil(Math.max(0, ms)/1000);
  return [Math.floor(seconds/60), seconds%60].map(n => String(n).padStart(2,'0')).join(':');
}
export function clock(s, now) {
  const over = elapsed(s, now) - base.focus;
  if (s.phase === 'focus' && s.extra) return over >= 0 ? `+${format(Math.floor(over/1000)*1000)}` : format(-over);
  return format(left(s, now));
}

// Replay only elapsed boundaries, never start focus without a click. Times are Unix milliseconds.
export function step(state, now, action) {
  let s = state;
  const events = [];
  const record = (type, at, fields = {}) => events.push({ type, at, observedAt: now, phase: s.phase, round: s.round,
    started: s.started, planned: base[s.phase], extra: s.extra, elapsed: elapsed(s, at), ...fields });
  const cue = (name, at) => record('signal', at, { signal: name, deliveredAt: null });
  // Don't deliver a pending warning for an interval the user is explicitly discarding.
  // An already expired interval still completes normally, like a late toggle.
  if (action === 'reset' && (s.deadline === null || now < s.deadline)) {
    if (canReset(s)) {
      record('reset', now);
      s = ready(s.phase, s.round, s.lastFocus);
    }
    return { state:s, events, signal:null };
  }
  let changedPhase = false;
  while (s.deadline !== null) {
    const warningAt = s.deadline - (s.phase === 'focus' ? 5*M : M);
    if (!s.warned && now >= warningAt) {
      cue(s.phase === 'focus' ? 'focus-warning' : 'break-warning', warningAt);
      s = { ...s, warned: true };
    }
    if (now < s.deadline) break;
    const end = s.deadline;
    record('end', end);
    changedPhase = true;
    if (s.phase === 'focus') {
      s = ready(s.round === 4 ? 'long' : 'short', s.round, elapsed(s,end));
      s = { ...s, started: end, deadline: end+s.left };
      record('start', end);
      cue('break-start', end);
    } else {
      s = ready('focus', s.round%4+1, s.lastFocus);
      cue('focus-ready', end);
    }
  }
  if (!changedPhase && action === 'extend' && s.phase === 'focus' && s.deadline !== null) {
    s = { ...s, extra: s.extra+5*M, deadline:s.deadline+5*M, warned:false };
    record('extend', now, { deadline:s.deadline });
  } else if (!changedPhase && action === 'toggle') {
    if (s.deadline === null) {
      const resume = s.started !== null || s.left < base[s.phase] + s.extra;
      s = { ...s, started:s.started ?? now, deadline:now+s.left };
      record(resume ? 'resume' : 'start', now, { deadline:s.deadline });
    } else {
      s = { ...s, left:left(s, now), deadline:null };
      record('pause', now);
    }
  }
  // Emit only the most recent due cue (e.g. after system sleep).
  const latest = events.filter(e => e.type === 'signal').at(-1);
  if (latest) latest.deliveredAt = now;
  return { state:s, events, signal:latest?.signal ?? null };
}
