const files={select:'select',place:'place',wall:'wall',break:'break',turn:'turn',finish:'turn'};
export function createAudio(env=globalThis){
 let enabled=true,context=null,unlocked=false,generation=0,lastView=null,lastSelect=0;
 const buffers=new Map(),sources=new Set();
 try{enabled=env.localStorage?.getItem('wallgo-audio-v1')!=='off';}catch{}
 const hidden=()=>!!env.document?.hidden;
 async function load(name){
  const file=files[name];if(!file||!context)return null;
  if(!buffers.has(file))buffers.set(file,(async()=>{
   try{const r=await env.fetch(new URL('./audio/'+file+'.wav',import.meta.url));if(!r.ok)throw Error('audio');return await context.decodeAudioData(await r.arrayBuffer());}
   catch{buffers.delete(file);return null;}
  })());
  return buffers.get(file);
 }
 function stop(){generation++;for(const s of sources){try{s.stop();}catch{}try{s.disconnect();}catch{}}sources.clear();}
 async function unlock(){
  if(!enabled||hidden())return;
  try{
   const AudioContext=env.AudioContext||env.webkitAudioContext;if(!AudioContext)return;
   context ||= new AudioContext();
   if(context.state!=='running')await context.resume();
   unlocked=context.state==='running';
   if(unlocked)for(const name of Object.keys(files))void load(name);
  }catch{}
 }
 async function play(name,delay=0){
  if(!enabled||!unlocked||hidden()||context?.state!=='running')return;
  const now=Date.now();if(name==='select'&&now-lastSelect<90)return;if(name==='select')lastSelect=now;
  const current=generation,buffer=await load(name);
  if(!buffer||current!==generation||!enabled||hidden()||Date.now()-now>450||context.state!=='running')return;
  const count=name==='finish'?3:1;
  for(let i=0;i<count;i++){
   const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;
   gain.gain.value=(name==='select'?.17:name==='break'?.38:.45)*(i? .75:1);
   source.connect(gain);gain.connect(context.destination);sources.add(source);
   source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};
   source.start(context.currentTime+delay+i*.19);
  }
 }
 function update(view){
  const g=view?.game,next=g?{matchId:view.matchId,seq:g.seq,phase:g.phase,turn:g.turn,me:view.me}:null,old=lastView;lastView=next;
  if(!next)return;
  if(old&&old.matchId===next.matchId&&old.seq===next.seq&&old.phase===next.phase)return;
  if(g.phase==='done'){if(old?.matchId===next.matchId)void play('finish');return;}
  const changed=old?.matchId===next.matchId&&next.seq>old.seq;
  if(changed){const event=g.last;void play(event?.broken?'break':event?.kind==='place'?'place':'wall');}
  if(g.turn===view.me&&(!old||old.matchId!==next.matchId||old.turn!==next.turn))void play('turn',changed?.3:0);
 }
 function setEnabled(value){enabled=!!value;try{env.localStorage?.setItem('wallgo-audio-v1',enabled?'on':'off');}catch{}if(enabled)void unlock();else stop();return enabled;}
 return {unlock,play,update,stop,setEnabled,isEnabled:()=>enabled};
}
export const audio=createAudio();
