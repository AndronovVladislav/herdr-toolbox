// Shared state contains membership only. Opening a tab or reporting attention never changes it.
export const STASH = "spaces-agents.stashed-tabs.v1";
export function tabGroups(space, read) {
  const tabs = space?.tabs || [], spaceId = space?.id;
  const saved = read(STASH) || {}, review = read("gitview.own")?.[spaceId], origin = read("gitview.origins")?.[spaceId];
  const hidden = id => Boolean(spaceId && id && saved[id === review ? origin : id] === spaceId);
  const current = tabs.find(t => t.active)?.id;
  const away = hidden(current), split = tabs.some(t => hidden(t.id));
  return { hidden, away, split, visible: tabs.filter(t => hidden(t.id) === away), current, review };
}
export function navigateTabs(space, read, command) {
  const {split,visible,current} = tabGroups(space,read);
  const n = Number(command);
  if (!split) return n ? ["tab.select",{index:n}] : ["tab."+command,{}];
  const tabs = visible.filter(t => !t.settled || t.id === current);
  const i = tabs.findIndex(t => t.id === current);
  const target = tabs[n ? n-1 : (i + (command === "next" ? 1 : -1) + tabs.length) % tabs.length];
  return target ? ["tab.select",{id:target.id}] : null;
}
