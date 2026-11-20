export const N=7;
const inside=p=>Number.isInteger(p)&&p>=0&&p<49;
export const edge=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
export const neighbors=p=>[p-7,p+1,p+7,p-1].filter(q=>inside(q)&&Math.abs((p%7)-(q%7))+Math.abs(Math.floor(p/7)-Math.floor(q/7))===1);
export function createGame(count){
 if(![2,3].includes(count))throw Error('請選擇雙人或三人。');
 const pieces=[];
 for(let owner=0;owner<count;owner++){
  const types=count===2?['square','square','round','round']:['square','round'];
  types.forEach((type,k)=>pieces.push({owner,type,pos:count===2&&k>=2?(owner===0?[0,6]:[48,42])[k-2]:null}));
 }
 return {count,pieces,roundFirst:count===3,walls:[],breakers:Array(count).fill(count===3?1:0),phase:'setup',placement:0,turn:0,seq:0,last:null,reason:null};
}
export function placementOrder(g){
 return g.count===3?[0,1,2,2,1,0]:[0,1,1,0];
}
export function pendingPiece(g){
 const owner=placementOrder(g)[g.placement];
 if(g.roundFirst){const type=g.placement<g.count?'round':'square';return g.pieces.findIndex(p=>p.owner===owner&&p.type===type&&p.pos===null);}
 return g.pieces.findIndex(p=>p.owner===owner&&p.pos===null);
}
export function paths(g,index,useBreaker=false){
 const p=g.pieces[index];if(!p||p.pos===null)return [];
 const occupied=new Set(g.pieces.filter((_,i)=>i!==index).map(p=>p.pos)),walls=new Set(g.walls),out=[];
 const walk=(route)=>{
  let broken=null;
  for(let i=1;i<route.length;i++){
   if(!inside(route[i])||!neighbors(route[i-1]).includes(route[i])||occupied.has(route[i]))return;
   const k=edge(route[i-1],route[i]);
   if(walls.has(k)){
    if(!useBreaker||!g.breakers[p.owner]||broken)return;
    broken=k;
   }
  }
  const to=route.at(-1);
  if(out.some(x=>x.to===to&&x.broken===broken))return;
  out.push({piece:index,to,broken,route});
 };
 for(const a of neighbors(p.pos)){
  walk([p.pos,a]);
  if(p.type==='square'){
   const b=a+(a-p.pos);if(inside(b))walk([p.pos,a,b]);
  }else{
   const d=a-p.pos;
   for(const b of neighbors(a))if(Math.abs(b-a)!==Math.abs(d))walk([p.pos,a,b]);
  }
 }
 return out;
}
export function wallOptions(g,path){
 return neighbors(path.to).map(q=>edge(path.to,q)).filter(k=>k!==path.broken&&!g.walls.includes(k));
}
export function legalActions(g,owner=g.turn){
 const out=[];
 g.pieces.forEach((p,i)=>{if(p.owner!==owner)return;
  const routes=[...paths(g,i,false),...(g.breakers[owner]?paths(g,i,true).filter(x=>x.broken):[])];
  for(const route of routes)for(const wall of wallOptions(g,route))out.push({...route,wall});
 });
 return out;
}
export function regions(g){
 const walls=new Set(g.walls),seen=new Set(),result=[];
 for(let p=0;p<49;p++){
  if(seen.has(p))continue;
  const cells=[p];seen.add(p);
  for(let i=0;i<cells.length;i++)for(const q of neighbors(cells[i]))if(!seen.has(q)&&!walls.has(edge(cells[i],q))){seen.add(q);cells.push(q);}
  const owners=[...new Set(g.pieces.filter(p=>p.pos!==null&&cells.includes(p.pos)).map(p=>p.owner))];
  result.push({cells,owners,owner:owners.length===1?owners[0]:null});
 }
 return result;
}
export function scores(g){
 const groups=regions(g);
 return Array.from({length:g.count},(_,owner)=>{
  const sizes=groups.filter(r=>r.owner===owner).map(r=>r.cells.length);
  return {owner,total:sizes.reduce((a,b)=>a+b,0),largest:Math.max(0,...sizes)};
 }).sort((a,b)=>b.total-a.total||b.largest-a.largest);
}
export function isFinished(g){return regions(g).every(r=>r.owners.length<=1);}
function finish(g,reason){g.phase='done';g.turn=null;g.reason=reason;g.result=scores(g);}
export function apply(g,b){
 if(!['setup','play'].includes(g.phase))throw Error('這局已結束。');
 if(b.seq!==g.seq)throw Error('棋局已更新，請重新選擇。');
 if(g.phase==='setup'){
  const piece=pendingPiece(g);
  if(!inside(b.to)||g.pieces.some(p=>p.pos===b.to))throw Error('請選擇空格。');
  g.pieces[piece].pos=b.to;g.last={owner:g.turn,kind:'place',piece,to:b.to};
  g.placement++;g.seq++;
  if(g.placement===placementOrder(g).length){g.phase='play';g.turn=0;if(isFinished(g))finish(g,'territory');}
  else g.turn=placementOrder(g)[g.placement];
  return g.last;
 }
 const action=legalActions(g).find(a=>a.piece===b.piece&&a.to===b.to&&a.wall===b.wall&&!!a.broken===!!b.breakWall);
 if(!action)throw Error('這手無效。請先選落點，再選相鄰空牆邊。');
 const owner=g.turn,from=g.pieces[action.piece].pos;
 if(action.broken){g.walls=g.walls.filter(k=>k!==action.broken);g.breakers[owner]--;}
 g.pieces[action.piece].pos=action.to;g.walls.push(action.wall);g.seq++;
 g.last={owner,kind:'move',piece:action.piece,from,to:action.to,wall:action.wall,broken:action.broken};
 if(isFinished(g))finish(g,'territory');
 else if(g.seq>220)finish(g,'limit');
 else{
  let next=owner;
  for(let i=0;i<g.count;i++){next=(next+1)%g.count;if(legalActions(g,next).length){g.turn=next;return g.last;}}
  finish(g,'noMoves');
 }
 return g.last;
}
function distances(g,owner){
 const walls=new Set(g.walls),d=Array(49).fill(99),queue=[];
 for(const p of g.pieces)if(p.owner===owner&&p.pos!==null){d[p.pos]=0;queue.push(p.pos);}
 for(let i=0;i<queue.length;i++)for(const q of neighbors(queue[i]))if(!walls.has(edge(queue[i],q))&&d[q]>d[queue[i]]+1){d[q]=d[queue[i]]+1;queue.push(q);}
 return d;
}
function evaluate(g,owner){
 const regionsNow=regions(g),exact=scores(g),self=exact.find(x=>x.owner===owner);
 if(g.phase==='done'){
  const best=exact[0];return self.total*12+self.largest+(best.owner===owner?500:0);
 }
 const ds=Array.from({length:g.count},(_,i)=>distances(g,i));
 let score=self.total*7+self.largest*.15;
 for(const r of regionsNow)if(r.owners.includes(owner)&&r.owners.length>1)for(const cell of r.cells){
  const ours=ds[owner][cell],theirs=Math.min(...ds.filter((_,i)=>i!==owner).map(d=>d[cell]));
  score+=ours<theirs?1.1:ours===theirs?.3:-.3;
 }
 return score+g.breakers[owner]*.4;
}
export function chooseAI(g,difficulty='normal',random=Math.random){
 if(g.phase==='setup'){
  const occupied=new Set(g.pieces.filter(p=>p.pos!==null).map(p=>p.pos));
  const ours=g.pieces.filter(p=>p.owner===g.turn&&p.pos!==null);
  const others=g.pieces.filter(p=>p.owner!==g.turn&&p.pos!==null);
  const options=Array.from({length:49},(_,to)=>to).filter(to=>!occupied.has(to)).map(to=>{
   const dist=p=>Math.abs(to%7-p.pos%7)+Math.abs(Math.floor(to/7)-Math.floor(p.pos/7));
   return {to,score:Math.min(6,...others.map(dist))*.7+Math.min(4,...ours.map(dist))*.4-Math.abs(3-to%7)*.14-Math.abs(3-Math.floor(to/7))*.14+random()*.7};
  }).sort((a,b)=>b.score-a.score);
  return {seq:g.seq,to:options[0].to};
 }
 const candidates=legalActions(g);
 if(!candidates.length)return null;
 if(difficulty==='easy'&&random()<.5){const c=candidates[Math.floor(random()*candidates.length)];return {seq:g.seq,...c,breakWall:!!c.broken};}
 const ranked=candidates.map(c=>{
  const copy=structuredClone(g);apply(copy,{seq:g.seq,...c,breakWall:!!c.broken});
  return {c,score:evaluate(copy,g.turn)+random()*(difficulty==='easy'?2:.25)};
 }).sort((a,b)=>b.score-a.score);
 return {seq:g.seq,...ranked[0].c,breakWall:!!ranked[0].c.broken};
}
