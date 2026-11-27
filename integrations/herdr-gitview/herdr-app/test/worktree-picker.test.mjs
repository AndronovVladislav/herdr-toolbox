import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { entries, snapshot, apply } from '../mods/gitview-worktrees/picker.js';

test('list linked worktrees, pin and unpin the source terminal, reject stale picks', async t => {
  const tmp=realpathSync(mkdtempSync(join(tmpdir(),'gv-picker-'))); t.after(()=>rmSync(tmp,{recursive:true,force:true}));
  const root=join(tmp,'main'), linked=join(tmp,'linked tree');
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'});
  git('init','-q','-b','main',root); git('-C',root,'-c','user.name=Example','-c','user.email=demo@example.org','-c','commit.gpgsign=false','commit','-qm','start','--allow-empty');
  git('-C',root,'worktree','add','-q','-b','topic',linked);
  const exec=async(cmd,args,{on})=>{assert.equal(on,null); return {code:0,stdout:git(...args)};};
  const src={cwd:root,on:null,terminal:'t1',worktree:root,pinned:false};
  let pin=null, live=true, active=true; const writes=[];
  const hc=async args=>{if(args[0]==='get') return {code:0,stdout:JSON.stringify({state:live?'live':'dead',labels:{'gitview.worktree':root,'gitview.pinnedWorktree':pin}})};
    writes.push(args); return {code:0};};
  const api={exec,hc,current:()=>active}; const {rows,repo}=await snapshot(exec,src);
  assert.deepEqual(rows.map(r=>[r.path,r.name]),[[root,'main'],[linked,'topic']]);
  await apply(api,src,repo,linked); assert.deepEqual(writes.pop(),['label','t1','gitview.pinnedWorktree='+linked]);
  pin=linked; await assert.rejects(apply(api,src,repo,root),/Source changed/);
  await apply(api,{...src,worktree:linked,pinned:true},repo,null); assert.deepEqual(writes.pop(),['label','t1','gitview.pinnedWorktree=']);
  pin=null; await assert.rejects(apply(api,src,repo,tmp),/Worktree changed/);
  active=false; await assert.rejects(apply(api,src,repo,linked),/Source changed/);
  active=true;live=false;await assert.rejects(apply(api,src,repo,linked),/Source changed/); assert.deepEqual(writes,[]);
  assert.equal(git('-C',root,'branch','--show-current').trim(),'main');
});

test('exclude bare and prunable records; preserve detached worktrees and literal paths',()=>{
  assert.deepEqual(entries('worktree /bare\0bare\0\0worktree /gone\0prunable reason\0\0worktree /space\nline\0HEAD abc12345ffff\0detached\0\0'),[{path:'/space\nline',name:'detached abc12345'}]);
});
