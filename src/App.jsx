import { useState, useEffect, useRef } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

const SCALES={"Pentatónica Menor":[0,3,5,7,10],"Menor Natural":[0,2,3,5,7,8,10],"Mayor":[0,2,4,5,7,9,11],"Blues":[0,3,5,6,7,10],"Japonesa":[0,1,5,7,8],"Dórica":[0,2,3,5,7,9,10],"Árabe":[0,1,4,5,7,8,11]};
const KN=["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const KS={};KN.forEach((k,i)=>KS[k]=i);
const m2f=m=>440*Math.pow(2,(m-69)/12);
const m2n=m=>m<0?"—":KN[m%12]+Math.floor(m/12-1);
const bldS=(k,iv,lo,hi)=>{const n=[];for(let o=lo;o<=hi;o++)for(const i of iv)n.push({midi:k+12*o+i,freq:m2f(k+12*o+i)});return n;};
const BSEGS=[{j:[5,7,9],w:0.5},{j:[6,8,10],w:0.5},{j:[11,13,15],w:0.7},{j:[12,14,16],w:0.7},{j:[5,6],w:0.9},{j:[11,12],w:0.9},{j:[5,11],w:0.8},{j:[6,12],w:0.8}];

const ARC_PALETTES={
  deriva:{primary:"#3B82F6",secondary:"#6366F1",textColor:"#93C5FD",shadowColor:"#F43F5E",entityColor:"#3B82F6",scale:"Menor Natural",key:"A",bpm:90,label:"DERIVA",synChar:{dl:0.45,rv:0.1,octLo:3,octHi:5,melodyAtk:0.01,bassAtk:0.08,chordAtk:0.2}},
  kenopsia:{primary:"#94A3B8",secondary:"#CBD5E1",textColor:"#E2E8F0",shadowColor:"#CBD5E1",entityColor:"#94A3B8",scale:"Japonesa",key:"D",bpm:60,label:"KENOPSIA",synChar:{dl:0.02,rv:0.78,octLo:2,octHi:4,melodyAtk:0.8,bassAtk:1.2,chordAtk:1.5}},
  apertura:{primary:"#F59E0B",secondary:"#10B981",textColor:"#FDE68A",shadowColor:"#F59E0B",entityColor:"#10B981",scale:"Pentatónica Menor",key:"C",bpm:130,label:"APERTURA",synChar:{dl:0.18,rv:0.25,octLo:4,octHi:6,melodyAtk:0.005,bassAtk:0.02,chordAtk:0.05}},
};

const KENOPSIA_TEXTS=["My body has changed\nduring the journey","My body is an\nemotional archive","My body\nobserves itself","Fleeing from oneself\n– moving"];

// ── Color aleatorio para icosaedro ────────────────────────────────────────
const ICO_COLORS=["#FFD700","#FF6B6B","#4ECDC4","#A855F7","#F59E0B","#10B981","#3B82F6","#EC4899","#FFFFFF","#06B6D4"];
let _icoIdx=0,_icoTimer=0,_icoCur=ICO_COLORS[0];
function getIcoColor(t){if(t-_icoTimer>3){_icoTimer=t;_icoIdx=(_icoIdx+1)%ICO_COLORS.length;_icoCur=ICO_COLORS[_icoIdx];}return _icoCur;}

// ── TextParticle con zoom-out ─────────────────────────────────────────────
class TextParticle{
  constructor(text,x,y,color,arc,style){
    this.text=text;this.x=x;this.y=y;this.color=color;this.arc=arc;
    this.vx=(Math.random()-0.5)*0.1;this.vy=-0.03;
    this.alpha=0;this.life=0;this.maxLife=300+Math.random()*60;
    this.size=text.length>18?24:text.length>10?32:44;
    this.style=style||"typewriter";
    this.letters=text.replace(/\n/g," ").split("");
    this.letterState=this.letters.map((_,i)=>({alpha:0,delay:i*5}));
    this.glitchOff=0;
    this.isZoom=arc==="kenopsia_zoom";
    this.zoomScale=this.isZoom?0.2:1;
  }
  update(motion){
    this.life++;
    if(this.life<25)this.alpha=this.life/25;
    else if(this.life>this.maxLife-70)this.alpha=Math.max(0,(this.maxLife-this.life)/70);
    else this.alpha=1;
    this.x+=this.vx;this.y+=this.vy;
    if(this.isZoom)this.zoomScale=Math.min(5,this.zoomScale+0.025);
    if(this.style==="glitch")this.glitchOff=Math.random()>0.85?(Math.random()-0.5)*10:this.glitchOff*0.8;
  }
  isDead(){return this.life>=this.maxLife;}
  draw(ctx){
    if(this.alpha<=0)return;
    ctx.save();
    if(this.isZoom){ctx.translate(this.x,this.y);ctx.scale(this.zoomScale,this.zoomScale);ctx.translate(-this.x,-this.y);}
    ctx.textAlign="center";
    const sz=this.size,letters=this.letters,s=this.style;
    const charW=sz*0.6,startX=this.x-letters.length*charW/2;
    const col=s==="glitch"?"#00FFCC":this.color;
    if(s==="typewriter"){
      ctx.font=`300 ${sz}px 'Segoe UI',monospace`;
      letters.forEach((ch,i)=>{const st=this.letterState[i];if(this.life>st.delay)st.alpha=Math.min(1,st.alpha+0.12);ctx.globalAlpha=this.alpha*st.alpha;ctx.fillStyle=col;ctx.fillText(ch.toUpperCase(),startX+i*charW+charW/2,this.y);});
    }else if(s==="glitch"){
      ctx.font=`bold ${sz}px monospace`;
      ctx.globalAlpha=this.alpha*0.45;ctx.fillStyle="#FF0055";ctx.fillText(this.text.replace(/\n/g," ").toUpperCase(),this.x+this.glitchOff*2,this.y+2);
      ctx.fillStyle="#00FFFF";ctx.fillText(this.text.replace(/\n/g," ").toUpperCase(),this.x-this.glitchOff,this.y-1);
      ctx.globalAlpha=this.alpha;ctx.fillStyle=col;ctx.fillText(this.text.replace(/\n/g," ").toUpperCase(),this.x,this.y);
    }else{
      ctx.font=`200 ${sz}px 'Segoe UI',sans-serif`;
      ctx.globalAlpha=this.alpha;ctx.fillStyle=col;
      this.text.split("\n").forEach((line,li)=>ctx.fillText(line.toUpperCase(),this.x,this.y+li*sz*1.25));
    }
    ctx.restore();
  }
}

class Synth{
  constructor(){this.c=null;this.m=null;this.comp=null;this.dl=null;this.dlFb=null;this.dlG=null;this.rv=null;this.rvG=null;this.on=false;this.vol=0.7;this.key=0;this.sn="Pentatónica Menor";this.notes=[];this.v={};this.arpI=0;this.arpT=0;this.arpBPM=140;this.octLo=3;this.octHi=5;}
  build(){this.notes=bldS(this.key,SCALES[this.sn],1,6);}
  async init(){if(this.on)return;this.c=new(window.AudioContext||window.webkitAudioContext)();this.comp=this.c.createDynamicsCompressor();this.comp.threshold.value=-18;this.comp.ratio.value=5;this.m=this.c.createGain();this.m.gain.value=this.vol;this.dl=this.c.createDelay(1);this.dl.delayTime.value=0.3;this.dlFb=this.c.createGain();this.dlFb.gain.value=0.3;this.dlG=this.c.createGain();this.dlG.gain.value=0.25;this.dl.connect(this.dlFb);this.dlFb.connect(this.dl);this.dl.connect(this.dlG);this.dlG.connect(this.comp);this.rv=this.c.createConvolver();try{const len=this.c.sampleRate*2;const buf=this.c.createBuffer(2,len,this.c.sampleRate);for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.5);}this.rv.buffer=buf;}catch(e){}this.rvG=this.c.createGain();this.rvG.gain.value=0.2;if(this.rv.buffer){this.rv.connect(this.rvG);this.rvG.connect(this.comp);}this.comp.connect(this.m);this.m.connect(this.c.destination);this.build();["melody","lead","bass","sub","pluck"].forEach(n=>{this.v[n]=this._mk(n==="lead"?"sawtooth":n==="bass"?"triangle":"sine");});this.v.chord=this._mkC();this.on=true;}
  _mk(w){const o=this.c.createOscillator();o.type=w;o.frequency.value=220;o.start();const f=this.c.createBiquadFilter();f.type="lowpass";f.frequency.value=80;f.Q.value=2;const g=this.c.createGain();g.gain.value=0;o.connect(f);f.connect(g);g.connect(this.comp);g.connect(this.dl);if(this.rv?.buffer)g.connect(this.rv);return{osc:o,filter:f,gain:g};}
  _mkC(){const os=[0,0,0].map(()=>{const o=this.c.createOscillator();o.type="triangle";o.frequency.value=130;o.start();return o;});const f=this.c.createBiquadFilter();f.type="lowpass";f.frequency.value=80;const g=this.c.createGain();g.gain.value=0;os.forEach(o=>{const gn=this.c.createGain();gn.gain.value=0.33;o.connect(gn);gn.connect(f);});f.connect(g);g.connect(this.comp);return{oscs:os,filter:f,gain:g};}
  noteAt(p,lo,hi){const ns=this.notes.filter(n=>n.midi>=this.key+(lo||this.octLo)*12&&n.midi<=this.key+(hi||this.octHi)*12);if(!ns.length)return null;return ns[Math.max(0,Math.min(ns.length-1,Math.floor(p*ns.length)))];}
  play(nm,note,int,atk=0.05){if(!this.on||!note)return;const t=this.c.currentTime;const v=this.v[nm];if(!v)return;if(nm==="chord"){const ri=this.notes.findIndex(n=>n.midi===note.midi);if(ri>=0&&ri+2<this.notes.length)[0,1,2].forEach((off,i)=>{if(v.oscs[i])v.oscs[i].frequency.setTargetAtTime(this.notes[ri+off]?.freq||note.freq,t,0.15);});v.gain.gain.setTargetAtTime(Math.min(0.3,int*0.35),t,atk);v.filter.frequency.setTargetAtTime(80+int*900,t,0.1);}else{v.osc.frequency.setTargetAtTime(note.freq,t,0.02);v.gain.gain.setTargetAtTime(Math.min(0.35,int*0.4),t,atk);v.filter.frequency.setTargetAtTime(80+int*1800,t,0.05);}}
  plk(nm,note,int){if(!this.on||!note)return;const t=this.c.currentTime;const v=this.v[nm];if(!v?.osc)return;v.osc.frequency.setTargetAtTime(note.freq,t,0.002);v.gain.gain.cancelScheduledValues(t);v.gain.gain.setValueAtTime(Math.min(0.35,int*0.4),t);v.gain.gain.exponentialRampToValueAtTime(0.001,t+0.3);}
  arpTk(int){if(!this.on)return;const now=performance.now();if(now-this.arpT<60000/(this.arpBPM*2))return;this.arpT=now;const ns=this.notes.filter(n=>n.midi>=this.key+36&&n.midi<=this.key+60);if(!ns.length)return;this.arpI=(this.arpI+1)%ns.length;this.plk("pluck",ns[this.arpI],int);}
  rel(nm,rt=0.3){if(!this.on)return;const v=this.v[nm];if(!v)return;v.gain.gain.setTargetAtTime(0,this.c.currentTime,rt);if(v.filter)v.filter.frequency.setTargetAtTime(80,this.c.currentTime,rt);}
  relAll(){if(!this.on)return;Object.keys(this.v).forEach(n=>this.rel(n,0.1));}
  silence(){if(!this.on)return;this.m.gain.cancelScheduledValues(this.c.currentTime);this.m.gain.setValueAtTime(0,this.c.currentTime);this.relAll();}
  unsilence(){if(!this.on)return;this.m.gain.setTargetAtTime(this.vol,this.c.currentTime,0.3);}
  chS(s){this.sn=s;this.build();}chK(k){this.key=KS[k];this.build();}
  setV(v){this.vol=v;if(this.m)this.m.gain.setTargetAtTime(v,this.c.currentTime,0.05);}
  setDl(v){if(this.dlG)this.dlG.gain.setTargetAtTime(v,this.c.currentTime,0.05);}
  setRv(v){if(this.rvG)this.rvG.gain.setTargetAtTime(v,this.c.currentTime,0.05);}
}

