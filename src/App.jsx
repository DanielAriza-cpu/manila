import { useState, useEffect, useRef } from "react";
import * as tf from "@tensorflow/tfjs";
import * as poseDetection from "@tensorflow-models/pose-detection";

const SCALES={"Pentatónica Menor":[0,3,5,7,10],"Menor Natural":[0,2,3,5,7,8,10],"Mayor":[0,2,4,5,7,9,11],"Blues":[0,3,5,6,7,10],"Japonesa":[0,1,5,7,8],"Dórica":[0,2,3,5,7,9,10],"Árabe":[0,1,4,5,7,8,11]};
const KN=["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const KS={};KN.forEach((k,i)=>KS[k]=i);
const m2f=m=>440*Math.pow(2,(m-69)/12);
const m2n=m=>m<0?"—":KN[m%12]+Math.floor(m/12-1);
const bldS=(k,iv,lo,hi)=>{const n=[];for(let o=lo;o<=hi;o++)for(const i of iv)n.push({midi:k+12*o+i,freq:m2f(k+12*o+i)});return n;};
const BLENDS=["source-over","screen","multiply","overlay","difference","lighten","darken"];
const CL=["#10B981","#F43F5E","#F59E0B","#3B82F6","#A855F7","#EC4899","#06B6D4","#EF4444"];
const BSEGS=[{j:[5,7,9],w:0.5},{j:[6,8,10],w:0.5},{j:[11,13,15],w:0.7},{j:[12,14,16],w:0.7},{j:[5,6],w:0.9},{j:[11,12],w:0.9},{j:[5,11],w:0.8},{j:[6,12],w:0.8}];
const NV=8;

// ── Arcos emocionales ─────────────────────────────────────────────────────
const ARC_PALETTES={
  deriva:{primary:"#3B82F6",secondary:"#6366F1",textColor:"#93C5FD",
    shadowColor:"#F43F5E",entityColor:"#3B82F6",
    scale:"Menor Natural",key:"A",bpm:90,label:"DERIVA"},
  kenopsia:{primary:"#94A3B8",secondary:"#CBD5E1",textColor:"#E2E8F0",
    shadowColor:"#CBD5E1",entityColor:"#94A3B8",
    scale:"Japonesa",key:"D",bpm:60,label:"KENOPSIA"},
  apertura:{primary:"#F59E0B",secondary:"#10B981",textColor:"#FDE68A",
    shadowColor:"#F59E0B",entityColor:"#10B981",
    scale:"Pentatónica Menor",key:"C",bpm:130,label:"APERTURA"},
};

// ── Frases poéticas de "Viajar" ───────────────────────────────────────────
const VIAJAR_PHRASES=[
  {text:"viajar",arc:"deriva",anchor:null,w:1},
  {text:"huir",arc:"deriva",anchor:null,w:1},
  {text:"irse",arc:"deriva",anchor:null,w:1},
  {text:"desplazarse",arc:"deriva",anchor:null,w:1.2},
  {text:"huir de sí mismo",arc:"deriva",anchor:null,w:1.2},
  {text:"dolor",arc:"deriva",anchor:null,w:1.3},
  {text:"engaño",arc:"deriva",anchor:null,w:1},
  {text:"paz",arc:"deriva",anchor:null,w:1},
  {text:"kenopsia",arc:"kenopsia",anchor:null,w:2},
  {text:"esos pasillos están\nvacíos en mi mente",arc:"kenopsia",anchor:"rExt",w:2},
  {text:"soy un generador\nde kenopsia",arc:"kenopsia",anchor:null,w:1.8},
  {text:"no sé quién los\nocupa ahora",arc:"kenopsia",anchor:null,w:1.5},
  {text:"¿alguien lo hace?",arc:"kenopsia",anchor:null,w:1.5},
  {text:"lo último que olvidan\nson los primeros recuerdos",arc:"kenopsia",anchor:"bUp",w:1.8},
  {text:"los recuerdos que\nmás me llenan de paz",arc:"kenopsia",anchor:null,w:1.5},
  {text:"mi cuerpo es cada\nvez más libre aquí",arc:"apertura",anchor:"lExt",w:2.2},
  {text:"nuevos inicios",arc:"apertura",anchor:null,w:1.5},
  {text:"armonía",arc:"apertura",anchor:null,w:1.3},
  {text:"amor",arc:"apertura",anchor:null,w:1.5},
  {text:"calor humano",arc:"apertura",anchor:null,w:1.5},
  {text:"¿nos comprendemos?",arc:"apertura",anchor:null,w:1.8},
];

// ── Partícula de texto ────────────────────────────────────────────────────
class TextParticle{
  constructor(text,x,y,color,arc){
    this.text=text;this.lines=text.split("\n");
    this.x=x;this.y=y;this.color=color;this.arc=arc;
    this.vx=(Math.random()-0.5)*0.25;this.vy=-0.08-Math.random()*0.06;
    this.alpha=0;this.life=0;
    this.maxLife=200+Math.random()*100;
    this.size=text.length>18?20:text.length>10?28:40;
    this.scattered=false;
    this.letterAlphas=text.replace(/\n/g,"").split("").map(()=>1);
  }
  update(motion){
    this.life++;
    if(this.life<25)this.alpha=this.life/25;
    else if(this.life>this.maxLife-40)this.alpha=Math.max(0,(this.maxLife-this.life)/40);
    else this.alpha=1;
    if(motion>0.35&&!this.scattered){this.scattered=true;this.letterAlphas=this.letterAlphas.map(()=>Math.random());}
    else if(motion<0.12){this.scattered=false;this.letterAlphas=this.letterAlphas.map(a=>Math.min(1,a+0.04));}
    this.x+=this.vx;this.y+=this.vy;
  }
  isDead(){return this.life>=this.maxLife;}
  draw(ctx){
    if(this.alpha<=0)return;
    ctx.save();
    ctx.font=`200 ${this.size}px 'Segoe UI',system-ui,sans-serif`;
    ctx.textAlign="center";
    if(!this.scattered){
      ctx.globalAlpha=this.alpha;ctx.fillStyle=this.color;
      this.lines.forEach((ln,i)=>ctx.fillText(ln.toUpperCase(),this.x,this.y+i*this.size*1.2));
      if(this.arc==="kenopsia"){ctx.globalAlpha=this.alpha*0.12;ctx.fillText(this.lines[0].toUpperCase(),this.x+3,this.y+2);}
    }else{
      // Letras dispersas individualmente
      const allLetters=this.text.replace(/\n/g," ").split("");
      let lx=this.x-allLetters.length*this.size*0.28;
      allLetters.forEach((ch,i)=>{
        const la=this.letterAlphas[i]||0;
        ctx.globalAlpha=this.alpha*la;ctx.fillStyle=this.color;
        const scatter=(la-0.5)*18;
        ctx.fillText(ch.toUpperCase(),lx+scatter*(i%2===0?1:-1),this.y+scatter*0.4);
        lx+=this.size*0.58;
      });
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
  relAll(){if(!this.on)return;Object.keys(this.v).forEach(n=>this.rel(n,0.2));}
  chS(s){this.sn=s;this.build();}chK(k){this.key=KS[k];this.build();}
  setV(v){if(this.m)this.m.gain.setTargetAtTime(v,this.c.currentTime,0.05);}
  setDl(v){if(this.dlG)this.dlG.gain.setTargetAtTime(v,this.c.currentTime,0.05);}
  setRv(v){if(this.rvG)this.rvG.gain.setTargetAtTime(v,this.c.currentTime,0.05);}
}

class Gest{
  constructor(){this.sm=null;this.spd={l:0,r:0};this.pw=null;this.stH=0;this.sqR=0;this.sqC=false;}
  d(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}
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
    // Cruce en el pecho: muñecas cruzadas entre hombros y caderas, a altura del pecho
    const chestY=(sl.y+hl.y)/2;
    const crossChest=this.d(wl,wr)<sW*0.6&&Math.abs((wl.y+wr.y)/2-chestY)<0.12&&wl.y>sl.y&&wr.y>sr.y&&!bUp;
    // Cruce sobre la cabeza: muñecas cruzadas por encima de los hombros
    const crossAbove=this.d(wl,wr)<sW*0.7&&wl.y<sl.y-0.05&&wr.y<sr.y-0.05&&this.d(wl,wr)<sW*0.5;
    const sq=Math.max(0,Math.min(1,((hl.y+hr.y)/2-this.sqR)/0.1));
    if(cross)this.stH=Math.min(40,this.stH+1);else this.stH=Math.max(0,this.stH-2);
    return{rP,lP,spd:this.spd,hD,bUp,lExt,rExt,cross,crossChest,crossAbove,sq,stopA:this.stH>=25,stopH:this.stH,lAct:this.spd.l>0.3,rAct:this.spd.r>0.2,rPlk:this.spd.r>2,rUp:wr.y<sr.y-0.1,vA:lExt,vB:rExt,vC:bUp,vD:sq>0.15,lm:m,mt:Math.min(1,(this.spd.l+this.spd.r)/6)};
  }
}

class Drone{
  constructor(){this.c=null;this.masterG=null;this.filterLo=null;this.rvG=null;this.lfo=null;this.oscs=[];this.on=false;this.arc=null;}
  async init(audioCtx){
    if(this.on)return;this.c=audioCtx;
    this.masterG=this.c.createGain();this.masterG.gain.value=0;
    this.filterLo=this.c.createBiquadFilter();this.filterLo.type="lowpass";this.filterLo.frequency.value=700;
    const rvBuf=this.c.createBuffer(2,this.c.sampleRate*3,this.c.sampleRate);
    for(let ch=0;ch<2;ch++){const d=rvBuf.getChannelData(ch);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.8);}
    const rv=this.c.createConvolver();rv.buffer=rvBuf;
    this.rvG=this.c.createGain();this.rvG.gain.value=0.5;
    this.lfo=this.c.createOscillator();this.lfo.frequency.value=0.1;this.lfo.start();
    this.filterLo.connect(this.masterG);this.masterG.connect(this.c.destination);
    this.masterG.connect(rv);rv.connect(this.rvG);this.rvG.connect(this.c.destination);
    this.on=true;
  }
  setArc(arcName){
    if(!this.on)return;const t=this.c.currentTime;
    this.oscs.forEach(o=>{try{o.g.gain.setTargetAtTime(0,t,0.8);setTimeout(()=>{try{o.o.stop();}catch(e){}},2000);}catch(e){}});
    this.oscs=[];this.arc=arcName;
    const cfgs={
      deriva:[{f:146.83,g:0.16,type:"sine",dt:-2},{f:146.83,g:0.10,type:"sine",dt:4},{f:220,g:0.09,type:"triangle",dt:0},{f:293.66,g:0.06,type:"sine",dt:-1},{f:73.42,g:0.12,type:"sine",dt:0}],
      kenopsia:[{f:146.83,g:0.18,type:"sine",dt:0},{f:146.83,g:0.07,type:"sine",dt:6},{f:195.99,g:0.05,type:"sine",dt:-4},{f:293.66,g:0.04,type:"sine",dt:2}],
      apertura:[{f:130.81,g:0.14,type:"triangle",dt:0},{f:196,g:0.11,type:"sine",dt:0},{f:261.63,g:0.09,type:"sine",dt:0},{f:392,g:0.05,type:"triangle",dt:3}],
    };
    (cfgs[arcName]||cfgs.deriva).forEach(({f,g,type,dt})=>{
      const o=this.c.createOscillator();o.type=type;o.frequency.value=f;o.detune.value=dt;
      const gn=this.c.createGain();gn.gain.value=0;
      const lfoG=this.c.createGain();lfoG.gain.value=f*0.004*(arcName==="kenopsia"?0.3:1);
      this.lfo.connect(lfoG);lfoG.connect(o.frequency);
      o.connect(gn);gn.connect(this.filterLo);o.start(t+0.05);
      gn.gain.setTargetAtTime(g,t+0.3,2);
      this.oscs.push({o,g:gn});
    });
    const fc={deriva:700,kenopsia:380,apertura:1100};
    const rvV={deriva:0.5,kenopsia:0.75,apertura:0.3};
    this.filterLo.frequency.setTargetAtTime(fc[arcName]||700,t,2);
    this.rvG.gain.setTargetAtTime(rvV[arcName]||0.5,t,2);
    this.masterG.gain.setTargetAtTime(0.65,t+0.3,2);
  }
  modulate(g){
    if(!this.on||!g)return;const t=this.c.currentTime;
    if(g.rP!==undefined)this.filterLo.frequency.setTargetAtTime(200+g.rP*1600,t,0.25);
    if(g.sq!==undefined)this.rvG.gain.setTargetAtTime(0.2+g.sq*0.6,t,0.3);
    this.masterG.gain.setTargetAtTime(g.bUp?0.9:0.65,t,0.4);
    if(g.mt!==undefined)this.lfo.frequency.setTargetAtTime(0.08+g.mt*0.5,t,0.3);
  }
  stop(){if(!this.on)return;this.masterG.gain.setTargetAtTime(0,this.c.currentTime,1.5);}
  resume(){if(!this.on||!this.arc)return;this.masterG.gain.setTargetAtTime(0.65,this.c.currentTime,1);}
}

class Shadow{
  constructor(){this.buf=[];this.max=100;this.mir=true;this.rnd=0.3;this.df=0.5;}
  push(lm){if(!lm)return;this.buf.push(lm.map(p=>p?{...p}:null));if(this.buf.length>this.max)this.buf.shift();}
}

function drawFluid(ctx,lm,W,H,color,alpha,t,motion){
  if(!lm)return;
  ctx.save();
  const px=i=>lm[i]?(1-lm[i].x)*W:0,py=i=>lm[i]?lm[i].y*H:0;
  const h=color.replace('#','');
  const cr=parseInt(h.substring(0,2),16),cg=parseInt(h.substring(2,4),16),cb=parseInt(h.substring(4,6),16);
  const rgba=a=>`rgba(${cr},${cg},${cb},${Math.min(1,Math.max(0,a))})`;
  const nodes=[];
  for(let i=0;i<17;i++){if(!lm[i])continue;const r=i===0?16:i<=4?7:[5,6].includes(i)?13:[9,10].includes(i)?15:[11,12].includes(i)?12:8;nodes.push({i,x:px(i),y:py(i),r});}
  if(!nodes.length){ctx.restore();return;}
  const cx=nodes.reduce((s,n)=>s+n.x,0)/nodes.length,cy=nodes.reduce((s,n)=>s+n.y,0)/nodes.length;
  // Aura
  const spread=Math.max(60,...nodes.map(n=>Math.sqrt((n.x-cx)**2+(n.y-cy)**2)))+motion*40;
  const ag=ctx.createRadialGradient(cx,cy,10,cx,cy,spread);
  ag.addColorStop(0,rgba(0.04+motion*0.04));ag.addColorStop(0.7,rgba(0.015));ag.addColorStop(1,rgba(0));
  ctx.globalAlpha=alpha;ctx.fillStyle=ag;ctx.beginPath();ctx.arc(cx,cy,spread,0,Math.PI*2);ctx.fill();
  // Membranas
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
    ctx.closePath();
    ctx.fillStyle=rgba(0.12+motion*0.08);ctx.fill();
    ctx.strokeStyle=rgba(0.28+motion*0.15);ctx.lineWidth=0.6;ctx.stroke();
  });
  // Nodos
  nodes.forEach((n,idx)=>{
    const pulse=Math.sin(t*2+idx*0.7)*0.2+0.8,r=n.r*(pulse+motion*0.25);
    const glow=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r*2.5);
    glow.addColorStop(0,rgba(0.6));glow.addColorStop(0.4,rgba(0.18));glow.addColorStop(1,rgba(0));
    ctx.globalAlpha=alpha;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(n.x,n.y,r*2.5,0,Math.PI*2);ctx.fill();
    const core=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r);
    core.addColorStop(0,rgba(0.88));core.addColorStop(0.5,rgba(0.35));core.addColorStop(1,rgba(0));
    ctx.fillStyle=core;ctx.beginPath();ctx.arc(n.x,n.y,r,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}

