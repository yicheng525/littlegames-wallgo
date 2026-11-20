import {N,pendingPiece,paths,wallOptions,legalActions,regions,edge,neighbors} from './game.js';
const $=id=>document.getElementById(id),colors=['#71cbb2','#f2c35b','#bfadf5'],letters='ABCDEFG',endpoint='https://little-games-wallgo-rooms.ciclol.chatgpt.site/v1/room',key='wallgo-room-v1';
let session=null,v=null,busy=false,inFlight=null,queued=null,timer=null,deadline=0,selected=-1,destination=null,wall=null,breakEnabled=false,errorCount=0,invitation='';
try{const s=JSON.parse(localStorage.getItem(key));if(s&&typeof s.code==='string'&&typeof s.token==='string')session=s;}catch{}
const say=s=>$('status').textContent=s,coord=p=>letters[p%7]+(Math.floor(p/7)+1),type=p=>p.type==='square'?'方棋':'圓棋';
function save(s){session=s;try{if(s)localStorage.setItem(key,JSON.stringify(s));else localStorage.removeItem(key);}catch{}}
function reset(){selected=-1;destination=null;wall=null;breakEnabled=false;$('break').checked=false;}
const grid=Array.from({length:49},(_,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',coord(i));b.onclick=()=>pick(i);$('board').append(b);return b;});
const dirButtons=['上','右','下','左'].map((name,i)=>{const b=document.createElement('button');b.type='button';b.textContent=name+'牆';b.onclick=()=>{const q=adjacent(destination?.to,i);if(q===null)return;wall=edge(destination.to,q);render();};$('directions').append(b);return b;});
function adjacent(p,d){if(p==null)return null;const q=p+[-7,1,7,-1][d];return neighbors(p).includes(q)?q:null;}
function mine(){return !!v?.game&&v.game.phase!=='done'&&v.game.turn===v.me;}
function locked(){return !!queued||busy&&inFlight!=='state';}
function availablePaths(){
 const g=v?.game;if(!g||selected<0)return [];
 return paths(g,selected,breakEnabled).filter(p=>wallOptions(g,p).length&&(!breakEnabled||p.broken));
}
function pick(cell){
 if(!mine()||locked()||(deadline&&Date.now()>=deadline))return;
 const g=v.game;
 if(g.phase==='setup'){selected=pendingPiece(g);destination={to:cell};wall=null;render();return;}
 const piece=g.pieces.findIndex(p=>p.pos===cell&&p.owner===v.me);
 if(piece>=0){selected=piece;destination=null;wall=null;render();return;}
 const choice=availablePaths().filter(p=>p.to===cell).sort((a,b)=>Number(!!a.broken)-Number(!!b.broken))[0];
 if(choice){destination=choice;wall=null;render();}
}
function svgLine(k,color,width=9,dash=''){
 const [a,b]=k.split(':').map(Number),x=a%7,y=Math.floor(a/7);
 return b-a===1?'<line x1="'+((x+1)*100)+'" y1="'+(y*100)+'" x2="'+((x+1)*100)+'" y2="'+((y+1)*100)+'" stroke="'+color+'" stroke-width="'+width+'" '+dash+'/>':
 '<line x1="'+(x*100)+'" y1="'+((y+1)*100)+'" x2="'+((x+1)*100)+'" y2="'+((y+1)*100)+'" stroke="'+color+'" stroke-width="'+width+'" '+dash+'/>';
}
function drawBoard(){
 const g=v.game,playing=g.phase==='play',ended=g.phase==='done',yourTurn=mine(),possible=yourTurn&&playing?availablePaths():[];
 const occupied=new Set(g.pieces.map(p=>p.pos));
 const owned=ended?regions(g):[];
 grid.forEach((b,i)=>{
  const index=g.pieces.findIndex(p=>p.pos===i),piece=g.pieces[index],preview=destination?.to===i,can=yourTurn&&!locked()&&(g.phase==='setup'?!occupied.has(i):piece?.owner===v.me||possible.some(p=>p.to===i));
  b.disabled=!can;
  b.className=(can&&!piece?'target ':'')+(index===selected?'selected ':'')+(preview?'preview-cell':'');
  const region=owned.find(r=>r.cells.includes(i));b.style.backgroundColor=region?.owner!=null?colors[region.owner]+'55':'';
  b.replaceChildren();
  if((i<7||i%7===0)){const c=document.createElement('span');c.className='cell-coordinate';c.textContent=coord(i);b.append(c);}
  if(piece){const s=document.createElement('span');s.className='piece '+piece.type+(index===selected?' focus':'');s.style.setProperty('--color',colors[piece.owner]);s.textContent=String(piece.owner+1);b.append(s);}
  else if(preview&&selected>=0){const s=document.createElement('span');s.className='piece ghost '+g.pieces[selected].type;s.style.setProperty('--color',colors[v.me]);s.textContent=String(v.me+1);b.append(s);}
  b.setAttribute('aria-label',coord(i)+(piece?'，'+v.seats[piece.owner].name+' '+type(piece):preview?'，已選落點':'，空格'));
 });
 let drawing=g.walls.map(k=>svgLine(k,k===g.last?.wall?'#fff0bf':'#63452a',9)).join('');
 if(destination?.broken)drawing+=svgLine(destination.broken,'#ee8769',12,'stroke-dasharray="10 7"');
 if(wall)drawing+=svgLine(wall,'#efffc5',12);
 $('board-art').innerHTML=drawing;
}
function render(){
 $('entry').hidden=!!session;$('room').hidden=!v;$('room-bar').hidden=!v;
 for(const id of ['create','practice','join'])$(id).disabled=busy;
 if(!v)return;
 const g=v.game,active=g&&g.phase!=='done',ended=g?.phase==='done';
 $('room-code').textContent=v.code;
 $('players').style.setProperty('--players',v.count);
 $('players').replaceChildren(...v.seats.map((p,i)=>{
  const el=document.createElement('div');el.className='player'+(active&&g.turn===i?' current':'');el.style.setProperty('--color',colors[i]);
  const name=document.createElement('strong');name.textContent=(i+1)+' · '+p.name+(p.ai?'（AI）':i===v.me?'（你）':'');
  const detail=document.createElement('small');detail.textContent=active?(g.count===3?'破牆 '+g.breakers[i]+' 次':'雙人 · 禁破牆'):p.ready?'已準備':'未準備';el.append(name,detail);return el;
 }));
 $('lobby').hidden=!!g;$('table').hidden=!g;$('result').hidden=!ended;$('history').hidden=!g;
 $('lobby-copy').textContent=v.count+' 人桌 · '+v.seats.length+' / '+v.count+' 席。所有人準備好後，由房主開局。';
 $('ready').textContent=v.seats[v.me].ready?'取消準備':'準備好了';
 $('ready').disabled=$('add-ai').disabled=$('remove-ai').disabled=$('start').disabled=busy;
 $('add-ai').hidden=!v.host||v.seats.length===v.count;
 $('remove-ai').hidden=!v.host||!v.seats.some(p=>p.ai);
 $('start').hidden=!v.host;$('start').disabled=busy||v.seats.length!==v.count||!v.seats.every(p=>p.ready);
 $('again-ready').textContent=v.seats[v.me].ready?'取消準備':'準備再來一局';
 $('again-ready').disabled=busy;$('again').hidden=!v.host;$('again').disabled=$('start').disabled;
 if(!g)return;
 $('stage').textContent=g.phase==='setup'?'佈子階段':ended?'領地結算':'第 '+(g.seq+1)+' 手';
 $('turn').textContent=ended?'疆界已定':mine()?'輪到你 · '+(g.phase==='setup'?'放置'+type(g.pieces[pendingPiece(g)]):'移動一顆棋，再造牆'):'等候 '+v.seats[g.turn].name+(v.seats[g.turn].ai?' 思考中':'');
 $('controls').hidden=!mine();
 $('break-wrap').hidden=g.phase!=='play'||!g.breakers[v.me];
 $('wall-controls').hidden=g.phase!=='play'||!destination;
 $('selected-title').textContent=selected<0?'選擇棋子':type(g.pieces[selected])+(g.pieces[selected].pos!==null?' · '+coord(g.pieces[selected].pos):'');
 $('instruction').textContent=ended?'專屬領地已著色；無棋區域與混合區域不計分。':!mine()?'可觀察棋盤。每手 90 秒，電腦會稍作思考。':g.phase==='setup'?'點一個空格，確認後才會佈子。':selected<0?'點自己的棋子，選擇要移動哪一顆。':!destination?'點亮起的落點；方棋直走，圓棋可以直角轉彎。':!wall?'選擇落點周圍的造牆方向。':'確認整手，或重新選擇。';
 const choices=destination&&selected>=0&&g.phase==='play'?wallOptions(g,destination):[];
 dirButtons.forEach((b,d)=>{const q=adjacent(destination?.to,d),k=q===null?null:edge(destination.to,q);b.disabled=locked()||!choices.includes(k);b.className=wall===k?'chosen':'';});
 $('preview').textContent=destination?(g.phase==='setup'?'放置於 '+coord(destination.to):'走到 '+coord(destination.to)+(destination.broken?' · 將使用一次破牆':'')+(wall?' · 已選造牆':' · 尚未選牆')):'操作尚未送出';
 $('confirm').textContent=queued?'等候送出…':busy&&inFlight==='play'?'送出中…':g.phase==='setup'?'確認佈子':'確認移動與造牆';
 $('confirm').disabled=locked()||!mine()||!destination||(g.phase==='play'&&!wall)||(g.phase==='setup'&&g.pieces.some(p=>p.pos===destination.to));
 $('cancel').disabled=locked();
 if(ended){
  const top=g.result[0],winners=g.result.filter(r=>r.total===top.total&&r.largest===top.largest);
  $('result-title').textContent=winners.map(r=>v.seats[r.owner].name).join('、')+(winners.length>1?' 並列獲勝':' 圍下勝局');
  $('scores').replaceChildren(...g.result.map(r=>{const li=document.createElement('li');const rank=g.result.findIndex(x=>x.total===r.total&&x.largest===r.largest)+1;li.textContent='第 '+rank+' 名 · '+v.seats[r.owner].name+'：'+r.total+' 格，最大單區 '+r.largest+' 格';li.style.color=colors[r.owner];return li;}));
 }
 $('events').replaceChildren(...v.events.slice().reverse().map(e=>{const li=document.createElement('li');li.textContent='#'+e.seq+' '+v.seats[e.owner].name+(e.auto?'（自動）':'')+' · '+(e.kind==='place'?'佈子 '+coord(e.to):coord(e.from)+' 到 '+coord(e.to)+(e.broken?'，破牆':'')+'，造牆');return li;}));
 drawBoard();clock();
}
function clock(){
 const g=v?.game;if(!g||g.phase==='done'){$('clock').textContent='';return;}
 const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));$('clock').textContent=seconds?'剩 '+seconds+' 秒':'時間到 · 同步中';$('clock').className=seconds<=10?'urgent':'';
 if(!seconds)$('confirm').disabled=true;
}
setInterval(clock,250);
async function request(op,extra={}){
 if(busy){if(op==='play'&&inFlight==='state'&&!queued){queued={op,extra,matchId:v.matchId,seq:v.game.seq};render();}return;}
 busy=true;inFlight=op;clearTimeout(timer);if(op!=='state')say('連線中…');render();
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...session,...extra}),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!response.ok){
   if(op==='state'&&[403,404].includes(response.status)){save(null);v=null;reset();}
   throw Error(result.error||'服務暫時忙碌。');
  }
  if(result.left){save(null);v=null;reset();$('info').open=true;}
  else{
   const old=v;
   if(result.token)save({code:result.view.code,token:result.token});
   v=result.view;
   if(!old||old.matchId!==v.matchId||old.game?.seq!==v.game?.seq){reset();if(v.game)$('info').open=false;}
   deadline=v.deadline?Date.now()+v.deadline-v.serverNow:0;
  }
  if(op!=='state'||errorCount)say('');errorCount=0;
 }catch(e){errorCount=Math.min(4,errorCount+1);say(e instanceof TypeError||e.name==='TimeoutError'?'連線中斷，正在嘗試恢復；回合倒數不會暫停。':e.message);}
 finally{
  busy=false;inFlight=null;const pending=queued;queued=null;render();
  if(pending&&v?.game&&v.matchId===pending.matchId&&v.game.seq===pending.seq&&mine())request('play',pending.extra);
  else schedule();
 }
}
function schedule(){clearTimeout(timer);if(session&&!document.hidden)timer=setTimeout(()=>request('state'),errorCount?Math.min(12000,errorCount*2500):2000);}
function enter(practice=false){
 const name=$('name').value.trim()||(practice?'玩家':'');
 if(!name){say('請輸入暱稱。');return;}
 request('create',{name,count:Number($('count').value),difficulty:$('difficulty').value,practice});
}
$('create').onclick=()=>enter(false);$('practice').onclick=()=>enter(true);
$('join').onclick=()=>{const name=$('name').value.trim(),code=$('code').value.trim().toUpperCase();if(!name){say('請輸入暱稱。');return;}request('join',{name,code});};
$('ready').onclick=$('again-ready').onclick=()=>request('ready',{ready:!v.seats[v.me].ready});
$('start').onclick=$('again').onclick=()=>request('start');
$('add-ai').onclick=()=>request('add-ai');$('remove-ai').onclick=()=>request('remove-ai');
$('cancel').onclick=()=>{reset();render();};
$('break').onchange=()=>{breakEnabled=$('break').checked;destination=null;wall=null;render();};
$('confirm').onclick=()=>{if(!mine()||$('confirm').disabled)return;request('play',{matchId:v.matchId,seq:v.game.seq,piece:selected,to:destination.to,wall,breakWall:!!destination.broken});};
$('leave').onclick=$('exit').onclick=()=>request('leave');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(v.code);say('房間代碼已複製。');}catch{say('房間代碼：'+v.code);}};
$('invite').onclick=async()=>{const url=new URL('./',location.href);url.searchParams.set('room',v.code);try{await navigator.clipboard.writeText(url.href);say('邀請連結已複製。');}catch{say('邀請連結：'+url.href);}};
invitation=(new URLSearchParams(location.search).get('room')||'').toUpperCase();if(/^[A-HJ-NP-Z2-9]{8}$/.test(invitation))$('code').value=invitation;
document.addEventListener('visibilitychange',schedule);
render();if(session)request('state');