const SAMPLE_ROLES={
  melody:{label:"Melodía (↑ brazos arriba)",color:"#10B981"},
  chord: {label:"Armonía (← brazo izq)",color:"#3B82F6"},
  bass:  {label:"Bajo (→ brazo der)",color:"#F59E0B"},
  pad:   {label:"Ambiente (↓ sentadilla)",color:"#94A3B8"},
};
class SamplePlayer{
  constructor(synth){this.synth=synth;this.samples={};this.on=false;}
  get c(){return this.synth?.c;}
  async loadSample(role,file){if(!this.c)return;try{const ab=await file.arrayBuffer();const dec=await this.c.decodeAudioData(ab);this.samples[role]={buffer:dec,baseMidi:60,activeNodes:[]};this.on=true;return true;}catch(e){return false;}}
  removeSample(role){if(this.samples[role]){this.samples[role].activeNodes.forEach(n=>{try{n.stop();}catch(e){}});delete this.samples[role];}if(!Object.keys(this.samples).length)this.on=false;}
  hasSample(role){return!!this.samples[role];}
  playSample(role,note,intensity,atk=0.05){if(!this.c||!note||!this.samples[role])return false;const s=this.samples[role];const t=this.c.currentTime;const rate=Math.pow(2,(note.midi-s.baseMidi)/12);s.activeNodes.forEach(n=>{try{n.gain.gain.setTargetAtTime(0,t,0.08);setTimeout(()=>{try{n.src.stop();}catch(e){}},300);}catch(e){}});s.activeNodes=[];const src=this.c.createBufferSource();src.buffer=s.buffer;src.playbackRate.value=rate;const gn=this.c.createGain();gn.gain.setValueAtTime(0,t);gn.gain.setTargetAtTime(Math.min(0.5,intensity*0.55),t,atk);src.connect(gn);gn.connect(this.synth.comp);if(this.synth.rv?.buffer)gn.connect(this.synth.rv);gn.connect(this.synth.dl);src.start(t);s.activeNodes.push({src,gain:gn});src.onended=()=>{s.activeNodes=s.activeNodes.filter(n=>n.src!==src);};return true;}
  pluckSample(role,note,intensity){if(!this.c||!note||!this.samples[role])return false;const s=this.samples[role];const t=this.c.currentTime;const rate=Math.pow(2,(note.midi-s.baseMidi)/12);const src=this.c.createBufferSource();src.buffer=s.buffer;src.playbackRate.value=rate;const gn=this.c.createGain();gn.gain.setValueAtTime(Math.min(0.5,intensity*0.5),t);gn.gain.exponentialRampToValueAtTime(0.001,t+1.2);src.connect(gn);gn.connect(this.synth.comp);if(this.synth.rv?.buffer)gn.connect(this.synth.rv);src.start(t);s.activeNodes.push({src,gain:gn});return true;}
  relSample(role,rt=0.3){if(!this.samples[role])return;const t=this.c.currentTime;this.samples[role].activeNodes.forEach(n=>{try{n.gain.gain.setTargetAtTime(0,t,rt);setTimeout(()=>{try{n.src.stop();}catch(e){}},rt*3000);}catch(e){}});this.samples[role].activeNodes=[];}
  relAll(){Object.keys(this.samples).forEach(r=>this.relSample(r,0.15));}
}

class LoopRecorder{
  constructor(){this.c=null;this.loops=[];this.MAX=4;this.REC_DURATION=10;this.on=false;this.recordingIdx=null;this.mediaRecorder=null;this.recChunks=[];this.destNode=null;}
  init(audioCtx,compNode){if(this.on)return;this.c=audioCtx;this.compNode=compNode;this.destNode=this.c.createMediaStreamDestination();compNode.connect(this.destNode);for(let i=0;i<this.MAX;i++)this.loops.push({buffer:null,sourceNode:null,gainNode:null,active:false,recording:false,vol:0.8,blob:null});this.on=true;}
  startRecord(idx){if(!this.on||idx<0||idx>=this.MAX)return;if(this.recordingIdx!==null)this.stopRecord();this.stopLoop(idx);this.loops[idx].recording=true;this.recordingIdx=idx;this.recChunks=[];try{const mr=new MediaRecorder(this.destNode.stream,{mimeType:"audio/webm"});mr.ondataavailable=e=>{if(e.data.size>0)this.recChunks.push(e.data);};mr.onstop=()=>this._buildBuffer(idx);this.mediaRecorder=mr;mr.start();setTimeout(()=>{if(this.recordingIdx===idx)this.stopRecord();},this.REC_DURATION*1000);}catch(e){this.loops[idx].recording=false;this.recordingIdx=null;}}
  stopRecord(){if(!this.on||this.recordingIdx===null)return;const idx=this.recordingIdx;this.recordingIdx=null;this.loops[idx].recording=false;if(this.mediaRecorder?.state==="recording"){try{this.mediaRecorder.stop();}catch(e){}}this.mediaRecorder=null;}
  async _buildBuffer(idx){if(!this.recChunks.length)return;const blob=new Blob(this.recChunks,{type:"audio/webm"});this.loops[idx].blob=blob;try{const dec=await this.c.decodeAudioData(await blob.arrayBuffer());this.loops[idx].buffer=dec;this.playLoop(idx);}catch(e){}}
  playLoop(idx){if(!this.on||!this.loops[idx]?.buffer)return;this.stopLoop(idx);const loop=this.loops[idx];const src=this.c.createBufferSource();src.buffer=loop.buffer;src.loop=true;const gn=this.c.createGain();gn.gain.value=loop.vol;src.connect(gn);gn.connect(this.compNode||this.c.destination);src.start();loop.sourceNode=src;loop.gainNode=gn;loop.active=true;}
  stopLoop(idx){if(!this.on||idx<0||idx>=this.MAX)return;const loop=this.loops[idx];if(loop.sourceNode){try{loop.sourceNode.stop();}catch(e){}loop.sourceNode=null;}loop.active=false;}
  toggle(idx){if(!this.on||idx<0||idx>=this.MAX)return;const loop=this.loops[idx];if(loop.recording)this.stopRecord();else if(loop.active)this.stopLoop(idx);else if(loop.buffer)this.playLoop(idx);else this.startRecord(idx);}
  stopAll(){if(!this.on)return;if(this.recordingIdx!==null)this.stopRecord();for(let i=0;i<this.MAX;i++)this.stopLoop(i);}
  clear(idx){if(!this.on||idx<0||idx>=this.MAX)return;this.stopLoop(idx);this.loops[idx].buffer=null;this.loops[idx].blob=null;}
  clearAll(){for(let i=0;i<this.MAX;i++)this.clear(i);}
  download(idx){if(!this.loops[idx]?.blob)return;const u=URL.createObjectURL(this.loops[idx].blob);const a=document.createElement("a");a.href=u;a.download=`korpsound-loop${idx+1}-${Date.now()}.webm`;a.click();URL.revokeObjectURL(u);}
  setVol(idx,vol){if(!this.on||idx<0||idx>=this.MAX)return;this.loops[idx].vol=vol;if(this.loops[idx].gainNode)this.loops[idx].gainNode.gain.setTargetAtTime(vol,this.c.currentTime,0.05);}
}

class Drone{
  constructor(){this.c=null;this.masterG=null;this.filterLo=null;this.rvG=null;this.lfo=null;this.oscs=[];this.on=false;this.arc=null;}
  async init(audioCtx){if(this.on)return;this.c=audioCtx;this.masterG=this.c.createGain();this.masterG.gain.value=0;this.filterLo=this.c.createBiquadFilter();this.filterLo.type="lowpass";this.filterLo.frequency.value=700;const rvBuf=this.c.createBuffer(2,this.c.sampleRate*3,this.c.sampleRate);for(let ch=0;ch<2;ch++){const d=rvBuf.getChannelData(ch);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.8);}const rv=this.c.createConvolver();rv.buffer=rvBuf;this.rvG=this.c.createGain();this.rvG.gain.value=0.5;this.lfo=this.c.createOscillator();this.lfo.frequency.value=0.1;this.lfo.start();this.filterLo.connect(this.masterG);this.masterG.connect(this.c.destination);this.masterG.connect(rv);rv.connect(this.rvG);this.rvG.connect(this.c.destination);this.on=true;}
  connectToComp(c){if(!this.on||!c)return;try{this.masterG.connect(c);this.rvG.connect(c);}catch(e){}}
  setArc(arcName){if(!this.on)return;const t=this.c.currentTime;this.oscs.forEach(o=>{try{o.g.gain.setTargetAtTime(0,t,0.8);setTimeout(()=>{try{o.o.stop();}catch(e){}},2000);}catch(e){}});this.oscs=[];this.arc=arcName;const cfgs={deriva:[{f:146.83,g:0.16,type:"sine",dt:-2},{f:146.83,g:0.10,type:"sine",dt:4},{f:220,g:0.09,type:"triangle",dt:0},{f:293.66,g:0.06,type:"sine",dt:-1},{f:73.42,g:0.12,type:"sine",dt:0}],kenopsia:[{f:146.83,g:0.18,type:"sine",dt:0},{f:146.83,g:0.07,type:"sine",dt:6},{f:195.99,g:0.05,type:"sine",dt:-4},{f:293.66,g:0.04,type:"sine",dt:2}],apertura:[{f:130.81,g:0.14,type:"triangle",dt:0},{f:196,g:0.11,type:"sine",dt:0},{f:261.63,g:0.09,type:"sine",dt:0},{f:392,g:0.05,type:"triangle",dt:3}]};(cfgs[arcName]||cfgs.deriva).forEach(({f,g,type,dt})=>{const o=this.c.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=dt;const gn=this.c.createGain();gn.gain.value=0;const lfoG=this.c.createGain();lfoG.gain.value=f*0.004*(arcName==="kenopsia"?0.3:1);this.lfo.connect(lfoG);lfoG.connect(o.frequency);o.connect(gn);gn.connect(this.filterLo);o.start(t+0.05);gn.gain.setTargetAtTime(g,t+0.3,2);this.oscs.push({o,g:gn});});const fc={deriva:700,kenopsia:380,apertura:1100};const rvV={deriva:0.5,kenopsia:0.75,apertura:0.3};this.filterLo.frequency.setTargetAtTime(fc[arcName]||700,t,2);this.rvG.gain.setTargetAtTime(rvV[arcName]||0.5,t,2);this.masterG.gain.setTargetAtTime(0.65,t+0.3,2);}
  modulate(g){if(!this.on||!g)return;const t=this.c.currentTime;if(g.rP!==undefined)this.filterLo.frequency.setTargetAtTime(200+g.rP*1600,t,0.25);if(g.sq!==undefined)this.rvG.gain.setTargetAtTime(0.2+g.sq*0.6,t,0.3);this.masterG.gain.setTargetAtTime(g.bUp?0.9:0.65,t,0.4);if(g.mt!==undefined)this.lfo.frequency.setTargetAtTime(0.08+g.mt*0.5,t,0.3);}
  stop(){if(!this.on)return;this.masterG.gain.setTargetAtTime(0,this.c.currentTime,1.5);}
  resume(){if(!this.on||!this.arc)return;this.masterG.gain.setTargetAtTime(0.65,this.c.currentTime,1);}
}

class Shadow{constructor(){this.buf=[];this.max=100;this.mir=true;this.rnd=0.3;this.df=0.5;this.extrap=false;}push(lm){if(!lm)return;this.buf.push(lm.map(p=>p?{...p}:null));if(this.buf.length>this.max)this.buf.shift();}}

class Gest{
  constructor(){this.sm=null;this.spd={l:0,r:0};this.pw=null;this.stH=0;this.sqR=0;this.sqC=false;this.rAngles=[];this.lAngles=[];this.circleCD={r:0,l:0};this.prevHipX=null;this.hipVelX=0;}
  d(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}
  _circ(angles){if(angles.length<20)return false;let t=0;for(let i=1;i<angles.length;i++){let d=angles[i]-angles[i-1];if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;t+=d;}return Math.abs(t)>Math.PI*1.6;}
  run(kps,vw,vh){
    const pts=[];for(let i=0;i<17;i++){const kp=kps[i];pts[i]=(kp&&kp.score>0.25)?{x:kp.x/vw,y:kp.y/vh}:null;}
    const lS=pts[5],rS=pts[6],lW=pts[9],rW=pts[10],lH=pts[11],rH=pts[12];
    if(!lS||!rS||!lW||!rW||!lH||!rH)return null;
    if(!this.sm)this.sm=pts.map(p=>p?{...p}:null);
    else pts.forEach((p,i)=>{if(p){if(!this.sm[i])this.sm[i]={...p};else{this.sm[i].x=this.sm[i].x*0.65+p.x*0.35;this.sm[i].y=this.sm[i].y*0.65+p.y*0.35;}}});
    const m=this.sm,sl=m[5],sr=m[6],wl=m[9],wr=m[10],hl=m[11],hr=m[12];
    if(!sl||!sr||!wl||!wr||!hl||!hr)return null;
    if(!this.sqC){this.sqR=(hl.y+hr.y)/2;this.sqC=true;}
    const sW=this.d(sl,sr),bT=Math.min(sl.y,sr.y)-0.15,bB=Math.max(hl.y,hr.y)+0.2,bR=Math.max(0.1,bB-bT);
    const rP=1-Math.max(0,Math.min(1,(wr.y-bT)/bR)),lP=1-Math.max(0,Math.min(1,(wl.y-bT)/bR));
    if(this.pw){this.spd.r=this.spd.r*0.7+this.d(wr,this.pw.r)*0.3*60;this.spd.l=this.spd.l*0.7+this.d(wl,this.pw.l)*0.3*60;}
    this.pw={r:{...wr},l:{...wl}};
    const hD=this.d(wl,wr)/Math.max(0.01,sW);
    const bUp=wl.y<sl.y-0.05&&wr.y<sr.y-0.05;
    const lExt=wl.x<sl.x-sW*0.8&&Math.abs(wl.y-sl.y)<0.15;
    const rExt=wr.x>sr.x+sW*0.8&&Math.abs(wr.y-sr.y)<0.15;
    const cross=this.d(wl,sr)<sW*0.5&&this.d(wr,sl)<sW*0.5;
    const chestY=(sl.y+hl.y)/2;
    const crossChest=this.d(wl,wr)<sW*0.6&&Math.abs((wl.y+wr.y)/2-chestY)<0.12&&wl.y>sl.y&&wr.y>sr.y&&!bUp;
    const xAbove=wl.y<sl.y-0.08&&wr.y<sr.y-0.08&&this.d(wl,wr)<sW*0.5;
    const sq=Math.max(0,Math.min(1,((hl.y+hr.y)/2-this.sqR)/0.1));
    const re=m[8],le=m[7];
    if(re&&wr){const a=Math.atan2(wr.y-re.y,wr.x-re.x);this.rAngles.push(a);if(this.rAngles.length>40)this.rAngles.shift();}
    if(le&&wl){const a=Math.atan2(wl.y-le.y,wl.x-le.x);this.lAngles.push(a);if(this.lAngles.length>40)this.lAngles.shift();}
    if(this.circleCD.r>0)this.circleCD.r--;if(this.circleCD.l>0)this.circleCD.l--;
    let circleR=false,circleL=false;
    if(this.circleCD.r<=0&&this._circ(this.rAngles)){circleR=true;this.circleCD.r=60;this.rAngles=[];}
    if(this.circleCD.l<=0&&this._circ(this.lAngles)){circleL=true;this.circleCD.l=60;this.lAngles=[];}
    if(cross)this.stH=Math.min(40,this.stH+1);else this.stH=Math.max(0,this.stH-2);
    const hipX=(hl.x+hr.x)/2;
    if(this.prevHipX!==null){const rv=(hipX-this.prevHipX)*60;this.hipVelX=this.hipVelX*0.7+rv*0.3;}
    this.prevHipX=hipX;
    const spinning=Math.abs(this.hipVelX)>0.16;
    return{rP,lP,spd:this.spd,hD,bUp,lExt,rExt,cross,crossChest,xAbove,sq,circleR,circleL,spinning,stopA:this.stH>=25,stopH:this.stH,lAct:this.spd.l>0.5,rAct:this.spd.r>0.5,rPlk:this.spd.r>2.5,rUp:wr.y<sr.y-0.1,vA:lExt,vB:rExt,vC:bUp,vD:sq>0.15,lm:m,mt:Math.min(1,(this.spd.l+this.spd.r)/6)};
  }
}