function drawGhost(ctx,sh,W,H,color,alpha,t){
  if(!sh||sh.buf.length<4)return;
  ctx.save();
  const h=color.replace('#','');
  const cr=parseInt(h.substring(0,2),16),cg=parseInt(h.substring(2,4),16),cb=parseInt(h.substring(4,6),16);
  const rgba=a=>`rgba(${cr},${cg},${cb},${Math.min(1,Math.max(0,a))})`;
  const di=Math.floor(sh.buf.length*Math.max(0,Math.min(0.9,sh.df)));
  const lm=sh.buf[Math.max(0,sh.buf.length-1-di)];if(!lm)return;
  const px=(f,i)=>f[i]?((sh.mir?(1-f[i].x):f[i].x+0.3)+Math.sin(t*0.5+f[i].y*5)*sh.rnd*0.02)*W:0;
  const py=(f,i)=>f[i]?(f[i].y+Math.cos(t*0.6+f[i].x*5)*sh.rnd*0.015)*H:0;
  BSEGS.forEach(seg=>{
    const pts=seg.j.filter(i=>lm[i]);if(pts.length<2)return;
    for(let j=0;j<pts.length-1;j++){
      const a=pts[j],b=pts[j+1];if(!lm[a]||!lm[b])return;
      const ax=px(lm,a),ay=py(lm,a),bx=px(lm,b),by=py(lm,b);
      ctx.globalAlpha=alpha*0.45;ctx.beginPath();ctx.moveTo(ax,ay);
      ctx.quadraticCurveTo((ax+bx)/2+Math.sin(t*2+j)*4,(ay+by)/2+Math.cos(t+j)*3,bx,by);
      ctx.strokeStyle=rgba(0.5);ctx.lineWidth=seg.w*7+1;ctx.lineCap="round";ctx.stroke();
    }
  });
  [0,9,10].forEach((i,k)=>{if(!lm[i])return;const x=px(lm,i),y=py(lm,i),r=(i===0?18:13)*(Math.sin(t*2+k)*0.15+0.85);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(0.35));g.addColorStop(0.5,rgba(0.1));g.addColorStop(1,rgba(0));
    ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();});
  ctx.restore();
}

