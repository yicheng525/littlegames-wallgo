const coordinate=n=>'ABCDEFG'[n%7]+(Math.floor(n/7)+1);
export function wallDescription(wall,to){
 if(!wall)return '';
 const [a,b]=wall.split(':').map(Number),other=a===to?b:a;
 const direction=other-to===-7?'上':other-to===1?'右':other-to===7?'下':'左';
 return coordinate(to)+' '+direction+'側';
}
export function describeEvent(event,names){
 const who=names[event.owner]||'玩家',automatic=event.auto?'（自動）':'';
 return who+automatic+' · '+(event.kind==='place'?'佈子 '+coordinate(event.to):coordinate(event.from)+' 到 '+coordinate(event.to)+(event.broken?'，破牆':'')+'，築牆 '+wallDescription(event.wall,event.to));
}
export function createRecorder(storage){
 let record=null;
 const cell=n=>Number.isInteger(n)&&n>=0&&n<49;
 const edge=k=>{if(typeof k!=='string'||!/^\d+:\d+$/.test(k))return false;const [a,b]=k.split(':').map(Number);return cell(a)&&cell(b)&&(b-a===7||b-a===1&&Math.floor(a/7)===Math.floor(b/7));};
 try{const raw=storage?.getItem('wallgo-record-v1');if(raw&&raw.length<100000){const saved=JSON.parse(raw);if(saved?.version===1&&typeof saved.matchId==='string'&&[2,3].includes(saved.count)&&Array.isArray(saved.names)&&saved.names.length===saved.count&&saved.names.every(n=>typeof n==='string'&&[...n].length<=14)&&Number.isInteger(saved.total)&&saved.total>=0&&saved.total<=225&&Array.isArray(saved.events)&&saved.events.length<=225&&saved.events.every(e=>Number.isInteger(e.seq)&&e.seq>0&&e.seq<=saved.total&&Number.isInteger(e.owner)&&e.owner>=0&&e.owner<saved.count&&cell(e.to)&&(e.kind==='place'||e.kind==='move'&&cell(e.from)&&edge(e.wall)))&&(!saved.result||Array.isArray(saved.result)&&saved.result.every(r=>Number.isInteger(r.owner)&&r.owner>=0&&r.owner<saved.count&&Number.isInteger(r.total)&&r.total>=0&&r.total<=49&&Number.isInteger(r.largest)&&r.largest>=0&&r.largest<=r.total)))record=saved;}}catch{}
 function capture(view){
  const g=view?.game;if(!g)return;
  const previous=record?JSON.stringify(record):'';
  if(record?.matchId!==view.matchId)record={version:1,matchId:view.matchId,count:view.count,names:view.seats.map(s=>s.name),events:[],total:0};
  const events=new Map(record.events.map(e=>[e.seq,e]));
  for(const e of view.events||[])events.set(e.seq,{...e});
  if(g.last&&!events.has(g.seq))events.set(g.seq,{...g.last,seq:g.seq});
  record.events=[...events.values()].filter(e=>e.seq>0&&e.seq<=g.seq).sort((a,b)=>a.seq-b.seq).slice(-225);
  record.total=g.seq;record.result=g.phase==='done'?g.result:null;
  if(JSON.stringify(record)!==previous)try{storage?.setItem('wallgo-record-v1',JSON.stringify(record));}catch{}
 }
 function summary(){return {known:record?.events.length||0,total:record?.total||0,complete:!!record&&record.events.length===record.total};}
 function text(){
  if(!record)return '';
  const info=summary(),lines=['圍棋圍牆2 · 本局棋譜',record.count+' 人對戰 · '+record.names.join('、'),'已記錄 '+info.known+' / '+info.total+' 手',info.complete?'棋譜完整。':'部分手數未被此裝置記錄，以下保留原手數，未補猜缺漏行動。',''];
  let previous=0;
  for(const e of record.events){if(e.seq>previous+1)lines.push('（缺少第 '+(previous+1)+'～'+(e.seq-1)+' 手）');lines.push('#'+e.seq+' '+describeEvent(e,record.names));previous=e.seq;}
  if(previous<record.total)lines.push('（缺少第 '+(previous+1)+'～'+record.total+' 手）');
  if(record.result){lines.push('','領地結算');for(const r of record.result)lines.push(record.names[r.owner]+'：'+r.total+' 格，最大單區 '+r.largest+' 格');}
  return lines.join('\n');
 }
 return {capture,summary,text};
}