// ── Icosaedro ─────────────────────────────────────────────────────────────
const PHI=(1+Math.sqrt(5))/2;
const ICO_V=(()=>{const v=[];[[-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],[0,-1,PHI],[0,1,PHI],[0,-1,-PHI],[0,1,-PHI],[PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]].forEach(([x,y,z])=>{const l=Math.sqrt(x*x+y*y+z*z);v.push([x/l,y/l,z/l]);});return v;})();
const ICO_F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

function drawIcosahedron(ctx,lm,W,H,color,t,motion){
  if(!lm)return;
  const pts=[];for(let i=0;i<17;i++)if(lm[i])pts.push({x:(1-lm[i].x)*W,y:lm[i].y*H});
  if(!pts.length)return;
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length,cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const maxR=Math.max(60,...pts.map(p=>Math.sqrt((p.x-cx)**2+(p.y-cy)**2)));
  const baseR=maxR*1.5+40;
  const rx=t*0.1+motion*0.2,ry=t*0.07;
  const project=([x,y,z])=>{const y1=y*Math.cos(rx)-z*Math.sin(rx),z1=y*Math.sin(rx)+z*Math.cos(rx);const x2=x*Math.cos(ry)+z1*Math.sin(ry),z2=-x*Math.sin(ry)+z1*Math.cos(ry);const fov=3/(3+z2*0.3);return{px:cx+x2*baseR*fov,py:cy+y1*baseR*fov*0.6,z:z2};};
  const projected=ICO_V.map(v=>{const p=project(v);let dx=0,dy=0;pts.forEach(pt=>{const d=Math.sqrt((p.px-pt.x)**2+(p.py-pt.y)**2);if(d<90){const f=(90-d)/90;dx+=(p.px-pt.x)*f*0.5;dy+=(p.py-pt.y)*f*0.5;}});return{px:p.px+dx,py:p.py+dy,z:p.z};});
  const h=color.replace('#','');const cr=parseInt(h.substring(0,2),16),cg=parseInt(h.substring(2,4),16),cb=parseInt(h.substring(4,6),16);
  ctx.save();
  const edges=new Set();
  ICO_F.forEach(([a,b,c])=>[[a,b],[b,c],[a,c]].forEach(([i,j])=>{const key=Math.min(i,j)+"-"+Math.max(i,j);if(edges.has(key))return;edges.add(key);const va=projected[i],vb=projected[j];const zAvg=(va.z+vb.z)/2;const op=Math.max(0.08,0.4+zAvg*0.25);ctx.strokeStyle=`rgba(${cr},${cg},${cb},${op})`;ctx.lineWidth=0.8+Math.max(0,zAvg)*0.8+motion*0.5;ctx.beginPath();ctx.moveTo(va.px,va.py);ctx.lineTo(vb.px,vb.py);ctx.stroke();}));
  projected.forEach(v=>{const op=Math.max(0.1,0.5+v.z*0.3);const r=2+Math.max(0,v.z)*2;const g=ctx.createRadialGradient(v.px,v.py,0,v.px,v.py,r*2);g.addColorStop(0,`rgba(${cr},${cg},${cb},${op})`);g.addColorStop(1,`rgba(${cr},${cg},${cb},0)`);ctx.fillStyle=g;ctx.beginPath();ctx.arc(v.px,v.py,r*2,0,Math.PI*2);ctx.fill();});
  ctx.restore();
}

// ── Entidad fluida ────────────────────────────────────────────────────────
function drawFluid(ctx,lm,W,H,color,alpha,t,motion){
  if(!lm)return;
  ctx.save();
  const px=i=>lm[i]?(1-lm[i].x)*W:0,py=i=>lm[i]?lm[i].y*H:0;
  const h=color.replace('#','');const cr=parseInt(h.substring(0,2),16),cg=parseInt(h.substring(2,4),16),cb=parseInt(h.substring(4,6),16);
  const rgba=a=>`rgba(${cr},${cg},${cb},${Math.min(1,Math.max(0,a))})`;
  const nodes=[];for(let i=0;i<17;i++){if(!lm[i])continue;const r=i===0?16:i<=4?7:[5,6].includes(i)?13:[9,10].includes(i)?15:[11,12].includes(i)?12:8;nodes.push({i,x:px(i),y:py(i),r});}
  if(!nodes.length){ctx.restore();return;}
  const cx=nodes.reduce((s,n)=>s+n.x,0)/nodes.length,cy=nodes.reduce((s,n)=>s+n.y,0)/nodes.length;
  const spread=Math.max(60,...nodes.map(n=>Math.sqrt((n.x-cx)**2+(n.y-cy)**2)))+motion*40;
  const ag=ctx.createRadialGradient(cx,cy,10,cx,cy,spread);
  ag.addColorStop(0,rgba(0.04+motion*0.04));ag.addColorStop(0.7,rgba(0.015));ag.addColorStop(1,rgba(0));
  ctx.globalAlpha=alpha;ctx.fillStyle=ag;ctx.beginPath();ctx.arc(cx,cy,spread,0,Math.PI*2);ctx.fill();
  [[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[12,14],[13,15],[14,16],[0,5],[0,6]].forEach(([a,b])=>{
    if(!lm[a]||!lm[b])return;
    const ax=px(a),ay=py(a),bx=px(b),by=py(b);
    const na=nodes.find(n=>n.i===a),nb=nodes.find(n=>n.i===b);
    const ra=(na?.r||8)*(1+motion*0.35),rb=(nb?.r||8)*(1+motion*0.35);
    const w=Math.sin(t*1.3+a*0.8)*4*(1+motion);
    const mx=(ax+bx)/2+Math.cos(t+b)*w,my=(ay+by)/2+Math.sin(t+a)*w;
    const perp=Math.atan2(by-ay,bx-ax)+Math.PI/2;
    ctx.globalAlpha=alpha;ctx.beginPath();
    ctx.moveTo(ax+Math.cos(perp)*ra,ay+Math.sin(perp)*ra);
    ctx.quadraticCurveTo(mx+Math.cos(perp)*ra*0.5,my+Math.sin(perp)*ra*0.5,bx+Math.cos(perp)*rb,by+Math.sin(perp)*rb);
    ctx.quadraticCurveTo(mx-Math.cos(perp)*ra*0.5,my-Math.sin(perp)*ra*0.5,ax-Math.cos(perp)*ra,ay-Math.sin(perp)*ra);
    ctx.closePath();ctx.fillStyle=rgba(0.12+motion*0.08);ctx.fill();
    ctx.strokeStyle=rgba(0.28+motion*0.15);ctx.lineWidth=0.6;ctx.stroke();
  });
  nodes.forEach((n,idx)=>{
    const pulse=Math.sin(t*2+idx*0.7)*0.2+0.8,r=n.r*(pulse+motion*0.25);
    const glow=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r*2.5);glow.addColorStop(0,rgba(0.6));glow.addColorStop(0.4,rgba(0.18));glow.addColorStop(1,rgba(0));
    ctx.globalAlpha=alpha;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(n.x,n.y,r*2.5,0,Math.PI*2);ctx.fill();
    const core=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r);core.addColorStop(0,rgba(0.88));core.addColorStop(0.5,rgba(0.35));core.addColorStop(1,rgba(0));
    ctx.fillStyle=core;ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}

// ── Sombra ────────────────────────────────────────────────────────────────
const BSEGS2=[{j:[5,7,9],w:0.5},{j:[6,8,10],w:0.5},{j:[11,13,15],w:0.7},{j:[12,14,16],w:0.7},{j:[5,6],w:0.9},{j:[11,12],w:0.9},{j:[5,11],w:0.8},{j:[6,12],w:0.8}];
function drawGhost(ctx,sh,W,H,color,alpha,t){
  if(!sh||sh.buf.length<4)return;
  ctx.save();
  const h=color.replace('#','');const cr=parseInt(h.substring(0,2),16),cg=parseInt(h.substring(2,4),16),cb=parseInt(h.substring(4,6),16);
  const rgba=a=>`rgba(${cr},${cg},${cb},${Math.min(1,Math.max(0,a))})`;
  const di=Math.floor(sh.buf.length*Math.max(0,Math.min(0.9,sh.df)));
  const lmRaw=sh.buf[Math.max(0,sh.buf.length-1-di)];if(!lmRaw)return;
  let lm=lmRaw;
  if(sh.extrap&&sh.buf.length>di+4){
    const lmC=sh.buf[sh.buf.length-1],lmP=sh.buf[Math.max(0,sh.buf.length-1-di)];
    lm=lmRaw.map((p,i)=>{if(!p||!lmC[i]||!lmP[i])return p;return{x:Math.max(0,Math.min(1,p.x+(lmC[i].x-lmP[i].x)*0.6)),y:Math.max(0,Math.min(1,p.y+(lmC[i].y-lmP[i].y)*0.6))};});
  }
  const px=(f,i)=>f[i]?((sh.mir?(1-f[i].x):f[i].x+0.3)+Math.sin(t*0.5+f[i].y*5)*sh.rnd*0.02)*W:0;
  const py=(f,i)=>f[i]?(f[i].y+Math.cos(t*0.6+f[i].x*5)*sh.rnd*0.015)*H:0;
  BSEGS2.forEach(seg=>{
    const pts=seg.j.filter(i=>lm[i]);if(pts.length<2)return;
    for(let j=0;j<pts.length-1;j++){
      const a=pts[j],b=pts[j+1];if(!lm[a]||!lm[b])return;
      const ax=px(lm,a),ay=py(lm,a),bx=px(lm,b),by=py(lm,b);
      ctx.globalAlpha=alpha*0.35;ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo((ax+bx)/2+Math.sin(t*2+j)*4,(ay+by)/2+Math.cos(t+j)*3,bx,by);ctx.strokeStyle=rgba(0.4);ctx.lineWidth=seg.w*18+6;ctx.lineCap="round";ctx.stroke();
      ctx.globalAlpha=alpha*0.85;ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo((ax+bx)/2+Math.sin(t*2+j)*4,(ay+by)/2+Math.cos(t+j)*3,bx,by);ctx.strokeStyle=rgba(0.9);ctx.lineWidth=seg.w*5+2;ctx.stroke();
    }
  });
  [0,9,10].forEach((i,k)=>{if(!lm[i])return;const x=px(lm,i),y=py(lm,i),r=(i===0?22:16)*(Math.sin(t*2+k)*0.15+0.85);const g=ctx.createRadialGradient(x,y,0,x,y,r*1.8);g.addColorStop(0,rgba(0.9));g.addColorStop(0.4,rgba(0.4));g.addColorStop(1,rgba(0));ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*1.8,0,Math.PI*2);ctx.fill();ctx.globalAlpha=alpha*0.95;ctx.fillStyle=rgba(1);ctx.beginPath();ctx.arc(x,y,r*0.4,0,Math.PI*2);ctx.fill();});
  ctx.restore();
}

