// node scripts/preview_taktik.mjs > docs/taktik-styles.svg
import { names, drawing, appearance } from '../mods/taktik/styles.js';
import { initial, step, clock } from '../mods/taktik/timer.js';
const M=60000;
const start=step(initial(),0,'toggle').state, extended=step(start,20*M,'extend').state;
const rest=step(extended,30*M).state, ready=step(rest,35*M).state;
const samples=[[start,12*M,'Фокус'],[extended,27*M,'Сверх плана'],[rest,32*M,'Перерыв'],[ready,35*M,'Начать фокус']];
const text=(x,y,value,size,color,align='start')=>`<text xml:space="preserve" x="${x}" y="${y}" text-anchor="${align}" fill="${color}" font-size="${size}">${value.replaceAll('&','&amp;').replaceAll('<','&lt;')}</text>`;
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="884" viewBox="0 0 600 884" font-family="system-ui, sans-serif"><title>Тактик — две фокус-ленты</title><rect width="600" height="884" fill="#222328"/>';
for(const [r,[s,now,label]] of samples.entries()) for(const [i,style] of Object.keys(names).entries()) {
  const x=20+i*290,y=32+r*215, a=appearance(s,now), ink=a.over?'#ecc17d':a.rest?'#96c7a2':'#9bb4ff';
  svg+=`<rect x="${x}" y="${y}" width="268" height="180" rx="4" fill="#191a1e" stroke="#494c53"/>`;
  svg+=text(x+10,y+18,names[style],12,'#ededed')+text(x+256,y+18,`${s.round}/4  ◫`,11,'#a4a7ad','end');
  const rows=drawing(style,a), size=style==='ribbon'?9:11;
  rows.forEach((line,j)=>[...line].forEach((ch,k)=>{
    if(ch!==' ') svg+=text(x+134+(k-(line.length-1)/2)*size*.6,y+84-(rows.length-1)*5.5+j*11+8,ch,size,ink,'middle');
  }));
  svg+=text(x+10,y+169,clock(s,now)+'  '+label,13,'#ededed');
}
console.log(svg+'</svg>');
