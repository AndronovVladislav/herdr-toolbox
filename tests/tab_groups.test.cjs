const {test}=require('node:test'), assert=require('node:assert/strict');
const {tabGroups,navigateTabs,STASH}=require('../mods/spaces-agents/tab-groups.js');
test('review and navigation use the origin group even when hidden items finish or need attention',()=>{
 const s={id:'s',tabs:['a','b','c','review'].map(id=>({id,active:id==='a'}))};
 const data={[STASH]:{b:'s'},'gitview.own':{s:'review'},'gitview.origins':{s:'b'}}, read=k=>data[k];
 for(const status of ['working','blocked','done']) {s.tabs[1].status=status;assert.deepEqual(tabGroups(s,read).visible.map(t=>t.id),['a','c']);}
 assert.deepEqual(navigateTabs(s,read,'2'),['tab.select',{id:'c'}]);assert.equal(navigateTabs(s,read,'3'),null);
 s.tabs[0].active=false;s.tabs[1].active=true;assert.deepEqual(navigateTabs(s,read,'next'),['tab.select',{id:'review'}]);
 delete data[STASH].b; assert.equal(tabGroups(s,read).split,false);
});