// ── Zonas de color corporal ───────────────────────────────────────────────
const BODY_ZONES=[
  {j:10,color:"#00FFFF",comp:"#FF4040",name:"Mano D"},
  {j:9, color:"#FF00FF",comp:"#80FF00",name:"Mano I"},
  {j:11,color:"#FFB300",comp:"#0055FF",name:"Cadera I"},
  {j:12,color:"#FFB300",comp:"#0055FF",name:"Cadera D"},
  {j:0, color:"#FFFFFF",comp:"#888888",name:"Cabeza"},
  {j:15,color:"#00FF88",comp:"#FF0077",name:"Pie I"},
  {j:16,color:"#00FF88",comp:"#FF0077",name:"Pie D"},
];
function drawBodyZones(ctx,lm,W,H,t,motion){
  if(!lm)return;
  ctx.save();ctx.globalCompositeOperation="screen";
  BODY_ZONES.forEach(z=>{
    const p=lm[z.j];if(!p)return;
    const x=(1-p.x)*W,y=p.y*H;
    const r=160+motion*80+Math.sin(t*0.8+z.j)*20;
    const g=ctx.createRadialGradient(x,y,r*0.3,x,y,r);
    g.addColorStop(0,z.color+"18");g.addColorStop(0.5,z.color+"08");g.addColorStop(1,"transparent");
    ctx.globalAlpha=0.5+motion*0.15;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}
function drawAfterimages(ctx,ais,t){
  if(!ais.length)return;
  ctx.save();ctx.globalCompositeOperation="screen";
  for(let i=ais.length-1;i>=0;i--){
    const ai=ais[i];ai.alpha=Math.max(0,ai.alpha-0.007);ai.r+=0.5;ai.age++;
    if(ai.alpha<=0){ais.splice(i,1);continue;}
    const hr=ai.color.replace('#','');const cr=parseInt(hr.substring(0,2),16),cg=parseInt(hr.substring(2,4),16),cb=parseInt(hr.substring(4,6),16);
    const g=ctx.createRadialGradient(ai.x,ai.y,0,ai.x,ai.y,ai.r);
    g.addColorStop(0,`rgba(${cr},${cg},${cb},${ai.alpha*0.7})`);g.addColorStop(0.5,`rgba(${cr},${cg},${cb},${ai.alpha*0.2})`);g.addColorStop(1,"transparent");
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(ai.x,ai.y,ai.r,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

// ── Mundo paralelo ────────────────────────────────────────────────────────
function drawGhostWorld(ghostCtx,W,H,sh,t,palette,bgImg,worldOp,isApertura){
  const op=worldOp??0.85;
  ghostCtx.clearRect(0,0,W,H);ghostCtx.fillStyle="#000";ghostCtx.fillRect(0,0,W,H);
  if(bgImg&&(bgImg.readyState===undefined||bgImg.readyState>=1)){
    ghostCtx.save();ghostCtx.globalAlpha=op*0.7;
    ghostCtx.filter=isApertura?"saturate(2) brightness(0.6) contrast(1.4)":"blur(4px) saturate(0.25) brightness(0.28)";
    ghostCtx.drawImage(bgImg,0,0,W,H);ghostCtx.filter="none";ghostCtx.restore();
    ghostCtx.save();ghostCtx.globalAlpha=op*(isApertura?0.22:0.32);ghostCtx.fillStyle=palette.primary;ghostCtx.globalCompositeOperation="screen";ghostCtx.fillRect(0,0,W,H);ghostCtx.restore();
  }else{
    const now=Date.now()*0.0003;
    const grd=ghostCtx.createRadialGradient(W*0.5+Math.sin(now)*100,H*0.4+Math.cos(now*0.7)*70,0,W*0.5,H*0.5,W*0.65);
    grd.addColorStop(0,palette.primary+"20");grd.addColorStop(0.6,palette.secondary+"08");grd.addColorStop(1,"transparent");
    ghostCtx.globalAlpha=op;ghostCtx.fillStyle=grd;ghostCtx.fillRect(0,0,W,H);ghostCtx.globalAlpha=1;
  }
  if(sh&&sh.buf.length>3)drawGhost(ghostCtx,sh,W,H,palette.shadowColor,op*0.85,t);
  const vig=ghostCtx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.75);
  vig.addColorStop(0,"transparent");vig.addColorStop(1,"rgba(0,0,0,0.6)");
  ghostCtx.fillStyle=vig;ghostCtx.fillRect(0,0,W,H);
}

// ── Línea de tiempo Apertura ──────────────────────────────────────────────
const APERTURA_TIMELINE=[
  {t:0,  label:"Limpio",       blur:0, ghost:0,   inv:false,solar:false},
  {t:15, label:"Blur",         blur:8, ghost:0,   inv:false,solar:false},
  {t:30, label:"Ghost",        blur:0, ghost:0.6, inv:false,solar:false},
  {t:50, label:"Invertido",    blur:0, ghost:0,   inv:true, solar:false},
  {t:65, label:"Solarización", blur:0, ghost:0.3, inv:false,solar:true},
  {t:80, label:"Limpio",       blur:0, ghost:0,   inv:false,solar:false},
];
function getAperturaFx(elapsed){
  const tl=APERTURA_TIMELINE,T=elapsed%80;
  let prev=tl[0],next=tl[tl.length-1];
  for(let i=0;i<tl.length-1;i++){if(T>=tl[i].t&&T<tl[i+1].t){prev=tl[i];next=tl[i+1];break;}}
  const span=Math.max(0.001,next.t-prev.t);const prog=Math.min(1,(T-prev.t)/span);
  const lerp=(a,b)=>a+(b-a)*prog;
  return{blur:lerp(prev.blur,next.blur),ghost:lerp(prev.ghost,next.ghost),inv:prog>0.5?next.inv:prev.inv,solar:prog>0.5?next.solar:prev.solar,label:prev.label};
}

export default function App(){
  const[phase,setPhase]=useState("start");
  const[loadMsg,setLoadMsg]=useState("");
  const[fps,setFps]=useState(0);
  const[scene,setScene]=useState("deriva");
  const[fs,setFs]=useState(false);
  const[ut,setUt]=useState(0);
  const[recording,setRecording]=useState(false);
  const[recTime,setRecTime]=useState(0);
  const[cameras,setCameras]=useState([]);
  const[camId,setCamId]=useState("");

  const S=useRef({
    deriva:{
      videoSlots:[{ld:false,nm:"",url:null,op:1},{ld:false,nm:"",url:null,op:1},{ld:false,nm:"",url:null,op:1},{ld:false,nm:"",url:null,op:1}],
      activeVideoIdx:-1,camOp:0.8,synOn:false,synVol:0.7,synDl:0.45,synRv:0.1,droneOn:true,icoOn:true,
    },
    kenopsia:{
      photoSlots:[{ld:false,nm:"",img:null,op:1},{ld:false,nm:"",img:null,op:1},{ld:false,nm:"",img:null,op:1},{ld:false,nm:"",img:null,op:1}],
      activePhotoIdx:-1,camOp:0.7,droneOn:true,ghostProjectionOn:false,zonesOn:true,
      textIdx:0,spinCD:0,prevSpinning:false,
    },
    apertura:{
      videoSlots:[{ld:false,nm:"",url:null,op:1},{ld:false,nm:"",url:null,op:1},{ld:false,nm:"",url:null,op:1},{ld:false,nm:"",url:null,op:1}],
      activeVideoIdx:-1,droneOn:true,loopOn:true,ghostProjectionOn:false,
      tPoseCD:0,timelineStart:null,tlFx:{blur:0,ghost:0,inv:false,solar:false,label:"Limpio"},
    },
    g:null,dbg:"init",poseCount:0,arc:"deriva",stopped:false,showOv:true,
    shadowOn:true,shadowDelay:0.5,shadowMirror:true,shadowRandom:0.3,shadowOpacity:0.75,shadowExtrap:false,
    entityOpacity:0.85,curNote:"—",
    melodyAtk:0.08,bassAtk:0.08,chordAtk:0.3,
  }).current;

  // refs de vídeos (4 deriva + 4 apertura)
  const derivaVRefs=[useRef(null),useRef(null),useRef(null),useRef(null)];
  const aperturaVRefs=[useRef(null),useRef(null),useRef(null),useRef(null)];
  const kenopsiaImgs=useRef([null,null,null,null]);

  const wcRef=useRef(null);const pvRef=useRef(null);const outRef=useRef(null);const bcRef=useRef(null);
  const detRef=useRef(null);const streamRef=useRef(null);const cRef=useRef(null);
  const gRef=useRef(new Gest());const syRef=useRef(new Synth());const shRef=useRef(new Shadow());
  const droneRef=useRef(new Drone());const loopRef=useRef(new LoopRecorder());
  const samplerRef=useRef(null);
  const plkTRef=useRef(0);const animRef=useRef(null);const fpsR=useRef({c:0,t:performance.now()});
  const recRef=useRef(null);const recChunks=useRef([]);const recTimer=useRef(null);
  const recTimeRef=useRef(0);
  const ghostCRef=useRef(null);
  const particlesRef=useRef([]);
  const afterimagesRef=useRef([]);
  const prevZoneRef=useRef({});
  const ghostCanvasRef=useRef(null);
  const ghostWinRef=useRef(null);
  const sceneRef=useRef("deriva");
  const crossChestCD=useRef(0);
  const tk=()=>setUt(u=>u+1);

  useEffect(()=>{sceneRef.current=scene;},[scene]);

  // ── Aplicar arco emocional ────────────────────────────────────────────
  const applyArc=(arcId)=>{
    const p=ARC_PALETTES[arcId];if(!p)return;
    S.arc=arcId;
    const syn=syRef.current;
    syn.chS(p.scale);syn.chK(p.key);syn.arpBPM=p.bpm;
    if(p.synChar){syn.setDl(p.synChar.dl);syn.setRv(p.synChar.rv);syn.octLo=p.synChar.octLo;syn.octHi=p.synChar.octHi;S.melodyAtk=p.synChar.melodyAtk;S.bassAtk=p.synChar.bassAtk;S.chordAtk=p.synChar.chordAtk;}
    if(S[arcId]?.droneOn)droneRef.current.setArc(arcId);else droneRef.current.stop();
    particlesRef.current=[];
  };

  // ── Cambiar escena ────────────────────────────────────────────────────
  const switchScene=(newScene)=>{
    const cur=sceneRef.current;
    // Cerrar vídeo activo saliente
    if(cur==="deriva"){const d=S.deriva;if(d.activeVideoIdx>=0){const v=derivaVRefs[d.activeVideoIdx]?.current;if(v&&!v.paused)v.pause();d.activeVideoIdx=-1;}}
    if(cur==="apertura"){const ap=S.apertura;if(ap.activeVideoIdx>=0){const v=aperturaVRefs[ap.activeVideoIdx]?.current;if(v&&!v.paused)v.pause();ap.activeVideoIdx=-1;}ap.timelineStart=null;}
    particlesRef.current=[];
    setScene(newScene);
    applyArc(newScene);
    if(newScene==="apertura")S.apertura.timelineStart=Date.now()*0.001;
  };

  // ── Gestos por escena ─────────────────────────────────────────────────
  const handleGestureDeriva=(g)=>{
    const d=S.deriva;const syn=syRef.current;
    // Vídeos — 1 a la vez: lExt→0, rExt→1, bUp→2, sq→3
    const targets=[g.lExt,g.rExt,g.bUp,g.vD];
    const newIdx=targets.findIndex(Boolean);
    if(crossChestCD.current<=0&&g.crossChest){
      if(d.activeVideoIdx>=0){const v=derivaVRefs[d.activeVideoIdx]?.current;if(v&&!v.paused)v.pause();d.activeVideoIdx=-1;}
      crossChestCD.current=40;
    }else if(newIdx>=0&&newIdx!==d.activeVideoIdx){
      // cerrar el anterior
      if(d.activeVideoIdx>=0){const vOld=derivaVRefs[d.activeVideoIdx]?.current;if(vOld&&!vOld.paused)vOld.pause();}
      // abrir el nuevo si está cargado
      if(d.videoSlots[newIdx].ld){const vNew=derivaVRefs[newIdx]?.current;if(vNew&&vNew.paused)vNew.play().catch(()=>{});d.activeVideoIdx=newIdx;}
    }
    // Sintetizador
    if(d.synOn){
      if((g?.mt||0)>0.12){
        if(g.rAct){const n=syn.noteAt(g.rP);if(g.rPlk&&performance.now()-plkTRef.current>100){syn.plk("pluck",n,Math.min(1,g.spd.r/3));plkTRef.current=performance.now();}else syn.play("melody",n,0.3+g.spd.r*0.2,S.melodyAtk);S.curNote=n?m2n(n.midi):"—";}else{syn.rel("melody",0.4);S.curNote="—";}
        if(g.lExt)syn.play("bass",syn.noteAt(g.lP,2,3),0.5,S.bassAtk);else syn.rel("bass",0.5);
        if(g.vD)syn.play("sub",syn.noteAt(0.1,1,2),g.sq,S.bassAtk);else syn.rel("sub",0.8);
        if(g.circleR){syn.play("chord",syn.noteAt(g.rP,3,5),0.85,S.chordAtk);}
      }else{syn.rel("melody",0.5);syn.rel("bass",0.5);syn.rel("chord",0.8);syn.rel("sub",0.8);}
    }else{syn.rel("melody",0.5);syn.rel("bass",0.5);syn.rel("chord",0.8);syn.rel("sub",0.8);}
  };

  const handleGestureKenopsia=(g,W,H)=>{
    const k=S.kenopsia;
    // Fotos — 1 a la vez: lExt→0, rExt→1, bUp→2, sq→3
    const targets=[g.lExt,g.rExt,g.bUp,g.vD];
    const newIdx=targets.findIndex(Boolean);
    if(crossChestCD.current<=0&&g.crossChest){k.activePhotoIdx=-1;crossChestCD.current=40;}
    else if(newIdx>=0&&newIdx!==k.activePhotoIdx){if(k.photoSlots[newIdx].ld)k.activePhotoIdx=newIdx;}
    // Textos por giro de cadera
    if(k.spinCD>0)k.spinCD--;
    if(g.spinning&&!k.prevSpinning&&k.spinCD<=0){
      const text=KENOPSIA_TEXTS[k.textIdx%KENOPSIA_TEXTS.length];
      k.textIdx=(k.textIdx+1)%KENOPSIA_TEXTS.length;
      const x=W*0.5+(Math.random()-0.5)*W*0.25;
      const y=H*0.45+(Math.random()-0.5)*H*0.2;
      const tp=new TextParticle(text,x,y,ARC_PALETTES.kenopsia.textColor,"kenopsia_zoom","default");
      tp.maxLife=320;particlesRef.current.push(tp);
      if(particlesRef.current.length>5)particlesRef.current.shift();
      k.spinCD=90;
    }
    k.prevSpinning=g.spinning;
  };

  const handleGestureApertura=(g)=>{
    const ap=S.apertura;const lr=loopRef.current;
    // Vídeos — 1 a la vez: lExt→0, rExt→1, bUp→2, sq→3
    const targets=[g.lExt,g.rExt,g.bUp,g.vD];
    const newVidIdx=targets.findIndex(Boolean);
    if(crossChestCD.current<=0&&g.crossChest){
      if(ap.activeVideoIdx>=0){const v=aperturaVRefs[ap.activeVideoIdx]?.current;if(v&&!v.paused)v.pause();ap.activeVideoIdx=-1;}
      crossChestCD.current=40;
    }else if(newVidIdx>=0&&newVidIdx!==ap.activeVideoIdx){
      if(ap.activeVideoIdx>=0){const vOld=aperturaVRefs[ap.activeVideoIdx]?.current;if(vOld&&!vOld.paused)vOld.pause();}
      if(ap.videoSlots[newVidIdx].ld){const vNew=aperturaVRefs[newVidIdx]?.current;if(vNew&&vNew.paused)vNew.play().catch(()=>{});ap.activeVideoIdx=newVidIdx;}
    }
    // Loops: bUp→0, lExt→1, rExt→2, vD→3
    if(ap.loopOn){
      const loopTargets=[g.bUp,g.lExt,g.rExt,g.vD];
      const triggerIdx=loopTargets.findIndex(Boolean);
      if(ap.tPoseCD>0)ap.tPoseCD--;
      if(triggerIdx>=0&&ap.tPoseCD<=0){
        const loop=lr.loops[triggerIdx];
        if(loop.recording)lr.stopRecord();
        else if(!loop.buffer)lr.startRecord(triggerIdx);
        else lr.toggle(triggerIdx);
        ap.tPoseCD=45;
      }
      if(g.crossChest&&lr.recordingIdx!==null)lr.stopRecord();
    }
  };

  // ── Popup mundo paralelo ──────────────────────────────────────────────
  const openGhostWin=(scnKey)=>{
    const win=window.open("","ghostWin","width=960,height=540,menubar=no,toolbar=no,location=no");
    if(!win)return;
    win.document.body.style.cssText="margin:0;background:#000;overflow:hidden;";
    const canvas=win.document.createElement("canvas");canvas.width=960;canvas.height=540;canvas.style.cssText="width:100%;height:100%;display:block;";
    win.document.body.appendChild(canvas);
    ghostCanvasRef.current=canvas;ghostWinRef.current=win;
    S[scnKey].ghostProjectionOn=true;tk();
  };
  const closeGhostWin=(scnKey)=>{try{ghostWinRef.current?.close();}catch(e){}ghostCanvasRef.current=null;ghostWinRef.current=null;S[scnKey].ghostProjectionOn=false;tk();};

  // ── Cámara ────────────────────────────────────────────────────────────
  const listCams=async()=>{try{const d=await navigator.mediaDevices.enumerateDevices();setCameras(d.filter(x=>x.kind==="videoinput"));}catch(e){}};
  const switchCam=async(id)=>{try{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());const c={video:{width:{ideal:640},height:{ideal:480}}};if(id)c.video.deviceId={exact:id};else c.video.facingMode="user";const s=await navigator.mediaDevices.getUserMedia(c);streamRef.current=s;if(wcRef.current){wcRef.current.srcObject=s;wcRef.current.muted=true;wcRef.current.play().catch(()=>{});}if(pvRef.current){pvRef.current.srcObject=s;pvRef.current.muted=true;pvRef.current.play().catch(()=>{});}setCamId(id||"");await listCams();}catch(e){}};

  // ── Grabación de pantalla ─────────────────────────────────────────────
  const startRec=()=>{
    const c=outRef.current;if(!c)return;
    const vs=c.captureStream(30);
    try{const syn=syRef.current;if(syn.c&&syn.m){const ad=syn.c.createMediaStreamDestination();syn.m.connect(ad);if(droneRef.current?.masterG)droneRef.current.masterG.connect(ad);const at=ad.stream.getAudioTracks()[0];if(at)vs.addTrack(at);}}catch(e){}
    const mr=new MediaRecorder(vs,{mimeType:"video/webm",videoBitsPerSecond:4e6});
    recChunks.current=[];mr.ondataavailable=e=>{if(e.data.size>0)recChunks.current.push(e.data);};
    mr.onstop=()=>{const b=new Blob(recChunks.current,{type:"video/webm"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`korpsound-${Date.now()}.webm`;a.click();};
    mr.start(100);recRef.current=mr;setRecording(true);recTimeRef.current=0;setRecTime(0);
    recTimer.current=setInterval(()=>{recTimeRef.current++;setRecTime(t=>t+1);},1000);
  };
  const stopRec=()=>{if(recRef.current?.state==="recording")recRef.current.stop();recRef.current=null;setRecording(false);clearInterval(recTimer.current);};

  // ── Carga de media ────────────────────────────────────────────────────
  const loadDerivaVideo=(file,i)=>{const r=derivaVRefs[i];if(!r?.current)return;if(S.deriva.videoSlots[i].url)URL.revokeObjectURL(S.deriva.videoSlots[i].url);const url=URL.createObjectURL(file);r.current.src=url;r.current.loop=true;r.current.muted=true;r.current.pause();S.deriva.videoSlots[i]={ld:true,nm:file.name,url,op:S.deriva.videoSlots[i].op};tk();};
  const loadKenopsiaPhoto=(file,i)=>{const img=new Image();img.onload=()=>{kenopsiaImgs.current[i]=img;S.kenopsia.photoSlots[i]={ld:true,nm:file.name,img,op:S.kenopsia.photoSlots[i].op};tk();};img.src=URL.createObjectURL(file);};
  const loadAperturaVideo=(file,i)=>{const r=aperturaVRefs[i];if(!r?.current)return;if(S.apertura.videoSlots[i].url)URL.revokeObjectURL(S.apertura.videoSlots[i].url);const url=URL.createObjectURL(file);r.current.src=url;r.current.loop=true;r.current.muted=true;r.current.pause();S.apertura.videoSlots[i]={ld:true,nm:file.name,url,op:S.apertura.videoSlots[i].op};tk();};

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(()=>{if(phase!=="loading")return;let dead=false;
    (async()=>{try{
      setLoadMsg("Solicitando cámara...");
      const s=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:"user"}});
      if(dead){s.getTracks().forEach(t=>t.stop());return;}streamRef.current=s;
      if(wcRef.current){wcRef.current.srcObject=s;wcRef.current.muted=true;wcRef.current.setAttribute("playsinline","true");await new Promise(r=>{wcRef.current.onloadeddata=r;wcRef.current.play().catch(()=>{});});}
      await listCams();
      setLoadMsg("Cargando TensorFlow...");
      await tf.setBackend("webgl");await tf.ready();if(dead)return;
      setLoadMsg("Descargando modelo...");
      detRef.current=await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet,{modelType:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING});
      if(dead)return;
      setLoadMsg("Calentando modelo...");
      try{const tmp=document.createElement("canvas");tmp.width=192;tmp.height=192;await detRef.current.estimatePoses(tmp);await detRef.current.estimatePoses(tmp);}catch(e){}
      await syRef.current.init();
      samplerRef.current=new SamplePlayer(syRef.current);
      await droneRef.current.init(syRef.current.c);
      droneRef.current.connectToComp(syRef.current.comp);
      loopRef.current.init(syRef.current.c,syRef.current.comp);
      droneRef.current.stop();syRef.current.silence();
      applyArc("deriva");
      setPhase("running");
    }catch(e){setLoadMsg("Error: "+e.message);}})();
    return()=>{dead=true;};
  },[phase]);

  useEffect(()=>{if(phase==="running"&&pvRef.current&&streamRef.current&&!pvRef.current.srcObject){pvRef.current.srcObject=streamRef.current;pvRef.current.muted=true;pvRef.current.play().catch(()=>{});}});

  // ── Loop de render ────────────────────────────────────────────────────
  useEffect(()=>{if(phase!=="running")return;let go=true,uiC=0,lastPT=0,detecting=false;
    const W=960,H=540;
    const pCvs=document.createElement("canvas");pCvs.width=192;pCvs.height=192;const pCtx=pCvs.getContext("2d");
    if(!ghostCRef.current){ghostCRef.current=document.createElement("canvas");ghostCRef.current.width=W;ghostCRef.current.height=H;}
    const ghostCtx=ghostCRef.current.getContext("2d");ghostCtx.fillStyle="#000";ghostCtx.fillRect(0,0,W,H);

    const render=()=>{
      if(!go)return;animRef.current=requestAnimationFrame(render);
      const canvas=outRef.current;if(!canvas)return;
      if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
      const ctx=canvas.getContext("2d");
      const wc=wcRef.current,pv=pvRef.current,t=Date.now()*0.001;
      if(wc&&streamRef.current&&!wc.srcObject){wc.srcObject=streamRef.current;wc.muted=true;wc.play().catch(()=>{});}
      if(pv&&streamRef.current&&!pv.srcObject){pv.srcObject=streamRef.current;pv.muted=true;pv.play().catch(()=>{});}
      const vid=(wc&&wc.readyState>=2)?wc:(pv&&pv.readyState>=2)?pv:null;

      // Detección
      if(detRef.current&&vid&&!detecting){
        const now=performance.now();
        if(now-lastPT>60){lastPT=now;detecting=true;
          pCtx.drawImage(vid,0,0,192,192);
          detRef.current.estimatePoses(pCvs).then(poses=>{
            if(!go){detecting=false;return;}
            S.poseCount=poses?.length||0;
            if(poses?.[0]?.keypoints){const g=gRef.current.run(poses[0].keypoints,192,192);S.g=g;S.dbg=g?"ok":"low";if(g&&S.shadowOn)shRef.current.push(g.lm);}
            else S.dbg="no_body";detecting=false;
          }).catch(()=>{S.dbg="err";detecting=false;});
        }
      }else if(!vid)S.dbg="no_video";

      const g=S.g;const syn=syRef.current;const drone=droneRef.current;
      const currentScene=sceneRef.current;
      const palette=ARC_PALETTES[currentScene]||ARC_PALETTES.deriva;

      if(crossChestCD.current>0)crossChestCD.current--;
      if(g&&!g.stopA)drone.modulate(g);
      if(g&&!g.stopA&&!S.stopped){
        if(currentScene==="deriva")handleGestureDeriva(g);
        else if(currentScene==="kenopsia")handleGestureKenopsia(g,W,H);
        else if(currentScene==="apertura")handleGestureApertura(g);
      }
      if(g?.stopA&&!S.stopped){S.stopped=true;syn.relAll();drone.stop();loopRef.current.stopAll();}
      if(!g?.stopA&&S.stopped){S.stopped=false;if(S[currentScene]?.droneOn)drone.resume();}

      particlesRef.current.forEach(p=>p.update(g?.mt||0));
      particlesRef.current=particlesRef.current.filter(p=>!p.isDead());

      // Timeline Apertura
      if(currentScene==="apertura"){
        const ap=S.apertura;if(ap.timelineStart===null)ap.timelineStart=t;
        ap.tlFx=getAperturaFx(t-ap.timelineStart);
      }

      // ── DIBUJO ───────────────────────────────────────────────────────
      ctx.clearRect(0,0,W,H);ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);

      const drawCam=(camOp,blendMode="screen")=>{
        if(!vid)return;
        const bc=bcRef.current;if(!bc)return;
        if(bc.width!==W||bc.height!==H){bc.width=W;bc.height=H;}
        const bx=bc.getContext("2d");bx.clearRect(0,0,W,H);bx.save();bx.translate(W,0);bx.scale(-1,1);bx.drawImage(vid,0,0,W,H);bx.restore();
        ctx.save();ctx.globalAlpha=camOp;ctx.globalCompositeOperation=blendMode;ctx.drawImage(bc,0,0,W,H);ctx.restore();
      };

      if(currentScene==="deriva"){
        const d=S.deriva;
        // 1. Icosaedro (debajo de vídeos)
        if(d.icoOn&&g?.lm)drawIcosahedron(ctx,g.lm,W,H,getIcoColor(t),t,g.mt||0);
        // 2. Vídeo activo — 100% pantalla
        if(d.activeVideoIdx>=0){
          const slot=d.videoSlots[d.activeVideoIdx];const vr=derivaVRefs[d.activeVideoIdx]?.current;
          if(slot.ld&&vr&&vr.readyState>=1){ctx.save();ctx.globalAlpha=slot.op;ctx.translate(W,0);ctx.scale(-1,1);ctx.drawImage(vr,0,0,W,H);ctx.restore();}
        }
        // 3. Cámara
        drawCam(d.camOp,"screen");
        // 4. Entidad fluida
        if(g?.lm)drawFluid(ctx,g.lm,W,H,palette.entityColor,S.entityOpacity,t,g.mt||0);
        // 5. Sombra
        if(S.shadowOn&&shRef.current.buf.length>3){shRef.current.mir=S.shadowMirror;shRef.current.rnd=S.shadowRandom;shRef.current.df=S.shadowDelay;shRef.current.extrap=false;drawGhost(ctx,shRef.current,W,H,palette.shadowColor,S.shadowOpacity,t);}

      }else if(currentScene==="kenopsia"){
        const k=S.kenopsia;
        // 1. Foto activa
        if(k.activePhotoIdx>=0){
          const img=kenopsiaImgs.current[k.activePhotoIdx];const slot=k.photoSlots[k.activePhotoIdx];
          if(img&&slot.ld){ctx.save();ctx.globalAlpha=slot.op;const sc=Math.max(W/img.width,H/img.height);ctx.drawImage(img,(W-img.width*sc)/2,(H-img.height*sc)/2,img.width*sc,img.height*sc);ctx.restore();}
        }
        // 2. Cámara
        drawCam(k.camOp,"screen");
        // 3. Zonas de color
        if(k.zonesOn&&g?.lm){
          drawBodyZones(ctx,g.lm,W,H,t,g.mt||0);
          BODY_ZONES.forEach(z=>{const p=g.lm[z.j];const was=prevZoneRef.current[z.j];if(was&&!p&&prevZoneRef.current[z.j+"x"]!==undefined){afterimagesRef.current.push({x:prevZoneRef.current[z.j+"x"],y:prevZoneRef.current[z.j+"y"],color:z.comp,alpha:0.65,r:85,age:0});}if(p){prevZoneRef.current[z.j]=true;prevZoneRef.current[z.j+"x"]=(1-p.x)*W;prevZoneRef.current[z.j+"y"]=p.y*H;}else prevZoneRef.current[z.j]=false;});
          drawAfterimages(ctx,afterimagesRef.current,t);
        }
        // 4. Entidad fluida
        if(g?.lm)drawFluid(ctx,g.lm,W,H,palette.entityColor,S.entityOpacity,t,g.mt||0);
        // 5. Textos zoom-out
        if(particlesRef.current.length){ctx.save();ctx.globalCompositeOperation="screen";particlesRef.current.forEach(p=>p.draw(ctx));ctx.restore();}
        // 6. Mundo paralelo
        if(k.ghostProjectionOn&&ghostCanvasRef.current){
          const gc=ghostCanvasRef.current.getContext("2d");
          shRef.current.mir=S.shadowMirror;shRef.current.rnd=S.shadowRandom;shRef.current.df=S.shadowDelay;shRef.current.extrap=true;
          drawGhostWorld(gc,960,540,shRef.current,t,palette,k.activePhotoIdx>=0?kenopsiaImgs.current[k.activePhotoIdx]:null,0.85,false);
        }

      }else if(currentScene==="apertura"){
        const ap=S.apertura;const fx=ap.tlFx||{blur:0,ghost:0,inv:false,solar:false};
        // Ghost/estela
        if(fx.ghost>0){ghostCtx.globalAlpha=1-fx.ghost;ghostCtx.fillStyle="#000";ghostCtx.fillRect(0,0,W,H);if(vid){ghostCtx.save();ghostCtx.translate(W,0);ghostCtx.scale(-1,1);ghostCtx.drawImage(vid,0,0,W,H);ghostCtx.restore();}ctx.drawImage(ghostCRef.current,0,0);}
        // 1. Cámara con efectos de timeline
        if(vid){
          const bc=bcRef.current;if(bc){
            if(bc.width!==W||bc.height!==H){bc.width=W;bc.height=H;}
            const bx=bc.getContext("2d");bx.clearRect(0,0,W,H);bx.save();bx.translate(W,0);bx.scale(-1,1);
            let f="";if(fx.blur>0)f+=`blur(${fx.blur.toFixed(1)}px) `;if(fx.inv)f+="invert(1) ";if(fx.solar)f+="contrast(2) saturate(3) brightness(0.5) ";
            if(f)bx.filter=f.trim();bx.drawImage(vid,0,0,W,H);bx.filter="none";bx.restore();
            ctx.save();ctx.globalAlpha=0.85;ctx.drawImage(bc,0,0,W,H);ctx.restore();
          }
        }
        // 2. Vídeo de efectos activo
        if(ap.activeVideoIdx>=0){
          const slot=ap.videoSlots[ap.activeVideoIdx];const vr=aperturaVRefs[ap.activeVideoIdx]?.current;
          if(slot.ld&&vr&&vr.readyState>=1){ctx.save();ctx.globalAlpha=slot.op*0.7;ctx.globalCompositeOperation="screen";ctx.translate(W,0);ctx.scale(-1,1);ctx.drawImage(vr,0,0,W,H);ctx.restore();}
        }
        // 3. Entidad fluida
        if(g?.lm)drawFluid(ctx,g.lm,W,H,palette.entityColor,S.entityOpacity,t,g.mt||0);
        // 4. Sombra
        if(S.shadowOn&&shRef.current.buf.length>3){shRef.current.mir=S.shadowMirror;shRef.current.rnd=S.shadowRandom;shRef.current.df=S.shadowDelay;shRef.current.extrap=S.shadowExtrap||false;drawGhost(ctx,shRef.current,W,H,palette.shadowColor,S.shadowOpacity,t);}
        // 5. Mundo paralelo
        if(ap.ghostProjectionOn&&ghostCanvasRef.current){
          const gc=ghostCanvasRef.current.getContext("2d");shRef.current.extrap=false;
          drawGhostWorld(gc,960,540,shRef.current,t,palette,ap.activeVideoIdx>=0?aperturaVRefs[ap.activeVideoIdx]?.current:null,0.9,true);
        }
      }

      // ── HUD ──────────────────────────────────────────────────────────
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";
      if(S.showOv){
        if(S.curNote!=="—"){ctx.fillStyle="rgba(16,185,129,0.8)";ctx.font="bold 13px monospace";ctx.textAlign="left";ctx.fillText("♫ "+S.curNote,10,22);}
        ctx.fillStyle=(ARC_PALETTES[currentScene]?.primary||"#fff")+"CC";ctx.font="bold 10px monospace";ctx.textAlign="left";ctx.fillText(ARC_PALETTES[currentScene]?.label||"",10,H-10);
        ctx.fillStyle="rgba(255,255,255,0.25)";ctx.font="10px monospace";ctx.textAlign="right";ctx.fillText(fps+"fps",W-8,H-8);
        if(currentScene==="apertura"){
          const ls=loopRef.current.loops;const ll=["MEL","ARM","BAS","AMB"];let lx=10;
          ls.forEach((l,i)=>{if(!l.buffer&&!l.recording)return;const col=l.recording?"#F43F5E":l.active?"#A855F7":"#64748B";ctx.fillStyle=col;ctx.globalAlpha=l.recording?(0.5+0.5*Math.sin(t*8)):0.8;ctx.beginPath();ctx.arc(lx+6,H-28,5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=0.7;ctx.fillStyle="#fff";ctx.font="bold 7px monospace";ctx.textAlign="left";ctx.fillText(ll[i],lx+14,H-25);lx+=65;});
          ctx.globalAlpha=1;
          if(S.apertura.tlFx?.label){ctx.fillStyle="rgba(245,158,11,0.7)";ctx.font="bold 10px monospace";ctx.textAlign="center";ctx.fillText("FX: "+S.apertura.tlFx.label,W/2,H-10);}
        }
        if(currentScene==="kenopsia"&&g?.spinning){ctx.save();ctx.globalAlpha=0.6;ctx.fillStyle="#94A3B8";ctx.font="bold 11px monospace";ctx.textAlign="center";ctx.fillText("◌ GIRO",W/2,H-26);ctx.restore();}
      }
      if(g?.stopA){ctx.globalAlpha=0.12;ctx.fillStyle="#FF0050";ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;ctx.fillStyle="#fff";ctx.font="bold 18px sans-serif";ctx.textAlign="center";ctx.fillText("DETENIDO",W/2,H/2);}
      if(!g){ctx.fillStyle="rgba(255,255,255,0.4)";ctx.font="14px sans-serif";ctx.textAlign="center";ctx.fillText({no_body:"Ponte frente a la cámara",no_video:"Conectando...",loading:"Cargando...",err:"Error",init:"Iniciando..."}[S.dbg]||"",W/2,H/2);}
      if(recording){ctx.save();ctx.fillStyle="#FF0050";ctx.beginPath();ctx.arc(18,18,6,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 10px sans-serif";ctx.fillText(`REC ${Math.floor(recTimeRef.current/60)}:${(recTimeRef.current%60).toString().padStart(2,"0")}`,28,22);ctx.restore();}

      fpsR.current.c++;const now2=performance.now();if(now2-fpsR.current.t>1000){setFps(fpsR.current.c);fpsR.current={c:0,t:now2};}
      uiC++;if(uiC%12===0)tk();
    };
    animRef.current=requestAnimationFrame(render);
    return()=>{go=false;if(animRef.current)cancelAnimationFrame(animRef.current);};
  },[phase]);

  useEffect(()=>{const h=()=>setFs(!!document.fullscreenElement);document.addEventListener("fullscreenchange",h);return()=>document.removeEventListener("fullscreenchange",h);},[]);
  const togFS=()=>{if(!fs&&cRef.current)cRef.current.requestFullscreen?.();else document.exitFullscreen?.();};

  // ── Estilos compartidos ───────────────────────────────────────────────
  const bg="#0A0A0F",bgC="#12121A",bgPanel="#1A1A28",bdr="#2A2A3E",txP="#E8E8F0",txS="#6B6B8A",ac="#3B82F6";
  const sLbl={fontSize:11,fontWeight:600,color:txS,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:"0.05em"};
  const sSel=()=>({width:"100%",background:bgPanel,border:`1px solid ${bdr}`,color:txP,padding:"8px 10px",borderRadius:8,fontSize:12});
  const FxS=({label,val,min,max,step,color,onChange})=>(<div style={{marginBottom:10}}><span style={sLbl}>{label}: {val.toFixed(step<0.1?2:0)}</span><input type="range" min={min} max={max} step={step} value={val} onChange={e=>onChange(parseFloat(e.target.value))} style={{width:"100%",accentColor:color||ac,height:6,cursor:"pointer"}}/></div>);
  const Tog=({on,color=ac,label,onTap,small})=>(<div onPointerDown={onTap} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:small?"6px 10px":"10px 12px",borderRadius:8,background:on?color+"18":bgPanel,border:`1px solid ${on?color+"50":bdr}`,marginBottom:6}}>
    <span style={{width:32,height:18,borderRadius:9,background:on?color+"40":bdr,border:`1px solid ${on?color:bdr}`,display:"flex",alignItems:"center",justifyContent:on?"flex-end":"flex-start",padding:2,flexShrink:0}}>
      <span style={{width:12,height:12,borderRadius:6,background:on?color:"#4A4A6A"}}/>
    </span>
    <span style={{fontSize:12,color:on?txP:txS}}>{label}</span>
  </div>);
  const BigBtn=({label,icon,color=ac,active,onTap,sub})=>(<div onPointerDown={onTap} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"11px 12px",borderRadius:8,background:active?color+"20":bgPanel,border:`1px solid ${active?color+"60":bdr}`,marginBottom:6}}>
    <span style={{fontSize:16}}>{icon}</span>
    <div><div style={{fontSize:12,fontWeight:600,color:active?color:txP}}>{label}</div>{sub&&<div style={{fontSize:9,color:txS}}>{sub}</div>}</div>
  </div>);

  // ── Escena DERIVA ─────────────────────────────────────────────────────
  const SceneDeriva=()=>{
    const d=S.deriva;const pal=ARC_PALETTES.deriva;const syn=syRef.current;
    return(<div style={{padding:12}}>
      <div style={{fontSize:11,color:pal.primary,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${bdr}`}}>● Nostalgia · Memoria · Pasado</div>
      <Tog on={d.droneOn} color={pal.primary} label="Drone" onTap={()=>{d.droneOn=!d.droneOn;if(d.droneOn)droneRef.current.setArc("deriva");else droneRef.current.stop();tk();}}/>
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4,marginBottom:6}}>
        <Tog on={d.synOn} color={pal.primary} label="Sintetizador" onTap={()=>{d.synOn=!d.synOn;if(!d.synOn)syn.silence();else syn.unsilence();tk();}}/>
        {d.synOn&&<>
          <FxS label="Volumen" val={d.synVol} min={0} max={1} step={0.01} color={pal.primary} onChange={v=>{d.synVol=v;syn.setV(v);tk();}}/>
          <FxS label="Delay" val={d.synDl} min={0} max={0.8} step={0.01} color={pal.secondary} onChange={v=>{d.synDl=v;syn.setDl(v);tk();}}/>
          <FxS label="Reverb" val={d.synRv} min={0} max={0.8} step={0.01} color="#6366F1" onChange={v=>{d.synRv=v;syn.setRv(v);tk();}}/>
          <div style={{fontSize:9,color:txS,padding:"5px 8px",borderRadius:6,background:bgPanel,border:`1px solid ${bdr}`,marginBottom:8,lineHeight:1.6}}>
            <span style={{color:pal.primary,fontWeight:700}}>Gestos:</span> → Mano D (melodía) · ← Mano I (bajo) · ↓ Sent (sub) · ○ Círculo D (acordes)
          </div>
        </>}
      </div>
      <Tog on={d.icoOn} color={pal.primary} label="Icosaedro sagrado (color aleatorio ~3s)" onTap={()=>{d.icoOn=!d.icoOn;tk();}}/>
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <FxS label="Opacidad cámara" val={d.camOp} min={0} max={1} step={0.01} color={pal.primary} onChange={v=>{d.camOp=v;tk();}}/>
      </div>
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:txP,marginBottom:4}}>Vídeos de infancia</div>
        <div style={{fontSize:9,color:txS,marginBottom:8,lineHeight:1.7,padding:"6px 8px",borderRadius:6,background:bgPanel,border:`1px solid ${bdr}`}}>
          <div>← Brazo izq → <span style={{color:pal.primary}}>video_1</span> · → Brazo der → <span style={{color:pal.primary}}>video_2</span></div>
          <div>↑ Brazos → <span style={{color:pal.primary}}>video_3</span> · ↓ Sentadilla → <span style={{color:pal.primary}}>video_4</span></div>
          <div style={{color:"#F43F5E"}}>✕ Cruzados → cierra · Solo uno activo a la vez</div>
        </div>
        {d.videoSlots.map((slot,i)=>{
          const isActive=d.activeVideoIdx===i;
          const labels=["video_1 (← izq)","video_2 (→ der)","video_3 (↑ brazos)","video_4 (↓ sent)"];
          return(<div key={i} style={{marginBottom:8,padding:"10px",borderRadius:8,border:`1px solid ${isActive?pal.primary+"80":slot.ld?bdr+"60":bdr}`,background:isActive?pal.primary+"10":bgPanel}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:slot.ld?6:0}}>
              <span style={{fontSize:10,fontWeight:700,color:isActive?pal.primary:slot.ld?txP:txS,flex:1}}>{labels[i]}</span>
              {isActive&&<span style={{color:pal.primary,fontSize:8,fontWeight:700}}>▶ ACTIVO</span>}
            </div>
            <label style={{display:"block",padding:"7px",border:`1px dashed ${pal.primary}40`,borderRadius:6,cursor:"pointer",textAlign:"center",fontSize:10,color:slot.ld?pal.primary:txS}}>
              {slot.ld?"✓ "+slot.nm.slice(0,24):"Cargar vídeo"}
              <input type="file" accept="video/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&loadDerivaVideo(e.target.files[0],i)}/>
            </label>
            {slot.ld&&<FxS label="Opacidad" val={slot.op} min={0} max={1} step={0.01} color={pal.primary} onChange={v=>{slot.op=v;tk();}}/>}
          </div>);
        })}
      </div>
    </div>);
  };

  // ── Escena KENOPSIA ───────────────────────────────────────────────────
  const SceneKenopsia=()=>{
    const k=S.kenopsia;const pal=ARC_PALETTES.kenopsia;
    return(<div style={{padding:12}}>
      <div style={{fontSize:11,color:pal.primary,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${bdr}`}}>● Melancolía · Fantasmagoría</div>
      <Tog on={k.droneOn} color={pal.primary} label="Drone" onTap={()=>{k.droneOn=!k.droneOn;if(k.droneOn)droneRef.current.setArc("kenopsia");else droneRef.current.stop();tk();}}/>
      <Tog on={k.zonesOn} color={pal.primary} label="Zonas de color corporal" onTap={()=>{k.zonesOn=!k.zonesOn;tk();}}/>
      <FxS label="Opacidad cámara" val={k.camOp} min={0} max={1} step={0.01} color={pal.primary} onChange={v=>{k.camOp=v;tk();}}/>
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4,marginBottom:6}}>
        <div style={{fontSize:11,fontWeight:700,color:txP,marginBottom:6}}>Mundo paralelo</div>
        <div style={{fontSize:9,color:txS,marginBottom:8,lineHeight:1.5,padding:"5px 8px",borderRadius:6,background:bgPanel,border:`1px solid ${bdr}`}}>Foto activa + sombra extrapolada → proyector externo</div>
        {!k.ghostProjectionOn?<BigBtn label="Abrir mundo paralelo" icon="🌒" color={pal.primary} onTap={()=>openGhostWin("kenopsia")} sub="→ segunda pantalla"/>:<BigBtn label="Cerrar proyección" icon="✕" color="#F43F5E" active onTap={()=>closeGhostWin("kenopsia")}/>}
      </div>
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:txP,marginBottom:4}}>Textos (giro de cadera)</div>
        <div style={{fontSize:9,color:txS,marginBottom:8,lineHeight:1.6,padding:"5px 8px",borderRadius:6,background:bgPanel,border:`1px solid ${bdr}`}}>Desplazamiento lateral rápido → zoom-out hacia el frente. Secuencia 1→4 en bucle. Cooldown 1.5s.</div>
        {KENOPSIA_TEXTS.map((txt,i)=>{
          const next=k.textIdx%KENOPSIA_TEXTS.length;
          return(<div key={i} style={{padding:"5px 8px",borderRadius:6,border:`1px solid ${i===next?"#CBD5E1":"transparent"}`,marginBottom:3,background:i===next?"#CBD5E110":"transparent"}}>
            <span style={{fontSize:9,color:i===next?txP:txS}}><span style={{color:pal.primary,fontWeight:700}}>T{i+1}</span> {txt.replace(/\n/g," ")}</span>
          </div>);
        })}
        <div onPointerDown={()=>{k.textIdx=0;particlesRef.current=[];tk();}} style={{cursor:"pointer",padding:"5px",borderRadius:6,background:bgPanel,fontSize:10,color:txS,textAlign:"center",border:`1px solid ${bdr}`,marginTop:4}}>↺ Reiniciar secuencia</div>
      </div>
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:txP,marginBottom:4}}>Fotografías estacionales</div>
        <div style={{fontSize:9,color:txS,marginBottom:8,lineHeight:1.7,padding:"5px 8px",borderRadius:6,background:bgPanel,border:`1px solid ${bdr}`}}>
          <div>← Brazo izq → <span style={{color:pal.primary}}>foto_1</span> (invierno) · → Brazo der → <span style={{color:pal.primary}}>foto_2</span> (primavera)</div>
          <div>↑ Brazos → <span style={{color:pal.primary}}>foto_3</span> (verano) · ↓ Sent → <span style={{color:pal.primary}}>foto_4</span> (otoño)</div>
          <div style={{color:"#F43F5E"}}>✕ Cruzados → cierra · Solo una activa a la vez</div>
        </div>
        {k.photoSlots.map((slot,i)=>{
          const isActive=k.activePhotoIdx===i;
          const labels=["foto_1 / Invierno (← izq)","foto_2 / Primavera (→ der)","foto_3 / Verano (↑ brazos)","foto_4 / Otoño (↓ sent)"];
          return(<div key={i} style={{marginBottom:8,padding:"10px",borderRadius:8,border:`1px solid ${isActive?pal.primary+"80":slot.ld?bdr+"60":bdr}`,background:isActive?pal.primary+"10":bgPanel}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:slot.ld?6:0}}>
              <span style={{fontSize:10,fontWeight:700,color:isActive?pal.primary:slot.ld?txP:txS,flex:1}}>{labels[i]}</span>
              {isActive&&<span style={{color:pal.primary,fontSize:8,fontWeight:700}}>● ACTIVA</span>}
            </div>
            <label style={{display:"block",padding:"7px",border:`1px dashed ${pal.primary}40`,borderRadius:6,cursor:"pointer",textAlign:"center",fontSize:10,color:slot.ld?pal.primary:txS}}>
              {slot.ld?"✓ "+slot.nm.slice(0,24):"Cargar fotografía"}
              <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&loadKenopsiaPhoto(e.target.files[0],i)}/>
            </label>
            {slot.ld&&<FxS label="Opacidad" val={slot.op} min={0} max={1} step={0.01} color={pal.primary} onChange={v=>{slot.op=v;tk();}}/>}
          </div>);
        })}
      </div>
    </div>);
  };

  // ── Escena APERTURA ───────────────────────────────────────────────────
  const SceneApertura=()=>{
    const ap=S.apertura;const pal=ARC_PALETTES.apertura;const lr=loopRef.current;
    const loopLabels=["Melodía","Armonía","Bajo","Ambiente"];
    const loopGestos=["↑ Brazos","← Brazo izq","→ Brazo der","↓ Sent"];
    return(<div style={{padding:12}}>
      <div style={{fontSize:11,color:pal.primary,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${bdr}`}}>● Composición en vivo · Show electrónico</div>
      <Tog on={ap.droneOn} color={pal.primary} label="Drone" onTap={()=>{ap.droneOn=!ap.droneOn;if(ap.droneOn)droneRef.current.setArc("apertura");else droneRef.current.stop();tk();}}/>
      {/* Samples */}
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:txP,marginBottom:4}}>Instrumentos (samples)</div>
        {Object.entries(SAMPLE_ROLES).map(([role,info])=>{
          const has=samplerRef.current?.hasSample(role);
          return(<div key={role} style={{marginBottom:6,padding:"8px 10px",borderRadius:8,border:`1px solid ${has?info.color+"50":bdr}`,background:has?info.color+"08":bgPanel}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:has?4:0}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:has?info.color:bdr,flexShrink:0}}/>
              <span style={{fontSize:10,fontWeight:700,color:has?info.color:txP,flex:1}}>{info.label}</span>
              {has&&<div onPointerDown={()=>{samplerRef.current.removeSample(role);tk();}} style={{cursor:"pointer",fontSize:9,color:"#F43F5E",padding:"1px 6px",border:`1px solid #F43F5E30`,borderRadius:4}}>✕</div>}
            </div>
            <label style={{display:"block",padding:"6px",border:`1px dashed ${info.color}40`,borderRadius:6,cursor:"pointer",textAlign:"center",fontSize:9,color:has?info.color:txS}}>
              {has?"✓ Sample cargado":"Cargar .mp3 / .wav"}
              <input type="file" accept="audio/*" style={{display:"none"}} onChange={async e=>{const f=e.target.files[0];if(!f||!samplerRef.current)return;if(await samplerRef.current.loadSample(role,f))tk();}}/>
            </label>
          </div>);
        })}
      </div>
      {/* Loops */}
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontSize:11,fontWeight:700,color:txP}}>Loops en vivo (10s)</div>
          <Tog on={ap.loopOn} color="#A855F7" label="" onTap={()=>{ap.loopOn=!ap.loopOn;if(!ap.loopOn)lr.stopAll();tk();}} small/>
        </div>
        <div style={{fontSize:9,color:txS,marginBottom:8,lineHeight:1.7,padding:"5px 8px",borderRadius:6,background:bgPanel,border:`1px solid ${bdr}`}}>
          <div>↑ Brazos → <span style={{color:"#10B981"}}>Melodía</span> · ← → <span style={{color:"#3B82F6"}}>Armonía</span> · → → <span style={{color:"#F59E0B"}}>Bajo</span> · ↓ → <span style={{color:"#94A3B8"}}>Ambiente</span></div>
          <div style={{color:"#F43F5E"}}>✕ Cruzados → detener grabación</div>
        </div>
        {lr.loops.map((loop,i)=>{
          const col=loop.recording?"#F43F5E":loop.active?"#A855F7":loop.buffer?"#64748B":bdr;
          return(<div key={i} style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,padding:"8px 10px",borderRadius:8,border:`1px solid ${col}40`,background:loop.buffer?"#A855F708":bgPanel}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:col,flexShrink:0,boxShadow:loop.recording?"0 0 6px #F43F5E":loop.active?"0 0 6px #A855F7":"none"}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:700,color:txS}}>{loopLabels[i]} <span style={{fontWeight:400,color:txS}}>({loopGestos[i]})</span></div>
              <div style={{fontSize:8,color:loop.recording?"#F43F5E":loop.active?"#A855F7":txS}}>{loop.recording?"● REC...":loop.active?"▶ playing":loop.buffer?"■ pause":"vacío"}</div>
            </div>
            {loop.buffer&&<input type="range" min={0} max={1} step={0.05} value={loop.vol} onChange={e=>{lr.setVol(i,parseFloat(e.target.value));tk();}} style={{width:40,accentColor:"#A855F7",height:5,cursor:"pointer"}}/>}
            {loop.buffer&&!loop.recording&&<div onPointerDown={()=>{lr.toggle(i);tk();}} style={{cursor:"pointer",fontSize:10,color:"#A855F7",padding:"2px 6px",border:"1px solid #A855F730",borderRadius:4}}>{loop.active?"⏸":"▶"}</div>}
            {loop.buffer&&<div onPointerDown={()=>{lr.clear(i);tk();}} style={{cursor:"pointer",fontSize:10,color:"#F43F5E",padding:"2px 6px",border:"1px solid #F43F5E30",borderRadius:4}}>✕</div>}
            {loop.blob&&<div onPointerDown={()=>lr.download(i)} style={{cursor:"pointer",fontSize:10,color:"#3B82F6",padding:"2px 6px",border:"1px solid #3B82F630",borderRadius:4}}>↓</div>}
          </div>);
        })}
        <div onPointerDown={()=>{lr.clearAll();tk();}} style={{cursor:"pointer",padding:"6px",borderRadius:6,background:bgPanel,fontSize:10,color:txS,textAlign:"center",border:`1px solid ${bdr}`,marginBottom:6}}>Limpiar todos los loops</div>
        {/* Grabación completa */}
        <div style={{padding:"8px 10px",borderRadius:8,background:bgPanel,border:`1px solid ${bdr}`}}>
          <div style={{fontSize:10,fontWeight:700,color:txP,marginBottom:4}}>Grabación completa</div>
          {!recording?<BigBtn label="Grabar composición" icon="⏺" color="#DC2626" onTap={startRec}/>:<BigBtn label={`Detener ${Math.floor(recTimeRef.current/60)}:${(recTimeRef.current%60).toString().padStart(2,"0")}`} icon="⏹" color="#DC2626" active onTap={stopRec}/>}
        </div>
      </div>
      {/* Timeline */}
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:txP,marginBottom:4}}>Línea de tiempo (80s · ciclo)</div>
        {ap.tlFx&&<div style={{padding:"6px 8px",borderRadius:6,background:pal.primary+"15",border:`1px solid ${pal.primary}40`,fontSize:10,color:pal.primary,marginBottom:6}}>FX actual: <strong>{ap.tlFx.label}</strong></div>}
        <div onPointerDown={()=>{ap.timelineStart=Date.now()*0.001;tk();}} style={{cursor:"pointer",padding:"6px",borderRadius:6,background:bgPanel,fontSize:10,color:txS,textAlign:"center",border:`1px solid ${bdr}`,marginBottom:6}}>↺ Reiniciar timeline</div>
      </div>
      {/* Mundo paralelo + vídeos efectos */}
      <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:txP,marginBottom:4}}>Mundo paralelo · Show</div>
        {!ap.ghostProjectionOn?<BigBtn label="Abrir mundo paralelo" icon="⚡" color={pal.primary} onTap={()=>openGhostWin("apertura")} sub="→ pantallas laterales"/>:<BigBtn label="Cerrar proyección" icon="✕" color="#F43F5E" active onTap={()=>closeGhostWin("apertura")}/>}
        <div style={{marginTop:8}}>
          <div style={{fontSize:10,fontWeight:700,color:txP,marginBottom:4}}>Vídeos de efectos visuales</div>
          <div style={{fontSize:9,color:txS,marginBottom:8,lineHeight:1.7,padding:"5px 8px",borderRadius:6,background:bgPanel,border:`1px solid ${bdr}`}}>
            <div>← Brazo izq → <span style={{color:pal.primary}}>video_1</span> · → Brazo der → <span style={{color:pal.primary}}>video_2</span></div>
            <div>↑ Brazos → <span style={{color:pal.primary}}>video_3</span> · ↓ Sent → <span style={{color:pal.primary}}>video_4</span></div>
            <div style={{color:"#F43F5E"}}>✕ Cruzados → cierra · Solo uno activo</div>
          </div>
          {ap.videoSlots.map((slot,i)=>{
            const isActive=ap.activeVideoIdx===i;
            const labels=["video_1 (← izq)","video_2 (→ der)","video_3 (↑ brazos)","video_4 (↓ sent)"];
            return(<div key={i} style={{marginBottom:6,padding:"8px 10px",borderRadius:8,border:`1px solid ${isActive?pal.primary+"80":slot.ld?bdr+"60":bdr}`,background:isActive?pal.primary+"10":bgPanel}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{fontSize:10,fontWeight:700,color:isActive?pal.primary:txP,flex:1}}>{labels[i]}</span>
                {isActive&&<span style={{color:pal.primary,fontSize:8,fontWeight:700}}>▶ ACTIVO</span>}
              </div>
              <label style={{display:"block",padding:"6px",border:`1px dashed ${pal.primary}40`,borderRadius:6,cursor:"pointer",textAlign:"center",fontSize:9,color:slot.ld?pal.primary:txS}}>
                {slot.ld?"✓ "+slot.nm.slice(0,22):"Cargar vídeo"}
                <input type="file" accept="video/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&loadAperturaVideo(e.target.files[0],i)}/>
              </label>
              {slot.ld&&<FxS label="Opacidad" val={slot.op} min={0} max={1} step={0.01} color={pal.primary} onChange={v=>{slot.op=v;tk();}}/>}
            </div>);
          })}
        </div>
      </div>
    </div>);
  };

  // ── Escena CONFIG ─────────────────────────────────────────────────────
  const SceneConfig=()=>(<div style={{padding:12}}>
    <div style={{fontSize:11,color:txS,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${bdr}`}}>Configuración técnica</div>
    <div style={{marginBottom:12}}>
      <span style={sLbl}>Cámara</span>
      <select value={camId} onChange={e=>switchCam(e.target.value)} style={{...sSel(),marginBottom:8}}>
        <option value="">Por defecto</option>
        {cameras.map((c,i)=><option key={c.deviceId} value={c.deviceId}>{c.label||`Cámara ${i+1}`}</option>)}
      </select>
      <BigBtn label="Refrescar cámaras" icon="🔄" onTap={listCams}/>
    </div>
    <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginBottom:10}}>
      <span style={sLbl}>Sombra IA</span>
      <Tog on={S.shadowOn} color="#A855F7" label="Sombra activa" onTap={()=>{S.shadowOn=!S.shadowOn;tk();}}/>
      {S.shadowOn&&<>
        <FxS label="Retraso" val={S.shadowDelay} min={0.05} max={0.9} step={0.05} color="#A855F7" onChange={v=>{S.shadowDelay=v;tk();}}/>
        <FxS label="Aleatorio" val={S.shadowRandom} min={0} max={1} step={0.05} color="#A855F7" onChange={v=>{S.shadowRandom=v;tk();}}/>
        <FxS label="Opacidad" val={S.shadowOpacity} min={0.1} max={1} step={0.05} color="#A855F7" onChange={v=>{S.shadowOpacity=v;tk();}}/>
      </>}
    </div>
    <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10,marginBottom:10}}>
      <span style={sLbl}>Grabación de pantalla</span>
      {!recording?<BigBtn label="Iniciar grabación" icon="⏺" color="#DC2626" onTap={startRec}/>:<BigBtn label={`Detener ${Math.floor(recTimeRef.current/60)}:${(recTimeRef.current%60).toString().padStart(2,"0")}`} icon="⏹" color="#DC2626" active onTap={stopRec}/>}
    </div>
    <div style={{borderTop:`1px solid ${bdr}`,paddingTop:10}}>
      <Tog on={S.showOv} label="HUD en pantalla" onTap={()=>{S.showOv=!S.showOv;tk();}}/>
    </div>
    <div style={{marginTop:12,padding:"8px 10px",borderRadius:8,background:bgPanel,border:`1px solid ${bdr}`,fontSize:9,color:txS,lineHeight:1.8}}>
      <div style={{fontWeight:700,color:txP,marginBottom:4}}>Estado</div>
      <div>Pose: {S.dbg} · Personas: {S.poseCount} · FPS: {fps}</div>
      <div>Escena: {(S.arc||"").toUpperCase()}</div>
    </div>
  </div>);

  // ── Pestañas de escena ────────────────────────────────────────────────
  const SCENE_TABS=[
    {id:"deriva",  label:"DERIVA",   color:"#3B82F6"},
    {id:"kenopsia",label:"KENOPSIA", color:"#94A3B8"},
    {id:"apertura",label:"APERTURA", color:"#F59E0B"},
    {id:"config",  label:"CONFIG",   color:"#6B6B8A"},
  ];

  return(
    <div style={{minHeight:"100vh",background:bg,color:txP,fontFamily:"'SF Pro Display','Segoe UI',system-ui,sans-serif",fontSize:13}}>
      <video ref={wcRef} width="640" height="480" muted playsInline autoPlay style={{position:"fixed",top:-9999,left:-9999,opacity:0,pointerEvents:"none"}}/>

      {phase==="start"&&(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#060608"}}>
        <div style={{textAlign:"center"}}>
          <h1 style={{fontSize:52,fontWeight:800,margin:"0 0 8px",letterSpacing:"-0.02em"}}>
            <span style={{color:"#3B82F6"}}>K</span>orp<span style={{color:"#F59E0B"}}>S</span>ound
          </h1>
          <p style={{color:txS,marginBottom:6,fontSize:14}}>movimiento · composición · presencia</p>
          <p style={{color:"#2A2A4A",marginBottom:32,fontSize:11}}>v2.0 · espectáculo en vivo</p>
          <button onClick={()=>setPhase("loading")} style={{background:"#3B82F6",color:"#fff",border:"none",padding:"18px 56px",fontSize:16,fontWeight:700,cursor:"pointer",borderRadius:10,letterSpacing:"0.05em"}}>INICIAR</button>
        </div>
      </div>)}

      {phase==="loading"&&(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#060608"}}>
        <div style={{textAlign:"center"}}>
          <div style={{width:44,height:44,border:`3px solid #1A1A28`,borderTop:`3px solid #3B82F6`,borderRadius:"50%",margin:"0 auto 20px",animation:"spin 1s linear infinite"}}/>
          <div style={{fontSize:14,fontWeight:500,color:txS}}>{loadMsg}</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>)}

      {phase==="running"&&(<div style={{display:"flex",flexDirection:"column",height:"100vh"}}>
        {/* Barra superior */}
        <div style={{display:"flex",alignItems:"stretch",background:bgC,borderBottom:`1px solid ${bdr}`,height:48,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",padding:"0 16px",borderRight:`1px solid ${bdr}`,flexShrink:0}}>
            <span style={{fontWeight:800,fontSize:14,letterSpacing:"-0.01em"}}><span style={{color:"#3B82F6"}}>K</span>orp<span style={{color:"#F59E0B"}}>S</span>ound</span>
          </div>
          <div style={{display:"flex",flex:1}}>
            {SCENE_TABS.map(sc=>{const active=scene===sc.id;return(<button key={sc.id} onClick={()=>switchScene(sc.id)} style={{flex:1,border:"none",borderBottom:`2px solid ${active?sc.color:"transparent"}`,background:active?sc.color+"12":"transparent",color:active?sc.color:txS,cursor:"pointer",fontSize:11,fontWeight:active?700:500,letterSpacing:"0.08em"}}>
              {sc.label}
            </button>);})}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 12px",borderLeft:`1px solid ${bdr}`,flexShrink:0}}>
            <span style={{background:(ARC_PALETTES[scene]?.primary||ac)+"25",color:ARC_PALETTES[scene]?.primary||ac,padding:"2px 7px",borderRadius:5,fontSize:9,fontWeight:700}}>{S.poseCount}p</span>
            {S.curNote!=="—"&&<span style={{background:"#10B98125",color:"#10B981",padding:"2px 7px",borderRadius:5,fontSize:10,fontWeight:700}}>♫ {S.curNote}</span>}
            {recording&&<span style={{background:"#DC262620",color:"#DC2626",padding:"2px 7px",borderRadius:5,fontSize:9,fontWeight:700}}>● REC</span>}
            <span style={{color:txS,fontSize:10}}>{fps}fps</span>
          </div>
        </div>

        {/* Cuerpo */}
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          {/* Panel lateral */}
          <div style={{width:268,borderRight:`1px solid ${bdr}`,display:"flex",flexDirection:"column",flexShrink:0,background:bgC,overflowY:"auto"}}>
            {scene==="deriva"&&<SceneDeriva/>}
            {scene==="kenopsia"&&<SceneKenopsia/>}
            {scene==="apertura"&&<SceneApertura/>}
            {scene==="config"&&<SceneConfig/>}
          </div>
          {/* Canvas */}
          <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,background:"#000"}}>
            <div ref={cRef} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
              <canvas ref={outRef} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
              <button onClick={togFS} style={{position:"absolute",top:8,right:8,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.7)",padding:"5px 12px",borderRadius:6,cursor:"pointer",fontSize:11}}>{fs?"Salir":"⛶"}</button>
            </div>
            <div style={{display:"flex",gap:6,padding:"5px 10px",alignItems:"center",background:bgC,borderTop:`1px solid ${bdr}`,height:38}}>
              <div style={{width:60,height:28,background:"#0A0A0F",borderRadius:5,overflow:"hidden",position:"relative",flexShrink:0}}>
                <video ref={pvRef} muted playsInline autoPlay style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}}/>
                <div style={{position:"absolute",bottom:1,left:3,fontSize:7,color:"#3B82F6",fontWeight:700}}>CAM</div>
              </div>
              <div style={{flex:1,fontSize:9,color:txS}}>
                {scene==="apertura"&&S.apertura.tlFx?.label&&<span style={{color:"#F59E0B"}}>FX: {S.apertura.tlFx.label}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>)}

      {/* Vídeos ocultos Deriva */}
      {derivaVRefs.map((r,i)=>(<video key={`dv${i}`} ref={r} muted loop playsInline preload="auto" style={{position:"fixed",top:-9999,left:-9999,width:1,height:1,opacity:0,pointerEvents:"none"}}/>))}
      {/* Vídeos ocultos Apertura */}
      {aperturaVRefs.map((r,i)=>(<video key={`av${i}`} ref={r} muted loop playsInline preload="auto" style={{position:"fixed",top:-9999,left:-9999,width:1,height:1,opacity:0,pointerEvents:"none"}}/>))}
      <canvas ref={bcRef} style={{display:"none"}}/>
    </div>
  );
}
