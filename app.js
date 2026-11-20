import {N,pendingPiece,paths,wallOptions,legalActions,regions,edge,neighbors} from './game.js?v=2';
const $=id=>document.getElementById(id),colors=['#71cbb2','#f2c35b','#bfadf5'],letters='ABCDEFG',endpoint='https://little-games-wallgo-rooms.ciclol.chatgpt.site/v1/room',key='wallgo-room-v1';
let session=null,v=null,busy=false,inFlight=null,queued=null,timer=null,deadline=0,selected=-1,destination=null,moveConfirmed=false,wall=null,breakEnabled=false,errorCount=0,invitation='';
let wallDrag=null,suppressClickUntil=0,management=null,boardStamp='',connectionIssue=false,needsSync=false,lastSync=0;
try{const s=JSON.parse(localStorage.getItem(key));if(s&&typeof s.code==='string'&&typeof s.token==='string')session=s;}catch{}
const say=s=>$('status').textContent=s,coord=p=>letters[p%7]+(Math.floor(p/7)+1),type=p=>p.type==='square'?'方棋':'圓棋';
function save(s){session=s;try{if(s)localStorage.setItem(key,JSON.stringify(s));else localStorage.removeItem(key);}catch{}}
function reset(){wallDrag=null;selected=-1;destination=null;moveConfirmed=false;wall=null;breakEnabled=false;$('break').checked=false;}
const grid=Array.from({length:49},(_,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',coord(i));b.onclick=e=>{if(e?.detail&&Date.now()<suppressClickUntil)return;pick(i);};$('board').append(b);return b;});
const dirButtons=['上','右','下','左'].map((name,i)=>{const b=document.createElement('button');b.type='button';b.textContent=name+'牆';b.onclick=()=>pickWall(i);$('directions').append(b);return b;});
function pickWall(direction){
 if(!mine()||locked()||!moveConfirmed||!destination||(deadline&&Date.now()>=deadline))return;
 const q=adjacent(destination.to,direction);if(q===null)return;
 const next=edge(destination.to,q);if(!wallOptions(v.game,destination).includes(next))return;
 if(wall===next){submit();return;}wall=next;render();
}
function confirmMove(){moveConfirmed=true;wall=null;render();}
function beginWallDrag(e){
 if(!mine()||locked()||!moveConfirmed||!destination||wallDrag||e.isPrimary===false||(e.button!==undefined&&e.button!==0)||(deadline&&Date.now()>=deadline))return;
 const r=$('board').getBoundingClientRect(),size=r.width/7,x=(e.clientX-r.left)/size,y=(e.clientY-r.top)/size;
 if(Math.floor(x)!==destination.to%7||Math.floor(y)!==Math.floor(destination.to/7))return;
 e.preventDefault();wall=null;wallDrag={id:e.pointerId,x:e.clientX,y:e.clientY,rect:r,size,seq:v.game.seq,matchId:v.matchId};
 $('board-shell').setPointerCapture(e.pointerId);render();
}
function draggedWall(e){
 const d=wallDrag;if(!d||d.id!==e.pointerId||!destination||Math.hypot(e.clientX-d.x,e.clientY-d.y)<Math.max(8,d.size*.12))return null;
 const x=(e.clientX-d.rect.left)/d.size,y=(e.clientY-d.rect.top)/d.size;
 if(x<0||x>7||y<0||y>7)return null;
 const dx=x-(destination.to%7+.5),dy=y-(Math.floor(destination.to/7)+.5),distance=Math.max(Math.abs(dx),Math.abs(dy));
 if(distance<.28||distance>1.4||Math.abs(Math.abs(dx)-Math.abs(dy))<.12)return null;
 const direction=Math.abs(dx)>Math.abs(dy)?dx>0?1:3:dy>0?2:0,q=adjacent(destination.to,direction);
 const next=q===null?null:edge(destination.to,q);return wallOptions(v.game,destination).includes(next)?next:null;
}
function moveWallDrag(e){if(wallDrag?.id!==e.pointerId)return;e.preventDefault();const next=draggedWall(e);if(next===wall)return;wall=next;drawWalls();}
function endWallDrag(e,cancel=false){
 const d=wallDrag;if(!d||d.id!==e.pointerId)return;
 const next=cancel?null:draggedWall(e);wallDrag=null;suppressClickUntil=Date.now()+600;
 if($('board-shell').hasPointerCapture(e.pointerId))$('board-shell').releasePointerCapture(e.pointerId);
 wall=next;render();
 if(next&&v.matchId===d.matchId&&v.game.seq===d.seq)submit();
}
$('board-shell').onpointerdown=beginWallDrag;
$('board-shell').onpointermove=moveWallDrag;
$('board-shell').onpointerup=e=>endWallDrag(e);
$('board-shell').onpointercancel=$('board-shell').onlostpointercapture=e=>endWallDrag(e,true);
function submit(){
 if(!mine()||locked()||!destination||(deadline&&Date.now()>=deadline))return;
 const g=v.game;
 if(g.phase==='setup'&&g.pieces.some(p=>p.pos===destination.to))return;
 if(g.phase==='play'&&(!moveConfirmed||!wall||!wallOptions(g,destination).includes(wall)))return;
 request('play',{matchId:v.matchId,seq:g.seq,piece:selected,to:destination.to,wall,breakWall:!!destination.broken});
}
function adjacent(p,d){if(p==null)return null;const q=p+[-7,1,7,-1][d];return neighbors(p).includes(q)?q:null;}
function mine(){return !!v?.game&&v.game.phase!=='done'&&v.game.turn===v.me;}
function locked(){return needsSync||!!management||!!queued||busy&&inFlight!=='state';}
function askManagement(op){
 if(!v?.host||!v.game||locked())return;
 if(wallDrag)endWallDrag({pointerId:wallDrag.id},true);
 management={op,matchId:v.matchId};render();$('action-cancel').focus();
}
function acceptManagement(){
 if(!management||busy&&inFlight!=='state'||queued)return;
 const action=management;management=null;render();
 if(v?.host&&v.game&&v.matchId===action.matchId)request(action.op,{matchId:action.matchId});
}
function availablePaths(){
 const g=v?.game;if(!g||selected<0)return [];
 return paths(g,selected,breakEnabled).filter(p=>wallOptions(g,p).length&&(!breakEnabled||p.broken));
}
function pick(cell){
 if(!mine()||locked()||(deadline&&Date.now()>=deadline))return;
 const g=v.game;
 if(g.phase==='setup'){
  if(g.pieces.some(p=>p.pos===cell))return;
  if(destination?.to===cell){submit();return;}
  selected=pendingPiece(g);destination={to:cell};moveConfirmed=false;wall=null;render();return;
 }
 const piece=g.pieces.findIndex(p=>p.pos===cell&&p.owner===v.me);
 if(piece>=0){selected=piece;destination=null;moveConfirmed=false;wall=null;render();return;}
 const choice=availablePaths().filter(p=>p.to===cell).sort((a,b)=>Number(!!a.broken)-Number(!!b.broken))[0];
 if(choice){
  if(destination?.to===cell){if(!moveConfirmed)confirmMove();return;}
  destination=choice;moveConfirmed=false;wall=null;render();
 }
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
 const stamp=JSON.stringify([v.matchId,g.seq,v.me,selected,destination?.to,moveConfirmed,breakEnabled,locked()]);
 if(stamp!==boardStamp){boardStamp=stamp;
 grid.forEach((b,i)=>{
  const index=g.pieces.findIndex(p=>p.pos===i),piece=g.pieces[index],preview=destination?.to===i,can=yourTurn&&!locked()&&(g.phase==='setup'?!occupied.has(i):piece?.owner===v.me||possible.some(p=>p.to===i));
  b.disabled=!can;
  b.className=(can&&!piece?'target ':'')+(index===selected?'selected ':'')+(preview?'preview-cell ':'')+(g.last?.to===i?'last-to ':g.last?.from===i?'last-from ':'');
  const region=owned.find(r=>r.cells.includes(i));b.style.backgroundColor=region?.owner!=null?colors[region.owner]+'55':'';
  b.replaceChildren();
  if((i<7||i%7===0)){const c=document.createElement('span');c.className='cell-coordinate';c.textContent=coord(i);b.append(c);}
  if(piece){const s=document.createElement('span');s.className='piece '+piece.type+(index===selected?' focus':'');s.style.setProperty('--color',colors[piece.owner]);s.textContent=String(piece.owner+1);b.append(s);}
  else if(preview&&selected>=0){const s=document.createElement('span');s.className='piece ghost '+g.pieces[selected].type;s.style.setProperty('--color',colors[v.me]);s.textContent=String(v.me+1);b.append(s);}
  b.setAttribute('aria-label',coord(i)+(piece?'，'+v.seats[piece.owner].name+' '+type(piece):preview?'，已選落點':'，空格'));
 });
 }
 drawWalls();
}
function drawWalls(){
 const g=v?.game;if(!g)return;const ended=g.phase==='done';
 let drawing=g.walls.map(k=>svgLine(k,k===g.last?.wall?'#fff0bf':'#63452a',9)).join('');
 if(destination?.route?.length>1)drawing+='<polyline points="'+destination.route.map(p=>(p%7+.5)*100+','+(Math.floor(p/7)+.5)*100).join(' ')+'" fill="none" stroke="#fff4c0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 9"/>';
 if(destination?.broken)drawing+=svgLine(destination.broken,'#ee8769',12,'stroke-dasharray="10 7"');
 if(wall)drawing+=svgLine(wall,'#efffc5',12);
 if(moveConfirmed&&destination&&!ended){
  const p=destination.to,x=p%7,y=Math.floor(p/7);
  drawing+=wallOptions(g,destination).map(k=>svgLine(k,'#f9ffd1',7,'stroke-dasharray="10 6"')).join('');
  drawing+='<circle cx="'+((x+.5)*100)+'" cy="'+((y+.5)*100)+'" r="33" fill="none" stroke="#fff6c0" stroke-width="3" stroke-dasharray="5 6"/>';
 }
 $('board-art').innerHTML=drawing;
}
function render(){
 $('connection').hidden=!session;
 $('connection').textContent=needsSync?'正在確認上一手…':connectionIssue?'連線恢復中…':lastSync?'已連線':'連線中…';
 $('connection').className=connectionIssue||needsSync?'connection warning':'connection';
 $('retry-sync').hidden=!session||!connectionIssue;
 $('retry-sync').disabled=busy;
 if(management&&(!v?.game||management.matchId!==v.matchId))management=null;
 $('action-confirm').hidden=!management;
 $('game-actions').hidden=!v?.game;
 if(management){
  const restart=management.op==='restart',solo=v.seats.filter(p=>!p.ai).length===1;
  $('action-title').textContent=restart?'重新開始這場對局？':'確定結束遊戲？';
  $('action-copy').textContent=restart?'本局棋盤與棋譜會清空，保留目前玩家與座位，從佈子重新開始。':solo?'本局不計勝負，結束後返回首頁。':'本局不計勝負，所有玩家會一起返回等候室，房間代碼保留。';
  $('action-accept').textContent=restart?'確定重新開始':'確定結束遊戲';
  $('action-accept').disabled=busy&&inFlight!=='state'||!!queued;
 }
 $('entry').hidden=!!session;$('room').hidden=!v;$('room-bar').hidden=!v;
 for(const id of ['create','practice','join'])$(id).disabled=busy;
 if(!v)return;
 const g=v.game,active=g&&g.phase!=='done',ended=g?.phase==='done';
 $('restart-game').disabled=$('end-game').disabled=!v.host||locked();
 $('host-action-note').textContent=v.host?'由你管理，全桌同步':'重新開始、結束遊戲由房主操作';
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
 $('table').className=mine()?'your-turn':'';
 const step=g.phase==='setup'?0:selected<0?0:!moveConfirmed?1:2;
 $('steps').hidden=!mine()||g.phase==='setup';
 Array.from($('steps').children).forEach((el,i)=>{el.className=i===step?'current':i<step?'complete':'';el.setAttribute('aria-current',i===step?'step':'false');});
 $('turn').textContent=ended?'疆界已定':mine()?'輪到你 · '+(g.phase==='setup'?'放置'+type(g.pieces[pendingPiece(g)]):'移動一顆棋，再造牆'):'等候 '+v.seats[g.turn].name+(v.seats[g.turn].ai?' 思考中':'');
 $('controls').hidden=!mine();
 $('break-wrap').hidden=g.phase!=='play'||!g.breakers[v.me];
 $('wall-controls').hidden=g.phase!=='play'||!moveConfirmed;
 $('board-shell').style.touchAction=mine()&&moveConfirmed?'none':'';
 $('selected-title').textContent=selected<0?'選擇棋子':type(g.pieces[selected])+(g.pieces[selected].pos!==null?' · '+coord(g.pieces[selected].pos):'');
 $('instruction').textContent=needsSync?'正在確認上一手是否成功，請稍候。':queued||busy&&inFlight==='play'?'正在送出整手，請稍候…':ended?'專屬領地已著色；無棋區域與混合區域不計分。':!mine()?'可觀察棋盤。每手 90 秒，電腦會稍作思考。':g.phase==='setup'?'點空格預覽，再點同一格確認佈子。':selected<0?'點自己的棋子，選擇要移動哪一顆。':!destination?'點亮起的落點預覽移動。':!moveConfirmed?'再點同一落點確認移動，接著拖曳築牆。':wallDrag?'拖向亮起的邊，放開即可築牆；拖回中央可取消。':'從落點往亮起的邊拖曳，放開即可送出移動與築牆。';
 const choices=destination&&selected>=0&&g.phase==='play'?wallOptions(g,destination):[];
 dirButtons.forEach((b,d)=>{const q=adjacent(destination?.to,d),k=q===null?null:edge(destination.to,q);b.disabled=locked()||!moveConfirmed||!choices.includes(k);b.className=wall===k?'chosen':'';});
 $('preview').textContent=destination?(g.phase==='setup'?'放置於 '+coord(destination.to):'走到 '+coord(destination.to)+(destination.broken?' · 將使用一次破牆':'')+(wall?' · 已選造牆':' · 尚未選牆')):'操作尚未送出';
 $('confirm').textContent=queued?'等候送出…':busy&&inFlight==='play'?'送出中…':g.phase==='setup'?'確認佈子':!moveConfirmed?'確認落點，選擇築牆':'確認移動與築牆';
 $('confirm').disabled=locked()||!mine()||!destination||(g.phase==='play'&&moveConfirmed&&!wall)||(g.phase==='setup'&&g.pieces.some(p=>p.pos===destination.to));
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
 if(busy){if(['play','restart','end-game'].includes(op)&&inFlight==='state'&&!queued){queued={op,extra,matchId:v.matchId,seq:v.game.seq};render();}return;}
 busy=true;inFlight=op;clearTimeout(timer);if(op!=='state')say('連線中…');render();
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...session,...extra}),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  const result=await response.json();
  if(!response.ok){
   if(op==='state'&&[403,404].includes(response.status)){save(null);v=null;reset();}
   throw Object.assign(Error(result.error||'服務暫時忙碌。'),{retryable:response.status>=500});
  }
  if(result.left){save(null);v=null;reset();$('info').open=true;}
  else{
   const old=v;
   if(result.token)save({code:result.view.code,token:result.token});
   v=result.view;
   if(!old||old.matchId!==v.matchId||old.game?.seq!==v.game?.seq){reset();if(v.game)$('info').open=false;}
   deadline=v.deadline?Date.now()+v.deadline-v.serverNow:0;
  }
  lastSync=Date.now();connectionIssue=false;needsSync=false;
  if(result.view?.notice)say(result.view.notice);else if(op!=='state'||errorCount)say('');errorCount=0;
 }catch(e){errorCount=Math.min(4,errorCount+1);connectionIssue=!!e.retryable||e instanceof TypeError||e.name==='TimeoutError'||e.name==='AbortError';if(connectionIssue&&session&&op!=='state')needsSync=true;say(connectionIssue?'連線中斷，正在嘗試恢復；回合倒數不會暫停。':e.message);}
 finally{
  busy=false;inFlight=null;const pending=queued;queued=null;render();
  if(pending&&!connectionIssue&&v?.game&&v.matchId===pending.matchId&&(pending.op==='play'?v.game.seq===pending.seq&&mine():v.host))request(pending.op,pending.extra);
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
$('retry-sync').onclick=()=>request('state');
$('restart-game').onclick=()=>askManagement('restart');$('end-game').onclick=()=>askManagement('end-game');
$('action-cancel').onclick=()=>{management=null;render();$('restart-game').focus();};
$('action-accept').onclick=acceptManagement;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&management){management=null;render();$('restart-game').focus();}});
$('cancel').onclick=()=>{reset();render();};
$('break').onchange=()=>{breakEnabled=$('break').checked;destination=null;moveConfirmed=false;wall=null;render();};
$('confirm').onclick=()=>{if(!mine()||$('confirm').disabled)return;if(v.game.phase==='play'&&!moveConfirmed)confirmMove();else submit();};
$('leave').onclick=$('exit').onclick=()=>request('leave');
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(v.code);say('房間代碼已複製。');}catch{say('房間代碼：'+v.code);}};
$('invite').onclick=async()=>{const url=new URL('./',location.href);url.searchParams.set('room',v.code);try{await navigator.clipboard.writeText(url.href);say('邀請連結已複製。');}catch{say('邀請連結：'+url.href);}};
invitation=(new URLSearchParams(location.search).get('room')||'').toUpperCase();if(/^[A-HJ-NP-Z2-9]{8}$/.test(invitation))$('code').value=invitation;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&wallDrag)endWallDrag({pointerId:wallDrag.id},true);schedule();});
render();if(session)request('state');
