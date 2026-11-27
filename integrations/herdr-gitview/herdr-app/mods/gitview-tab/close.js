import { focused, notify, panes, spaces } from "herdr";
import { origins, ownSource, ownTab } from "./shared.js";
import { closeEditorOf, setEditor } from "./editors.js";
import { run } from "./telemetry.js";

export async function closeCurrent(space, tab) {
  const current = () => focused()?.space === space && focused()?.tab === tab;
  if (!tab || !space || !current()) return;
  if (ownTab(space) !== tab) return run("tab.close", { id: tab });
  const back = origins()[space];
  const after = [{ run: ["tab.close", { id: tab, confirmed: true }] }];
  if (spaces().find(s => s.id === space)?.tabs.some(t => t.id === back)) {
    after.push({ run: ["tab.select", { id: back }] });
    const terminal = ownSource(space, tab)?.terminal;
    const pane = terminal && panes().find(p => p.tab === back && p.terminal === terminal);
    if (pane) after.push({ run: ["pane.focus", { pane: pane.pane }] });
  }
  const state = await closeEditorOf(tab, { after });
  if (state === "unknown") return notify({ title: "gitview", body: "Cannot check the editor for unsaved changes; the tab stays open.", level: "warning" });
  if (state === "dirty" || !current()) return;
  setEditor(tab, null);
  for (const step of after) run(...step.run);
}
