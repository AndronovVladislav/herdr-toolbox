// Paths in porcelain -z are literal (including spaces, tabs and newlines).
export function entries(output) {
  return output.split("\0\0").flatMap(record => {
    const fields = record.split("\0");
    if (!fields[0].startsWith("worktree ") || fields.some(f => f === "bare" || /^prunable(?: |$)/.test(f))) return [];
    const path = fields[0].slice(9);
    const branch = fields.find(f => f.startsWith("branch refs/heads/"))?.slice(18);
    return [{path, name: branch || "detached " + (fields.find(f => f.startsWith("HEAD ")) || "").slice(5,13)}];
  });
}

const line = text => text.replace(/\r?\n$/, "");
async function git(exec, on, cwd, args) {
  const r = await exec("git", ["-C",cwd,...args], {on,timeout:8000});
  if (r.code !== 0) throw new Error("Worktree unavailable: " + cwd);
  return r.stdout;
}
const common = (exec,on,cwd) => git(exec,on,cwd,["rev-parse","--path-format=absolute","--git-common-dir"]).then(line);
const list = (exec,on,cwd) => git(exec,on,cwd,["worktree","list","--porcelain","-z"]).then(entries);

export async function snapshot(exec,src) {
  if (!src.cwd) throw new Error("Invalid checkout. Remove the pin to follow the session.");
  return {repo:await common(exec,src.on,src.cwd), rows:await list(exec,src.on,src.cwd)};
}

export async function apply({exec,hc,current}, src, repo, path) {
  const validate = async () => {
    const r = await hc(["get",src.terminal,"--json"]);
    const t = r.code === 0 && JSON.parse(r.stdout);
    const pin = t?.labels?.["gitview.pinnedWorktree"] || null;
    const checkout = pin || t?.labels?.["gitview.worktree"] || null;
    if (t?.state !== "live" || checkout !== (src.worktree || null) || Boolean(pin) !== Boolean(src.pinned) || !current()) throw new Error("Source changed. Reopen the picker.");
  };
  if (!src?.terminal || (src.terminal.includes("/") ? src.terminal.split("/")[0] : null) !== (src.on || null)) throw new Error("No matching source terminal");
  await validate();
  if (path !== null) {
    if (!repo || await common(exec,src.on,src.cwd) !== repo || !(await list(exec,src.on,src.cwd)).some(row => row.path === path) || await common(exec,src.on,path) !== repo || line(await git(exec,src.on,path,["rev-parse","--show-toplevel"])) !== path) throw new Error("Worktree changed. Reopen the picker.");
  }
  await validate();
  const r = await hc(["label",src.terminal,"gitview.pinnedWorktree=" + (path ?? "")]);
  if (r.code !== 0) throw new Error(r.stderr || "Could not update worktree pin");
}