// ── Icosaedro ─────────────────────────────────────────────────────────────
const PHI=(1+Math.sqrt(5))/2;
const ICO_V=(()=>{const v=[];[[-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],[0,-1,PHI],[0,1,PHI],[0,-1,-PHI],[0,1,-PHI],[PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]].forEach(([x,y,z])=>{const l=Math.sqrt(x*x+y*y+z*z);v.push([x/l,y/l,z/l]);});return v;})();
const ICO_F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];

function drawIcosahedron(ctx,lm,W,H,palette,t,motion){
  if(!lm)return;
  const pts=[];for(let i=0;i<17;i++)if(lm[i])pts.push({x:(1-lm[i].x)*W,y:lm[i].y*H});
  if(!pts.length)return;
  const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length;
  const cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  const maxR=Math.max(60,...pts.map(p=>Math.sqrt((p.x-cx)**2+(p.y-cy)**2)));
  const baseR=maxR*1.5+40;
  const rx=t*0.1+motion*0.2,ry=t*0.07;
  const project=([x,y,z])=>{
    const y1=y*Math.cos(rx)-z*Math.sin(rx),z1=y*Math.sin(rx)+z*Math.cos(rx);
    const x2=x*Math.cos(ry)+z1*Math.sin(ry),z2=-x*Math.sin(ry)+z1*Math.cos(ry);
    const fov=3/(3+z2*0.3);
    return{px:cx+x2*baseR*fov,py:cy+y1*baseR*fov*0.6,z:z2};
  };
  const projected=ICO_V.map(v=>{
    const p=project(v);
    let dx=0,dy=0;
    pts.forEach(pt=>{const d=Math.sqrt((p.px-pt.x)**2+(p.py-pt.y)**2);if(d<90){const f=(90-d)/90;dx+=(p.px-pt.x)*f*0.5;dy+=(p.py-pt.y)*f*0.5;}});
    return{px:p.px+dx,py:p.py+dy,z:p.z};
  });
  // Color propio del icosaedro: dorado/blanco independiente del arco
  ctx.save();
  const edges=new Set();
  ICO_F.forEach(([a,b,c])=>[[a,b],[b,c],[a,c]].forEach(([i,j])=>{
    const key=Math.min(i,j)+"-"+Math.max(i,j);
    if(edges.has(key))return;edges.add(key);
    const va=projected[i],vb=projected[j];
    const zAvg=(va.z+vb.z)/2;
    const op=Math.max(0.08,0.4+zAvg*0.25);
    // Aristas: color dorado
    ctx.strokeStyle=`rgba(255,220,100,${op})`;
    ctx.lineWidth=0.8+Math.max(0,zAvg)*0.8+motion*0.5;
    ctx.beginPath();ctx.moveTo(va.px,va.py);ctx.lineTo(vb.px,vb.py);ctx.stroke();
  }));
  // Vértices como puntos dorados brillantes
  projected.forEach(v=>{
    const op=Math.max(0.1,0.5+v.z*0.3);
    const r=2+Math.max(0,v.z)*2;
    const g=ctx.createRadialGradient(v.px,v.py,0,v.px,v.py,r*2);
    g.addColorStop(0,`rgba(255,240,150,${op})`);
    g.addColorStop(1,`rgba(255,200,50,0)`);
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(v.px,v.py,r*2,0,Math.PI*2);ctx.fill();
  });
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
  // En lugar de puntos separados, tiñe el espacio alrededor de cada zona
  // con una mancha muy suave y grande — invisible como punto, perceptible como atmósfera
  ctx.save();ctx.globalCompositeOperation="screen";
  BODY_ZONES.forEach(z=>{
    const p=lm[z.j];if(!p)return;
    const x=(1-p.x)*W,y=p.y*H;
    // Radio muy grande para que sea niebla, no punto
    const r=160+motion*80+Math.sin(t*0.8+z.j)*20;
    const g=ctx.createRadialGradient(x,y,r*0.3,x,y,r);
    g.addColorStop(0,z.color+"18");
    g.addColorStop(0.5,z.color+"08");
    g.addColorStop(1,"transparent");
    ctx.globalAlpha=0.5+motion*0.15;
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();
}

function drawAfterimages(ctx,ais,t){
  if(!ais.length)return;
  ctx.save();ctx.globalCompositeOperation="screen";
  for(let i=ais.length-1;i>=0;i--){
    const ai=ais[i];
    ai.alpha=Math.max(0,ai.alpha-0.007);ai.r+=0.5;ai.age++;
    if(ai.alpha<=0){ais.splice(i,1);continue;}
    const hr=ai.color.replace('#','');
    const cr=parseInt(hr.substring(0,2),16),cg=parseInt(hr.substring(2,4),16),cb=parseInt(hr.substring(4,6),16);
    const g=ctx.createRadialGradient(ai.x,ai.y,0,ai.x,ai.y,ai.r);
    g.addColorStop(0,`rgba(${cr},${cg},${cb},${ai.alpha*0.7})`);
    g.addColorStop(0.5,`rgba(${cr},${cg},${cb},${ai.alpha*0.2})`);
    g.addColorStop(1,"transparent");
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(ai.x,ai.y,ai.r,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

// ── Mundo paralelo (2ª proyección) ───────────────────────────────────────
function drawGhostWorld(ghostCtx,W,H,sh,arc,t,particles,palette,bgVid,worldOp){
  const op=worldOp??0.85;
  ghostCtx.clearRect(0,0,W,H);
  if(bgVid&&bgVid.readyState>=1){
    ghostCtx.save();ghostCtx.globalAlpha=op*0.65;
    ghostCtx.filter="blur(6px) saturate(0.3) brightness(0.3)";
    ghostCtx.drawImage(bgVid,0,0,W,H);ghostCtx.filter="none";ghostCtx.restore();
    ghostCtx.save();ghostCtx.globalAlpha=op*0.3;ghostCtx.fillStyle=palette.primary;
    ghostCtx.globalCompositeOperation="screen";ghostCtx.fillRect(0,0,W,H);ghostCtx.restore();
  }else{
    const now=Date.now()*0.0003;
    ghostCtx.fillStyle="#000";ghostCtx.fillRect(0,0,W,H);
    const grd=ghostCtx.createRadialGradient(W*0.5+Math.sin(now)*100,H*0.4+Math.cos(now*0.7)*70,0,W*0.5,H*0.5,W*0.65);
    grd.addColorStop(0,palette.primary+"20");grd.addColorStop(0.6,palette.secondary+"08");grd.addColorStop(1,"transparent");
    ghostCtx.globalAlpha=op;ghostCtx.fillStyle=grd;ghostCtx.fillRect(0,0,W,H);ghostCtx.globalAlpha=1;
    for(let i=0;i<4;i++){
      const y=H*(0.2+i*0.18)+Math.sin(now*0.5+i)*25;
      const lg=ghostCtx.createLinearGradient(0,y,W,y);
      lg.addColorStop(0,"transparent");lg.addColorStop(0.4,palette.primary+"18");lg.addColorStop(0.6,palette.primary+"18");lg.addColorStop(1,"transparent");
      ghostCtx.fillStyle=lg;ghostCtx.fillRect(0,y-1,W,2);
    }
  }
  // Sombra poética
  if(sh&&sh.buf.length>3)drawGhost(ghostCtx,sh,W,H,palette.shadowColor,op*0.65,t);
  // Solo frases kenopsia
  ghostCtx.save();ghostCtx.globalCompositeOperation="screen";
  particles.filter(p=>p.arc==="kenopsia").forEach(p=>p.draw(ghostCtx));
  ghostCtx.restore();
  // Viñeta
  const vig=ghostCtx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.75);
  vig.addColorStop(0,"transparent");vig.addColorStop(1,"rgba(0,0,0,0.55)");
  ghostCtx.fillStyle=vig;ghostCtx.fillRect(0,0,W,H);
}

export default function App(){
  const[phase,setPhase]=useState("start");const[loadMsg,setLoadMsg]=useState("");const[fps,setFps]=useState(0);
  const[panel,setPanel]=useState("music");const[fs,setFs]=useState(false);const[ut,setUt]=useState(0);
  const[recording,setRecording]=useState(false);const[recTime,setRecTime]=useState(0);
  const[cameras,setCameras]=useState([]);const[camId,setCamId]=useState("");

  const S=useRef({
    layers:Array.from({length:NV},()=>({ld:false,nm:"",op:1,bl:"screen",vis:true})),
    body:{vis:true,op:0.8,bl:"screen"},
    synOn:true,synVol:0.7,synDl:0.25,synRv:0.2,synKey:"C",synScale:"Pentatónica Menor",
    g:null,vAct:Array(NV).fill(false),vOp:Array(NV).fill(0),vManual:{},
    stopped:false,audioSilenced:false,curNote:"—",dbg:"init",poseCount:0,
    dancer2On:false,dancer2Color:"#F59E0B",dancer2:null,
    shadowOn:true,shadowDelay:0.5,shadowMirror:true,shadowColor:"#F43F5E",shadowRandom:0.3,shadowOpacity:0.6,
    entityColor:"#10B981",entityOpacity:0.85,ghost:0,showOv:true,
    arc:"deriva",droneOn:true,
    poetryOn:true,anchorCD:0,lastPhrase:"",phraseTimer:0,
    icoOn:true,zonesOn:true,
    ghostProjectionOn:false,ghostBgVideoIdx:-1,ghostWorldOp:0.85,
  }).current;

  const wcRef=useRef(null);const pvRef=useRef(null);const outRef=useRef(null);const bcRef=useRef(null);
  const vRefs=Array.from({length:NV},()=>useRef(null));
  const cRef=useRef(null);const detRef=useRef(null);const streamRef=useRef(null);
  const gRef=useRef(new Gest());const syRef=useRef(new Synth());const shRef=useRef(new Shadow());const droneRef=useRef(new Drone());
  const plkTRef=useRef(0);const animRef=useRef(null);const fpsR=useRef({c:0,t:performance.now()});
  const recRef=useRef(null);const recChunks=useRef([]);const recTimer=useRef(null);
  const ghostCRef=useRef(null);
  const particlesRef=useRef([]);
  const afterimagesRef=useRef([]);
  const prevZoneRef=useRef({});
  const ghostCanvasRef=useRef(null);
  const ghostWinRef=useRef(null);
  const tk=()=>setUt(u=>u+1);

  const applyArc=(arcId,syn)=>{
    const p=ARC_PALETTES[arcId];if(!p)return;
    S.arc=arcId;S.entityColor=p.entityColor;S.shadowColor=p.shadowColor;
    syn.chS(p.scale);syn.chK(p.key);syn.arpBPM=p.bpm;
    S.synKey=p.key;S.synScale=p.scale;
    droneRef.current.setArc(arcId);
    particlesRef.current=[];S.phraseTimer=0;S.lastPhrase="";
  };

  const spawnPhrase=(text,arc,g,W,H)=>{
    const color=ARC_PALETTES[arc].textColor;
    let x,y;
    if(g?.lm){
      const joints=[0,5,6,9,10,11,12].filter(i=>g.lm[i]);
      if(joints.length){const ji=joints[Math.floor(Math.random()*joints.length)];x=(1-g.lm[ji].x)*W+(Math.random()-0.5)*160;y=g.lm[ji].y*H+(Math.random()-0.5)*100;}
      else{x=W*(0.2+Math.random()*0.6);y=H*(0.2+Math.random()*0.6);}
    }else{x=W*(0.2+Math.random()*0.6);y=H*(0.2+Math.random()*0.6);}
    x=Math.max(100,Math.min(W-100,x));y=Math.max(60,Math.min(H-60,y));
    particlesRef.current.push(new TextParticle(text,x,y,color,arc));
    if(particlesRef.current.length>12)particlesRef.current.shift();
  };

  const openGhostWin=()=>{
    const win=window.open("","ghostWin","width=960,height=540,menubar=no,toolbar=no,location=no");
    if(!win)return;
    win.document.body.style.cssText="margin:0;background:#000;overflow:hidden;";
    const canvas=win.document.createElement("canvas");canvas.width=960;canvas.height=540;
    canvas.style.cssText="width:100%;height:100%;display:block;";
    win.document.body.appendChild(canvas);
    ghostCanvasRef.current=canvas;ghostWinRef.current=win;S.ghostProjectionOn=true;tk();
  };
  const closeGhostWin=()=>{
    try{ghostWinRef.current?.close();}catch(e){}
    ghostCanvasRef.current=null;ghostWinRef.current=null;S.ghostProjectionOn=false;tk();
  };

  const listCams=async()=>{try{const d=await navigator.mediaDevices.enumerateDevices();setCameras(d.filter(x=>x.kind==="videoinput"));}catch(e){}};
  const switchCam=async(id)=>{try{if(streamRef.current)streamRef.current.getTracks().forEach(t=>t.stop());const c={video:{width:{ideal:640},height:{ideal:480}}};if(id)c.video.deviceId={exact:id};else c.video.facingMode="user";const s=await navigator.mediaDevices.getUserMedia(c);streamRef.current=s;if(wcRef.current){wcRef.current.srcObject=s;wcRef.current.muted=true;wcRef.current.play().catch(()=>{});}if(pvRef.current){pvRef.current.srcObject=s;pvRef.current.muted=true;pvRef.current.play().catch(()=>{});}setCamId(id||"");await listCams();}catch(e){}};
  const startRec=()=>{const c=outRef.current;if(!c)return;const st=c.captureStream(30);const mr=new MediaRecorder(st,{mimeType:"video/webm",videoBitsPerSecond:4e6});recChunks.current=[];mr.ondataavailable=e=>{if(e.data.size>0)recChunks.current.push(e.data);};mr.onstop=()=>{const b=new Blob(recChunks.current,{type:"video/webm"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`korpsound-${Date.now()}.webm`;a.click();};mr.start(100);recRef.current=mr;setRecording(true);setRecTime(0);recTimer.current=setInterval(()=>setRecTime(t=>t+1),1000);};
  const stopRec=()=>{if(recRef.current?.state==="recording")recRef.current.stop();recRef.current=null;setRecording(false);clearInterval(recTimer.current);};
  const loadVid=(file,i)=>{const r=vRefs[i];if(r?.current){r.current.src=URL.createObjectURL(file);r.current.loop=true;r.current.muted=true;r.current.pause();S.layers[i].ld=true;S.layers[i].nm=file.name;tk();}};

  useEffect(()=>{if(phase!=="loading")return;let dead=false;
    (async()=>{try{
      setLoadMsg("Solicitando cámara...");
      const s=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:"user"}});
      if(dead){s.getTracks().forEach(t=>t.stop());return;}streamRef.current=s;
      if(wcRef.current){wcRef.current.srcObject=s;wcRef.current.muted=true;wcRef.current.setAttribute("playsinline","true");await new Promise(r=>{wcRef.current.onloadeddata=r;wcRef.current.play().catch(()=>{});});}
      await listCams();
      setLoadMsg("Cargando TensorFlow...");
      await tf.setBackend("webgl");await tf.ready();if(dead)return;
      setLoadMsg("Descargando modelo IA...");
      detRef.current=await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet,{modelType:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING});
      if(dead)return;
      setLoadMsg("Calentando modelo...");
      try{const tmp=document.createElement("canvas");tmp.width=192;tmp.height=192;await detRef.current.estimatePoses(tmp);await detRef.current.estimatePoses(tmp);}catch(e){}
      await syRef.current.init();
      await droneRef.current.init(syRef.current.c);
      droneRef.current.setArc("deriva");
      setPhase("running");
    }catch(e){setLoadMsg("Error: "+e.message);}})();
    return()=>{dead=true;};
  },[phase]);

  useEffect(()=>{if(phase==="running"&&pvRef.current&&streamRef.current&&!pvRef.current.srcObject){pvRef.current.srcObject=streamRef.current;pvRef.current.muted=true;pvRef.current.play().catch(()=>{});}});

  useEffect(()=>{if(phase!=="running")return;let go=true,uiC=0,lastPT=0,detecting=false;
    const W=960,H=540;
    const poseCanvas=document.createElement("canvas");poseCanvas.width=192;poseCanvas.height=192;
    const poseCtx=poseCanvas.getContext("2d");
    if(!ghostCRef.current){ghostCRef.current=document.createElement("canvas");ghostCRef.current.width=W;ghostCRef.current.height=H;}
    const ghostCtx=ghostCRef.current.getContext("2d");
    ghostCtx.fillStyle="#000";ghostCtx.fillRect(0,0,W,H);

    const render=()=>{
      if(!go)return;
      animRef.current=requestAnimationFrame(render);
      const canvas=outRef.current;if(!canvas)return;
      if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
      const ctx=canvas.getContext("2d");
      const wc=wcRef.current,pv=pvRef.current,t=Date.now()*0.001;
      if(wc&&streamRef.current&&!wc.srcObject){wc.srcObject=streamRef.current;wc.muted=true;wc.play().catch(()=>{});}
      if(pv&&streamRef.current&&!pv.srcObject){pv.srcObject=streamRef.current;pv.muted=true;pv.play().catch(()=>{});}
      const vid=(wc&&wc.readyState>=2)?wc:(pv&&pv.readyState>=2)?pv:null;

      if(detRef.current&&vid&&!detecting){
        // Cambiar modelo si se activó/desactivó segundo bailarín
        if(S.dancer2On!==S._lastDancer2Mode){
          S._lastDancer2Mode=S.dancer2On;
          const modelType=S.dancer2On?poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING;
          poseDetection.createDetector(poseDetection.SupportedModels.MoveNet,{modelType}).then(d=>{detRef.current=d;}).catch(()=>{});
        }
        const now=performance.now();
        if(now-lastPT>60){
          lastPT=now;detecting=true;
          poseCtx.drawImage(vid,0,0,192,192);
          detRef.current.estimatePoses(poseCanvas).then(poses=>{
            if(!go){detecting=false;return;}
            S.poseCount=poses?.length||0;
            if(poses?.[0]?.keypoints){const g=gRef.current.run(poses[0].keypoints,192,192);S.g=g;S.dbg=g?"ok":"low";if(g&&S.shadowOn)shRef.current.push(g.lm);}
            else S.dbg="no_body";
            if(S.dancer2On&&poses?.[1]?.keypoints){
              const d2=[];for(let i=0;i<17;i++){const kp=poses[1].keypoints[i];d2[i]=(kp&&kp.score>0.2)?{x:kp.x/192,y:kp.y/192}:null;}
              S.dancer2=d2;
            }else S.dancer2=null;
            detecting=false;
          }).catch(()=>{S.dbg="err";detecting=false;});
        }
      }else if(!vid)S.dbg="no_video";

      const g=S.g;const syn=syRef.current;const drone=droneRef.current;
      if(g&&!g.stopA)drone.modulate(g);
      // Solo activa synth si hay movimiento real (mt > 0.08) — evita notas fantasma en quietud
      const hasMotion=(g?.mt||0)>0.08;
      if(g&&!g.stopA&&S.synOn&&!S.audioSilenced&&hasMotion){
        if(g.bUp){const n=syn.noteAt(g.rP,3,4);syn.play("chord",n,Math.min(1,g.hD*0.8),0.3);S.curNote=n?m2n(n.midi):"—";}else syn.rel("chord",0.8);
        if(g.sq>0.2)syn.play("sub",syn.noteAt(0.1,1,2),g.sq,0.5);else syn.rel("sub",1);
        if(g.rAct&&!g.bUp){const n=syn.noteAt(g.rP);if(g.rPlk&&performance.now()-plkTRef.current>100){syn.plk("pluck",n,Math.min(1,g.spd.r/3));plkTRef.current=performance.now();}else syn.play("melody",n,0.3+g.spd.r*0.2,0.08);S.curNote=n?m2n(n.midi):"—";if(g.hD>1.2)syn.arpTk(0.5);}
        else if(!g.bUp){syn.rel("melody",0.3);}
        if(g.lExt)syn.play("bass",syn.noteAt(g.lP,2,3),0.5,0.1);else syn.rel("bass",0.4);
      }
      // Si no hay movimiento, libera todas las voces suavemente
      if(g&&!g.stopA&&!hasMotion){syn.rel("melody",0.5);syn.rel("lead",0.5);syn.rel("bass",0.5);syn.rel("chord",0.8);syn.rel("sub",0.8);S.curNote="—";}
      if(g?.stopA&&!S.stopped){S.stopped=true;syn.relAll();drone.stop();}
      if(!g?.stopA&&S.stopped){S.stopped=false;drone.resume();}

      if(g&&!g.stopA){
        // Cruce en el pecho → pausa todos los vídeos
        if(g.crossChest){
          vRefs.forEach((r,i)=>{const v=r?.current;if(v&&!v.paused)v.pause();S.vOp[i]=Math.max(0,S.vOp[i]-0.05);if(S.vOp[i]<0.01)S.vAct[i]=false;});
        } else {
          [g.vA,g.vB,g.vC,g.vD].forEach((a,i)=>{
            const v=vRefs[i]?.current;if(!S.layers[i]?.ld||!v)return;
            if(a){S.vAct[i]=true;S.vOp[i]=Math.min(1,S.vOp[i]+0.06);if(v.paused)v.play().catch(()=>{});}
            else{S.vOp[i]=Math.max(0,S.vOp[i]-0.03);if(S.vOp[i]<0.01){S.vAct[i]=false;if(!v.paused)v.pause();}}
          });
        }
        // Cruce sobre la cabeza → silencio total (synth + drone)
        if(g.crossAbove&&!S.audioSilenced){
          S.audioSilenced=true;
          syRef.current.relAll();
          droneRef.current.stop();
        } else if(!g.crossAbove&&S.audioSilenced){
          S.audioSilenced=false;
          droneRef.current.resume();
        }
      }

      // ── Sistema de texto poético — solo desde las manos ───────────
      if(S.poetryOn&&g){
        const arc=S.arc;const motion=g.mt||0;
        const spdR=g.spd.r||0,spdL=g.spd.l||0;
        if(S.anchorCD>0)S.anchorCD--;
        if(S.phraseTimer>0)S.phraseTimer--;

        // Frases ancla (gestos específicos)
        if(S.anchorCD<=0){
          let ap=null;
          if(g.rExt)ap=VIAJAR_PHRASES.find(p=>p.anchor==="rExt"&&p.arc===arc);
          else if(g.bUp&&!g.rExt)ap=VIAJAR_PHRASES.find(p=>p.anchor==="bUp"&&p.arc===arc);
          else if(g.lExt)ap=VIAJAR_PHRASES.find(p=>p.anchor==="lExt"&&p.arc===arc);
          if(ap&&ap.text!==S.lastPhrase){
            // Spawn desde la mano que hizo el gesto
            const handJoint=g.rExt?10:g.lExt?9:10;
            const hp=g.lm[handJoint];
            const hx=hp?(1-hp.x)*W:W/2;
            const hy=hp?hp.y*H:H/2;
            particlesRef.current.push(new TextParticle(ap.text,hx,hy,ARC_PALETTES[arc].textColor,arc));
            if(particlesRef.current.length>10)particlesRef.current.shift();
            S.lastPhrase=ap.text;S.anchorCD=150;S.phraseTimer=80;
          }
        }

        // Frases libres — solo si hay movimiento real en alguna mano
        if(S.phraseTimer<=0&&(spdR>0.4||spdL>0.4)){
          const pool=VIAJAR_PHRASES.filter(p=>p.arc===arc&&!p.anchor&&p.text!==S.lastPhrase);
          if(pool.length){
            const tw=pool.reduce((s,p)=>s+p.w,0);let r=Math.random()*tw,chosen=pool[0];
            for(const p of pool){r-=p.w;if(r<=0){chosen=p;break;}}
            // Spawn desde la mano más activa
            const activeHand=spdR>=spdL?10:9;
            const hp=g.lm[activeHand];
            const hx=hp?(1-hp.x)*W+(Math.random()-0.5)*40:W/2;
            const hy=hp?hp.y*H+(Math.random()-0.5)*30:H/2;
            particlesRef.current.push(new TextParticle(chosen.text,hx,hy,ARC_PALETTES[arc].textColor,arc));
            if(particlesRef.current.length>8)particlesRef.current.shift();
            S.lastPhrase=chosen.text;
            // Intervalos más largos — texto escaso y significativo
            S.phraseTimer={deriva:120,kenopsia:280,apertura:150}[arc]||150;
          }
        }
        particlesRef.current.forEach(p=>p.update(motion));
        particlesRef.current=particlesRef.current.filter(p=>!p.isDead());
      }

      // DIBUJO
      const palette=ARC_PALETTES[S.arc];
      if(S.ghost>0){
        ghostCtx.globalAlpha=1-S.ghost;ghostCtx.fillStyle="#000";ghostCtx.fillRect(0,0,W,H);
        if(vid){ghostCtx.globalAlpha=1;ghostCtx.save();ghostCtx.translate(W,0);ghostCtx.scale(-1,1);ghostCtx.drawImage(vid,0,0,W,H);ghostCtx.restore();}
        ctx.clearRect(0,0,W,H);ctx.drawImage(ghostCRef.current,0,0);
      }else{
        ctx.clearRect(0,0,W,H);ctx.fillStyle="#000";ctx.fillRect(0,0,W,H);
        // Tinte sutil del arco
        if(S.arc!=="deriva"){ctx.save();ctx.globalAlpha=0.07;ctx.fillStyle=palette.primary;ctx.fillRect(0,0,W,H);ctx.restore();}
      }

      S.layers.forEach((l,i)=>{const v=vRefs[i]?.current;if(!l.vis||!l.ld||!v||v.readyState<1)return;const a=l.op*(S.vOp[i]||0);if(a<0.005)return;ctx.globalAlpha=Math.min(1,a);ctx.globalCompositeOperation=l.bl;ctx.drawImage(v,0,0,W,H);});
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";

      if(S.body.vis&&vid){const bc=bcRef.current;if(bc){if(bc.width!==W||bc.height!==H){bc.width=W;bc.height=H;}const bx=bc.getContext("2d");bx.save();bx.translate(W,0);bx.scale(-1,1);bx.drawImage(vid,0,0,W,H);bx.restore();ctx.save();ctx.globalAlpha=S.body.op;ctx.globalCompositeOperation=S.body.bl;ctx.drawImage(bc,0,0,W,H);ctx.restore();}}

      // Icosaedro sagrado
      if(S.icoOn&&g?.lm)drawIcosahedron(ctx,g.lm,W,H,palette,t,g.mt||0);

      // Manchas de luz corporal + postimágenes
      if(S.zonesOn&&g?.lm){
        drawBodyZones(ctx,g.lm,W,H,t,g.mt||0);
        // Detectar zonas que cesan → postimagen complementaria
        BODY_ZONES.forEach(z=>{
          const p=g.lm[z.j];const was=prevZoneRef.current[z.j];
          const active=!!p;
          if(was&&!active&&prevZoneRef.current[z.j+"x"]!==undefined){
            afterimagesRef.current.push({x:prevZoneRef.current[z.j+"x"],y:prevZoneRef.current[z.j+"y"],color:z.comp,alpha:0.65,r:85,age:0});
          }
          if(active){prevZoneRef.current[z.j]=true;prevZoneRef.current[z.j+"x"]=(1-p.x)*W;prevZoneRef.current[z.j+"y"]=p.y*H;}
          else prevZoneRef.current[z.j]=false;
        });
        drawAfterimages(ctx,afterimagesRef.current,t);
      }

      if(g?.lm)drawFluid(ctx,g.lm,W,H,palette.entityColor,S.entityOpacity,t,g.mt||0);
      if(S.dancer2On&&S.dancer2)drawFluid(ctx,S.dancer2,W,H,S.dancer2Color,S.entityOpacity*0.75,t,0.2);
      if(S.shadowOn&&shRef.current.buf.length>3){shRef.current.mir=S.shadowMirror;shRef.current.rnd=S.shadowRandom;shRef.current.df=S.shadowDelay;drawGhost(ctx,shRef.current,W,H,palette.shadowColor,S.shadowOpacity,t);}

      // Segunda proyección — canvas oculto → copia al popup
      if(S.ghostProjectionOn&&ghostCanvasRef.current){
        try{
          // Dibujar en canvas oculto primero
          if(!S.ghostOffscreen){S.ghostOffscreen=document.createElement("canvas");S.ghostOffscreen.width=960;S.ghostOffscreen.height=540;}
          const goc=S.ghostOffscreen.getContext("2d");
          const bgVid=S.ghostBgVideoIdx>=0?vRefs[S.ghostBgVideoIdx]?.current:null;
          drawGhostWorld(goc,960,540,shRef.current,S.arc,t,particlesRef.current,palette,bgVid,S.ghostWorldOp);
          // Copiar al popup
          const gc=ghostCanvasRef.current.getContext("2d");
          gc.drawImage(S.ghostOffscreen,0,0);
        }catch(e){console.warn("ghost projection:",e);}
      }

      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";

      // Texto poético
      if(S.poetryOn&&particlesRef.current.length){
        ctx.save();
        ctx.globalCompositeOperation=S.arc==="kenopsia"?"screen":"source-over";
        particlesRef.current.forEach(p=>p.draw(ctx));
        ctx.restore();
      }

      if(S.showOv){
        if(S.curNote!=="—"){ctx.fillStyle="rgba(16,185,129,0.8)";ctx.font="bold 13px monospace";ctx.textAlign="left";ctx.fillText("♫ "+S.curNote,10,22);}
        ctx.fillStyle=palette.primary+"CC";ctx.font="bold 10px monospace";ctx.textAlign="left";ctx.fillText(palette.label,10,H-10);
        ctx.fillStyle="rgba(255,255,255,0.25)";ctx.font="10px monospace";ctx.textAlign="right";ctx.fillText(fps+"fps",W-8,H-8);
        // Indicador silencio total
        if(S.audioSilenced){
          ctx.save();ctx.globalAlpha=0.85;ctx.fillStyle="#1E293B";ctx.fillRect(W/2-70,H/2-22,140,44);
          ctx.fillStyle="#fff";ctx.font="bold 15px sans-serif";ctx.textAlign="center";
          ctx.fillText("✕ SILENCIO",W/2,H/2+5);ctx.restore();
        }
        // Indicador pausa vídeo
        if(g?.crossChest&&!S.audioSilenced){
          ctx.save();ctx.globalAlpha=0.7;ctx.fillStyle="#1E293B";ctx.fillRect(W/2-80,H/2-20,160,40);
          ctx.fillStyle="#94A3B8";ctx.font="bold 13px sans-serif";ctx.textAlign="center";
          ctx.fillText("⏸ VÍDEO PAUSADO",W/2,H/2+5);ctx.restore();
        }
      }
      if(g?.stopA){ctx.globalAlpha=0.15;ctx.fillStyle="#FF0050";ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;ctx.fillStyle="#fff";ctx.font="bold 18px sans-serif";ctx.textAlign="center";ctx.fillText("DETENIDO",W/2,H/2);}
      if(!g){ctx.fillStyle="rgba(255,255,255,0.4)";ctx.font="14px sans-serif";ctx.textAlign="center";ctx.fillText({no_body:"Ponte frente a la cámara",no_video:"Conectando...",loading:"Cargando...",err:"Error de detección",init:"Iniciando..."}[S.dbg]||"",W/2,H/2);}
      if(recording){ctx.save();ctx.fillStyle="#FF0050";ctx.beginPath();ctx.arc(18,18,6,0,Math.PI*2);ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 10px sans-serif";ctx.fillText(`REC ${Math.floor(recTime/60)}:${(recTime%60).toString().padStart(2,"0")}`,28,22);ctx.restore();}

      fpsR.current.c++;const now2=performance.now();if(now2-fpsR.current.t>1000){setFps(fpsR.current.c);fpsR.current={c:0,t:now2};}
      uiC++;if(uiC%10===0)tk();
    };
    animRef.current=requestAnimationFrame(render);
    return()=>{go=false;if(animRef.current)cancelAnimationFrame(animRef.current);};
  },[phase,recording,recTime]);

  useEffect(()=>{const h=()=>setFs(!!document.fullscreenElement);document.addEventListener("fullscreenchange",h);return()=>document.removeEventListener("fullscreenchange",h);},[]);
  const togFS=()=>{if(!fs&&cRef.current)cRef.current.requestFullscreen?.();else document.exitFullscreen?.();};

  const bg="#F8FAFC",bgC="#fff",bdr="#E2E8F0",txP="#1E293B",txS="#64748B",ac="#10B981";
  const sLbl={fontSize:12,fontWeight:600,color:txS,marginBottom:6,display:"block"};
  const sS=c=>({width:"100%",accentColor:c||ac,height:8,cursor:"pointer"});
  const sSel=()=>({width:"100%",background:bgC,border:`2px solid ${bdr}`,color:txP,padding:"9px",borderRadius:10,fontSize:13});
  const syn=syRef.current;
  const Tab=({id,label,icon})=>(<div onPointerDown={()=>setPanel(id)} style={{flex:1,padding:"10px 2px",textAlign:"center",cursor:"pointer",borderBottom:`3px solid ${panel===id?ac:"transparent"}`,background:panel===id?"#ECFDF5":"transparent",color:panel===id?ac:txS,fontWeight:panel===id?700:500}}><div style={{fontSize:18}}>{icon}</div><div style={{fontSize:8,marginTop:2}}>{label}</div></div>);
  const Tog=({on,color=ac,label,onTap})=>(<div onPointerDown={onTap} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",borderRadius:10,background:on?color+"10":bgC,border:`2px solid ${on?color+"40":bdr}`,marginBottom:8}}><span style={{width:36,height:20,borderRadius:10,background:on?color+"30":bdr,border:`2px solid ${on?color:"#CBD5E1"}`,display:"flex",alignItems:"center",justifyContent:on?"flex-end":"flex-start",padding:2,flexShrink:0}}><span style={{width:14,height:14,borderRadius:7,background:on?color:"#94A3B8"}}/></span><span style={{fontSize:13,color:on?txP:txS}}>{label}</span></div>);
  const FxS=({label,val,min,max,step,color,onChange})=>(<div style={{marginBottom:10}}><span style={sLbl}>{label}: {Number(val.toFixed(step<1?2:0))}</span><input type="range" min={min} max={max} step={step} value={val} onChange={e=>onChange(parseFloat(e.target.value))} style={sS(color)}/></div>);
  const ColorPick=({val,onChange})=>(<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{["#10B981","#F43F5E","#F59E0B","#3B82F6","#A855F7","#06B6D4","#fff"].map(c=>(<div key={c} onPointerDown={()=>onChange(c)} style={{width:26,height:26,borderRadius:6,background:c,border:val===c?`3px solid ${txP}`:`2px solid ${bdr}`,cursor:"pointer"}}/>))}</div>);
  const Bar=({value,color=ac})=>(<div style={{background:bdr,borderRadius:4,height:5,flex:1}}><div style={{width:`${Math.max(1,(value||0)*100)}%`,height:5,borderRadius:4,background:color}}/></div>);
  const BigBtn=({label,icon,color=ac,active,onTap})=>(<div onPointerDown={onTap} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"12px",borderRadius:10,background:active?color+"15":bgC,border:`2px solid ${active?color:bdr}`,marginBottom:8}}><span style={{fontSize:18}}>{icon}</span><span style={{fontSize:13,fontWeight:600,color:active?color:txP}}>{label}</span></div>);

  return(
    <div style={{minHeight:"100vh",background:phase==="running"?bg:"#F0F4F8",color:txP,fontFamily:"system-ui,sans-serif",fontSize:13}}>
      <video ref={wcRef} width="640" height="480" muted playsInline autoPlay style={{position:"fixed",top:-9999,left:-9999,opacity:0,pointerEvents:"none"}}/>
      {phase==="start"&&(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><h1 style={{fontSize:48,fontWeight:800,margin:"0 0 8px"}}>K<span style={{color:ac}}>orp</span>S<span style={{color:"#F59E0B"}}>ound</span></h1><p style={{color:txS,marginBottom:28}}>movimiento · composición · presencia</p><button onClick={()=>setPhase("loading")} style={{background:ac,color:"#fff",border:"none",padding:"18px 56px",fontSize:17,fontWeight:700,cursor:"pointer",borderRadius:12}}>Iniciar</button></div></div>)}
      {phase==="loading"&&(<div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{width:50,height:50,border:`4px solid ${bdr}`,borderTop:`4px solid ${ac}`,borderRadius:"50%",margin:"0 auto 20px",animation:"spin 1s linear infinite"}}/><div style={{fontSize:15,fontWeight:600}}>{loadMsg}</div><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div></div>)}
      {phase==="running"&&(<div style={{display:"flex",flexDirection:"column",height:"100vh"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 14px",borderBottom:`1px solid ${bdr}`,background:bgC}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontWeight:800,fontSize:16}}>K<span style={{color:ac}}>orp</span>S<span style={{color:"#F59E0B"}}>ound</span></span>
            <span style={{background:"#D1FAE5",color:"#059669",padding:"2px 7px",borderRadius:6,fontSize:10,fontWeight:600}}>{S.poseCount}p</span>
            {S.curNote!=="—"&&<span style={{background:"#D1FAE5",color:"#059669",padding:"2px 7px",borderRadius:6,fontSize:11,fontWeight:700}}>♫ {S.curNote}</span>}
            {recording&&<span style={{background:"#FEE2E2",color:"#DC2626",padding:"2px 7px",borderRadius:6,fontSize:10,fontWeight:700}}>REC</span>}
            <span style={{background:ARC_PALETTES[S.arc].primary+"25",color:ARC_PALETTES[S.arc].primary,padding:"2px 9px",borderRadius:6,fontSize:10,fontWeight:700}}>{ARC_PALETTES[S.arc].label}</span>
          </div>
          <span style={{color:txS,fontSize:11}}>{fps}fps</span>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden"}}>
          <div style={{width:255,borderRight:`1px solid ${bdr}`,display:"flex",flexDirection:"column",flexShrink:0,background:bgC}}>
            <div style={{display:"flex",borderBottom:`1px solid ${bdr}`}}><Tab id="viajar" label="Viajar" icon="✦"/><Tab id="music" label="Música" icon="♫"/><Tab id="visual" label="Visual" icon="🎨"/><Tab id="videos" label="Vídeo" icon="▶"/><Tab id="config" label="Config" icon="⚙"/></div>
            <div style={{flex:1,overflowY:"auto",padding:12}}>
              {panel==="viajar"&&(<div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:14,fontWeight:800,marginBottom:2}}>Arco emocional</div>
                  <div style={{fontSize:11,color:txS}}>Cambia paleta, color y escala musical</div>
                </div>
                {Object.entries(ARC_PALETTES).map(([id,p])=>{
                  const active=S.arc===id;
                  return(<div key={id} onPointerDown={()=>{applyArc(id,syRef.current);tk();}} style={{padding:"14px 16px",borderRadius:12,border:`2px solid ${active?p.primary:bdr}`,background:active?p.primary+"15":bgC,marginBottom:8,cursor:"pointer"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:active?6:0}}>
                      <div style={{width:12,height:12,borderRadius:"50%",background:p.primary,flexShrink:0}}/>
                      <span style={{fontWeight:700,fontSize:13,color:active?p.primary:txP}}>{p.label}</span>
                      {active&&<span style={{marginLeft:"auto",fontSize:10,color:p.primary,fontWeight:700}}>● ACTIVO</span>}
                    </div>
                    {active&&<div style={{fontSize:10,color:txS,lineHeight:1.5,paddingLeft:20}}>
                      {id==="deriva"&&"Azul frío · Menor natural · 90 BPM"}
                      {id==="kenopsia"&&"Gris plata · Escala japonesa · 60 BPM"}
                      {id==="apertura"&&"Ámbar y verde · Pentatónica · 130 BPM"}
                    </div>}
                  </div>);
                })}
                <div style={{marginTop:4,padding:"10px 12px",borderRadius:10,background:"#F8FAFC",border:`1px solid ${bdr}`}}>
                  <div style={{fontSize:11,fontWeight:700,color:txS,marginBottom:6}}>Drone ambiental</div>
                  <Tog on={S.droneOn??true} color={ARC_PALETTES[S.arc].primary} label="Drone activo" onTap={()=>{S.droneOn=!(S.droneOn??true);if(S.droneOn)droneRef.current.resume();else droneRef.current.stop();tk();}}/>
                  <Tog on={S.poetryOn} color={ARC_PALETTES[S.arc].primary} label="Texto poético" onTap={()=>{S.poetryOn=!S.poetryOn;if(!S.poetryOn)particlesRef.current=[];tk();}}/>
                  <Tog on={S.icoOn} color={ARC_PALETTES[S.arc].primary} label="Icosaedro sagrado" onTap={()=>{S.icoOn=!S.icoOn;tk();}}/>
                  <Tog on={S.zonesOn} color={ARC_PALETTES[S.arc].primary} label="Zonas de color" onTap={()=>{S.zonesOn=!S.zonesOn;tk();}}/>
                  <div onPointerDown={()=>{particlesRef.current=[];tk();}} style={{cursor:"pointer",padding:"6px 10px",borderRadius:8,background:"#F1F5F9",fontSize:11,color:txS,textAlign:"center",marginTop:4}}>✦ Limpiar texto</div>
                </div>
                <div style={{borderTop:`2px solid ${bdr}`,paddingTop:10,marginTop:4}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Mundo paralelo</div>
                  <div style={{fontSize:10,color:txS,marginBottom:6}}>Fondo: carga un vídeo en el panel Vídeo y selecciónalo aquí</div>
                  <select value={S.ghostBgVideoIdx} onChange={e=>{S.ghostBgVideoIdx=parseInt(e.target.value);tk();}} style={{...sSel(),marginBottom:8}}>
                    <option value={-1}>Niebla generativa</option>
                    {S.layers.map((l,i)=>l.ld?<option key={i} value={i}>V{i+1}: {l.nm.slice(0,18)}</option>:null)}
                  </select>
                  {!S.ghostProjectionOn
                    ?<BigBtn label="Abrir mundo paralelo" icon="🌒" onTap={openGhostWin} sub="→ segundo proyector"/>
                    :<BigBtn label="Cerrar proyección" icon="✕" color="#F43F5E" active onTap={closeGhostWin}/>
                  }
                </div>
                <div style={{marginTop:4,padding:"10px 12px",borderRadius:10,background:"#F8FAFC",border:`1px solid ${bdr}`}}>
                  <div style={{fontSize:10,color:txS,lineHeight:1.8}}>
                    <div style={{fontWeight:700,marginBottom:4}}>Gestos ancla (texto)</div>
                    <div>→ Brazo D → <em style={{color:ARC_PALETTES["kenopsia"].primary}}>"esos pasillos..."</em></div>
                    <div>↑ Brazos → <em style={{color:ARC_PALETTES["kenopsia"].primary}}>"lo último que olvidan..."</em></div>
                    <div>← Brazo I → <em style={{color:ARC_PALETTES["apertura"].primary}}>"mi cuerpo es libre..."</em></div>
                    <div style={{marginTop:6,fontWeight:700}}>Gestos musicales</div>
                    <div>← Brazo I → Bass · → Brazo D → Melody</div>
                    <div>↑ Brazos → Acordes · ↓ Sent → Sub</div>
                    <div>✕ Cruzados → STOP</div>
                  </div>
                </div>
              </div>)}
              {panel==="music"&&(<div>
                <span style={sLbl}>Tonalidad</span><select value={S.synKey} onChange={e=>{S.synKey=e.target.value;syn.chK(e.target.value);tk();}} style={{...sSel(),marginBottom:8}}>{["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"].map(k=><option key={k}>{k}</option>)}</select>
                <span style={sLbl}>Escala</span><select value={S.synScale} onChange={e=>{S.synScale=e.target.value;syn.chS(e.target.value);tk();}} style={{...sSel(),marginBottom:8}}>{Object.keys(SCALES).map(s=><option key={s}>{s}</option>)}</select>
                <FxS label="Volumen" val={S.synVol} min={0} max={1} step={0.01} onChange={v=>{S.synVol=v;syn.setV(v);tk();}}/>
                <FxS label="Delay" val={S.synDl} min={0} max={0.8} step={0.01} color={CL[1]} onChange={v=>{S.synDl=v;syn.setDl(v);tk();}}/>
                <FxS label="Reverb" val={S.synRv} min={0} max={0.8} step={0.01} color={CL[3]} onChange={v=>{S.synRv=v;syn.setRv(v);tk();}}/>
                <Tog on={S.synOn} label="Sintetizador" onTap={()=>{S.synOn=!S.synOn;if(!S.synOn)syn.relAll();tk();}}/>
              </div>)}
              {panel==="visual"&&(<div>
                <div style={{fontWeight:700,marginBottom:8}}>Entidad fluida</div>
                <ColorPick val={S.entityColor} onChange={c=>{S.entityColor=c;tk();}}/>
                <FxS label="Opacidad entidad" val={S.entityOpacity} min={0} max={1} step={0.01} onChange={v=>{S.entityOpacity=v;tk();}}/>
                <div style={{borderTop:`2px solid ${bdr}`,paddingTop:10,marginTop:4,fontWeight:700,marginBottom:8}}>Cámara</div>
                <Tog on={S.body.vis} label="Mostrar cámara" onTap={()=>{S.body.vis=!S.body.vis;tk();}}/>
                <FxS label="Opacidad cámara" val={S.body.op} min={0} max={1} step={0.01} onChange={v=>{S.body.op=v;tk();}}/>
                <span style={sLbl}>Fusión</span><select value={S.body.bl} onChange={e=>{S.body.bl=e.target.value;tk();}} style={{...sSel(),marginBottom:10}}>{BLENDS.map(b=><option key={b}>{b}</option>)}</select>
                <FxS label="Estela/Ghost" val={S.ghost} min={0} max={0.95} step={0.01} color={CL[3]} onChange={v=>{S.ghost=v;if(v===0&&ghostCRef.current){const gx=ghostCRef.current.getContext("2d");gx.fillStyle="#000";gx.fillRect(0,0,960,540);}tk();}}/>
                <div style={{borderTop:`2px solid ${bdr}`,paddingTop:10,marginTop:4,fontWeight:700,marginBottom:8}}>Segundo bailarín</div>
                <Tog on={S.dancer2On} color={CL[2]} label="Detectar 2ª persona" onTap={()=>{S.dancer2On=!S.dancer2On;S._lastDancer2Mode=null;tk();}}/>
                {S.dancer2On&&(<><span style={sLbl}>Color</span><ColorPick val={S.dancer2Color} onChange={c=>{S.dancer2Color=c;tk();}}/></>)}
                <div style={{borderTop:`2px solid ${bdr}`,paddingTop:10,marginTop:4,fontWeight:700,marginBottom:8}}>Sombra IA</div>
                <Tog on={S.shadowOn} color={CL[1]} label="Sombra activa" onTap={()=>{S.shadowOn=!S.shadowOn;tk();}}/>
                {S.shadowOn&&(<>
                  <Tog on={S.shadowMirror} color={CL[3]} label="Espejo" onTap={()=>{S.shadowMirror=!S.shadowMirror;tk();}}/>
                  <FxS label="Retraso" val={S.shadowDelay} min={0.05} max={0.9} step={0.05} color={CL[1]} onChange={v=>{S.shadowDelay=v;tk();}}/>
                  <FxS label="Aleatorio" val={S.shadowRandom} min={0} max={1} step={0.05} color={CL[1]} onChange={v=>{S.shadowRandom=v;tk();}}/>
                  <FxS label="Opacidad sombra" val={S.shadowOpacity} min={0.1} max={1} step={0.05} color={CL[1]} onChange={v=>{S.shadowOpacity=v;tk();}}/>
                  <span style={sLbl}>Color sombra</span><ColorPick val={S.shadowColor} onChange={c=>{S.shadowColor=c;tk();}}/>
                </>)}
                <Tog on={S.showOv} label="HUD" onTap={()=>{S.showOv=!S.showOv;tk();}}/>
              </div>)}
              {panel==="videos"&&(<div>
                {S.layers.map((l,i)=>(<div key={i} style={{marginBottom:8,padding:10,borderRadius:10,border:`2px solid ${S.vAct[i]?CL[i%CL.length]+"60":bdr}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><span style={{fontWeight:700,color:CL[i%CL.length]}}>V{i+1}</span><span style={{fontSize:10,color:txS}}>{i<4?["←Izq","→Der","↑Arriba","↓Sent"][i]:"—"}</span>{S.vAct[i]&&<span style={{marginLeft:"auto",color:CL[i%CL.length],fontWeight:700}}>▶</span>}</div>
                  <label style={{display:"block",padding:"8px",border:`2px dashed ${CL[i%CL.length]}40`,borderRadius:8,cursor:"pointer",textAlign:"center",fontSize:11,color:l.ld?CL[i%CL.length]:txS}}>{l.ld?"✓ "+l.nm.slice(0,20):"Cargar vídeo"}<input type="file" accept="video/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&loadVid(e.target.files[0],i)}/></label>
                  {l.ld&&(<>
                    <div style={{marginTop:6}}><FxS label="Opacidad" val={l.op} min={0} max={1} step={0.01} color={CL[i%CL.length]} onChange={v=>{l.op=v;tk();}}/></div>
                    <div onPointerDown={()=>{S.vManual[i]=!S.vManual[i];const v=vRefs[i]?.current;if(S.vManual[i]){S.vOp[i]=l.op;S.vAct[i]=true;if(v&&v.paused)v.play().catch(()=>{});}else{S.vOp[i]=0;S.vAct[i]=false;if(v&&!v.paused)v.pause();}tk();}} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",padding:"7px 10px",borderRadius:8,background:S.vManual[i]?CL[i%CL.length]+"18":"#F8FAFC",border:`1px solid ${S.vManual[i]?CL[i%CL.length]+"60":bdr}`}}>
                      <span>{S.vManual[i]?"⏸":"▶"}</span><span style={{fontSize:11,color:S.vManual[i]?CL[i%CL.length]:txS}}>{S.vManual[i]?"Activo":"Activar"}</span>
                    </div>
                  </>)}
                </div>))}
              </div>)}
              {panel==="config"&&(<div>
                <span style={{fontSize:14,fontWeight:700,marginBottom:8,display:"block"}}>Cámara</span>
                <select value={camId} onChange={e=>switchCam(e.target.value)} style={{...sSel(),marginBottom:8}}><option value="">Por defecto</option>{cameras.map((c,i)=><option key={c.deviceId} value={c.deviceId}>{c.label||`Cámara ${i+1}`}</option>)}</select>
                <BigBtn label="Refrescar cámaras" icon="🔄" onTap={listCams}/>
                <div style={{borderTop:`2px solid ${bdr}`,paddingTop:10,marginTop:10}}>
                  <span style={{fontSize:14,fontWeight:700,marginBottom:8,display:"block"}}>Grabación</span>
                  {!recording?<BigBtn label="Iniciar grabación" icon="⏺" color="#DC2626" onTap={startRec}/>:<BigBtn label={`Detener ${Math.floor(recTime/60)}:${(recTime%60).toString().padStart(2,"0")}`} icon="⏹" color="#DC2626" active onTap={stopRec}/>}
                </div>
              </div>)}
            </div>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,background:"#000"}}>
            <div ref={cRef} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"}}>
              <canvas ref={outRef} style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
              <button onClick={togFS} style={{position:"absolute",top:8,right:8,background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:12}}>{fs?"Salir":"Fullscreen"}</button>
            </div>
            <div style={{display:"flex",gap:4,padding:"5px 10px",alignItems:"center",background:bgC,borderTop:`1px solid ${bdr}`}}>
              {S.layers.map((l,i)=>(<div key={i} style={{width:28}}><div style={{fontSize:8,color:S.vAct[i]?CL[i%CL.length]:txS,textAlign:"center"}}>{i+1}</div><Bar value={S.vOp[i]*l.op} color={CL[i%CL.length]}/></div>))}
              <div style={{width:1,height:18,background:bdr,margin:"0 4px"}}/>
              <div style={{width:72,height:42,background:"#1E293B",borderRadius:6,overflow:"hidden",position:"relative",flexShrink:0}}>
                <video ref={pvRef} muted playsInline autoPlay style={{width:"100%",height:"100%",objectFit:"cover",transform:"scaleX(-1)"}}/>
                <div style={{position:"absolute",bottom:2,left:4,fontSize:8,color:ac,fontWeight:700}}>CAM</div>
              </div>
            </div>
          </div>
        </div>
      </div>)}
      {vRefs.map((r,i)=>(<video key={i} ref={r} muted loop playsInline preload="auto" style={{position:"fixed",top:-9999,left:-9999,width:1,height:1,opacity:0,pointerEvents:"none"}}/>))}
      <canvas ref={bcRef} style={{display:"none"}}/>
    </div>
  );
}
