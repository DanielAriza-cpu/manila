// KorpSound v3.0 — src/App.jsx
// Performer: Mariana | Creative Technologist: Dani
// A=432Hz | Andean Pentatonic | MoveNet SINGLEPOSE_LIGHTNING
// Drone → droneGain (bypass mixBus) | AncestralEngine + Samples → mixBus

import { useRef, useState, useEffect, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const W = 960;
const H = 540;
const CONF = 0.22;
const BASE_HZ = 432;
const PENTA = [0, 4, 7, 10, 12];           // A C# E G A
const QUENA_PAT = [0, 4, 7, 12, 10, 7, 4, 0, 7, 4, 0, 4];
const BC_CHANNEL = 'korpsound-v3';

const KP = {
  nose: 0, lEye: 1, rEye: 2, lEar: 3, rEar: 4,
  lShoulder: 5, rShoulder: 6, lElbow: 7, rElbow: 8,
  lWrist: 9, rWrist: 10, lHip: 11, rHip: 12,
  lKnee: 13, rKnee: 14, lAnkle: 15, rAnkle: 16,
};

const SKELETON = [
  [5, 7], [7, 9], [6, 8], [8, 10], [5, 6],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [0, 5], [0, 6],
];

const TEXTS = [
  'My body has changed during the journey',
  'My body is an emotional archive',
  'My body observes itself',
  'Fleeing from oneself — moving',
];

const VID_LABELS = ['Invierno', 'Primavera', 'Verano', 'Otoño'];

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════
const semitoneHz = (semi, oct = 0) => BASE_HZ * Math.pow(2, (semi + oct * 12) / 12);

function kp(keypoints, id) {
  const k = keypoints[id];
  return k && k.score >= CONF ? k : null;
}

function makeImpulse(ctx, dur = 4.5) {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
  }
  return buf;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHADOW CLASS — efecto gaseoso volumétrico
// ═══════════════════════════════════════════════════════════════════════════════
class Shadow {
  constructor() {
    this.pos = Array(17).fill(0).map(() => ({ x: W / 2, y: H / 2 }));
    this.ready = false;
  }

  update(keypoints, { mirror = false, noise = 0 } = {}) {
    const smooth = 0.22;
    keypoints.forEach((k, i) => {
      if (!k || k.score < CONF) return;
      let tx = k.x, ty = k.y;
      if (mirror) tx = W - tx;
      if (noise > 0) {
        tx += (Math.random() - 0.5) * noise * 30;
        ty += (Math.random() - 0.5) * noise * 30;
      }
      this.pos[i].x += (tx - this.pos[i].x) * smooth;
      this.pos[i].y += (ty - this.pos[i].y) * smooth;
      this.ready = true;
    });
  }

  draw(ctx, { opacity = 0.5, color = '#7c3aed', scaleX = 1, scaleY = 1 } = {}) {
    if (!this.ready) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const cr = parseInt(color.slice(1, 3), 16);
    const cg = parseInt(color.slice(3, 5), 16);
    const cb = parseInt(color.slice(5, 7), 16);
    const sc = Math.min(scaleX, scaleY);
    const t = Date.now() * 0.001; // para respiración

    // Puntos corporales con radios orgánicos (sin ojos ni orejas → sin triángulo)
    const bodyMap = [
      { idx: 0, r: 38 },  // nariz (cabeza completa)
      // 1,2,3,4 → ojos y orejas OMITIDOS (eliminan el triángulo)
      { idx: 5, r: 32 },  // hombro izq
      { idx: 6, r: 32 },  // hombro der
      { idx: 7, r: 22 },  // codo izq
      { idx: 8, r: 22 },  // codo der
      { idx: 9, r: 16 },  // muñeca izq
      { idx: 10, r: 16 }, // muñeca der
      { idx: 11, r: 30 }, // cadera izq
      { idx: 12, r: 30 }, // cadera der
      { idx: 13, r: 24 }, // rodilla izq
      { idx: 14, r: 24 }, // rodilla der
      { idx: 15, r: 16 }, // tobillo izq
      { idx: 16, r: 16 }, // tobillo der
    ];

    bodyMap.forEach(({ idx, r }) => {
      const p = this.pos[idx];
      const x = p.x * scaleX;
      const y = p.y * scaleY;

      // Respiración orgánica (cada punto pulsa ligeramente distinto)
      const breathe = 1 + 0.12 * Math.sin(t * 1.2 + idx * 0.7);
      const radius = r * sc * breathe;

      // Halo exterior (niebla)
      const outer = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.2);
      outer.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${opacity * 0.12})`);
      outer.addColorStop(0.4, `rgba(${cr}, ${cg}, ${cb}, ${opacity * 0.06})`);
      outer.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();

      // Núcleo luminoso
      const inner = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const bright = Math.min(255, cr + 50);
      const brightG = Math.min(255, cg + 35);
      const brightB = Math.min(255, cb + 25);
      inner.addColorStop(0, `rgba(${bright}, ${brightG}, ${brightB}, ${opacity * 0.35})`);
      inner.addColorStop(0.5, `rgba(${cr}, ${cg}, ${cb}, ${opacity * 0.15})`);
      inner.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Puentes de luz entre articulaciones cercanas (conexiones orgánicas, no líneas)
    // Solo torso y extremidades principales — sin cabeza
    const bridges = [
      [5, 6],   // hombro-hombro (pecho)
      [5, 11],  // hombro-cadera izq
      [6, 12],  // hombro-cadera der
      [11, 12], // cadera-cadera (pelvis)
    ];
    bridges.forEach(([a, b]) => {
      const pa = this.pos[a], pb = this.pos[b];
      const ax = pa.x * scaleX, ay = pa.y * scaleY;
      const bx = pb.x * scaleX, by = pb.y * scaleY;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dist = Math.hypot(bx - ax, by - ay);
      const r = dist * 0.35;

      const bridge = ctx.createRadialGradient(mx, my, 0, mx, my, r);
      bridge.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${opacity * 0.1})`);
      bridge.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = bridge;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANCESTRAL ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
class AncestralEngine {
  constructor(audioCtx, mixBus) {
    this.ctx = audioCtx;
    this.bus = mixBus;
    this.qIdx = 0;
    this.cd = { siku: 0, quena: 0, bombo: 0, charango: 0, perc: 0 };
    this.CD = { siku: 30, quena: 25, bombo: 20, charango: 35, perc: 60 };
    this.samples = { siku: null, quena: null, bombo: null, percusion: null, charango: null };
    this.sampleAudios = { siku: null, quena: null, bombo: null, percusion: null, charango: null };
    this.active = false;
    this.lastInstr = '';
    this.prevRightZone = null;   // para flanco de subida de zona
    this.prevLeftDetected = false; // para flanco de subida charango
    // Anti-jitter: posiciones suavizadas + confirmación sostenida antes de disparar
    this.smRw = null;
    this.smLw = null;
    this.candRightZone = null;
    this.candRightCount = 0;
    this.candLeft = null;
    this.candLeftCount = 0;
  }

  _noise(dur) {
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  _playSample(role, gain = 0.8) {
    const audio = this.sampleAudios[role];
    if (!audio) return;
    audio.volume = gain;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  triggerSiku() {
    if (this.cd.siku > 0) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.sampleAudios.siku) {
      this._playSample('siku', 0.85);
    } else {
      // Fallback: synth
      const semi = PENTA[Math.floor(Math.random() * PENTA.length)];
      const f = semitoneHz(semi);

      const masterG = ctx.createGain();
      masterG.gain.setValueAtTime(0, now);
      masterG.gain.linearRampToValueAtTime(0.3, now + 0.06);
      masterG.gain.setValueAtTime(0.3, now + 0.18);
      masterG.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      masterG.connect(this.bus);

      const ns = this._noise(0.9);
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = f;
      bpf.Q.value = 14;
      ns.connect(bpf);
      bpf.connect(masterG);
      ns.start(now);
      ns.stop(now + 0.9);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 16;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, now);
      og.gain.linearRampToValueAtTime(0.12, now + 0.08);
      og.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      osc.connect(og);
      og.connect(this.bus);
      osc.start(now);
      osc.stop(now + 0.9);
    }

    this.cd.siku = this.CD.siku;
    this.lastInstr = 'Siku';
  }

  triggerQuena() {
    if (this.cd.quena > 0) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.sampleAudios.quena) {
      this._playSample('quena', 0.8);
    } else {
      const semi = QUENA_PAT[this.qIdx % QUENA_PAT.length];
      this.qIdx++;
      const f = semitoneHz(semi);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);

      const vib = ctx.createOscillator();
      vib.frequency.value = 6.2;
      const vg = ctx.createGain();
      vg.gain.value = f * 0.018;
      vib.connect(vg);
      vg.connect(osc.frequency);

      const ns = this._noise(1.2);
      const breathG = ctx.createGain();
      breathG.gain.value = 0.045;

      const masterG = ctx.createGain();
      masterG.gain.setValueAtTime(0, now);
      masterG.gain.linearRampToValueAtTime(0.25, now + 0.12);
      masterG.gain.setValueAtTime(0.25, now + 0.7);
      masterG.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      masterG.connect(this.bus);

      osc.connect(masterG);
      ns.connect(breathG);
      breathG.connect(masterG);

      vib.start(now);
      osc.start(now);
      ns.start(now);
      osc.stop(now + 1.2);
      vib.stop(now + 1.2);
      ns.stop(now + 1.2);
    }

    this.cd.quena = this.CD.quena;
    this.lastInstr = 'Quena';
  }

  triggerBombo() {
    if (this.cd.bombo > 0) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.sampleAudios.bombo) {
      this._playSample('bombo', 0.9);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(165, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);

      const masterG = ctx.createGain();
      masterG.gain.setValueAtTime(0.85, now);
      masterG.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      masterG.connect(this.bus);

      const len = Math.ceil(ctx.sampleRate * 0.45);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      const dc = ctx.sampleRate * 0.04;
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / dc);
      const ns = ctx.createBufferSource();
      ns.buffer = buf;
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 110;
      ns.connect(lpf);
      lpf.connect(masterG);

      osc.connect(masterG);
      osc.start(now);
      osc.stop(now + 0.45);
      ns.start(now);
      ns.stop(now + 0.45);
    }

    this.cd.bombo = this.CD.bombo;
    this.lastInstr = 'Bombo';
  }

  triggerCharango() {
    if (this.cd.charango > 0) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    if (this.sampleAudios.charango) {
      this._playSample('charango', 0.75);
    } else {
      const chord = [0, 7, 12, 4, 7];
      chord.forEach((semi, i) => {
        const f = semitoneHz(semi + 12);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 9;
        const g = ctx.createGain();
        const t = now + i * 0.022;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.025);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
        osc.connect(g);
        g.connect(this.bus);
        osc.start(t);
        osc.stop(t + 1.8);
      });

      const body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.value = semitoneHz(0, -1);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.09, now);
      bg.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      body.connect(bg);
      bg.connect(this.bus);
      body.start(now);
      body.stop(now + 0.55);
    }

    this.cd.charango = this.CD.charango;
    this.lastInstr = 'Charango';
  }

  triggerPerc(hasMotion) {
    if (!hasMotion || this.cd.perc > 0 || !this.sampleAudios.percusion) return;
    this._playSample('percusion', 0.6);
    this.cd.perc = this.CD.perc;
    this.lastInstr = 'Percusión';
  }

  tick(keypoints, hasMotion) {
    for (const k in this.cd) { if (this.cd[k] > 0) this.cd[k]--; }
    if (!this.active || !keypoints || keypoints.length < 17) return;

    const SM = 0.3;        // suavizado de posición (reduce el jitter de MoveNet)
    const CONFIRM = 5;     // frames sostenidos antes de aceptar un cambio (~80ms @60fps)

    const MARGIN = 20; // px de banda muerta: cerca del límite, exige cruzarlo con margen para cambiar de zona
    const rw = kp(keypoints, KP.rWrist);
    const lw = kp(keypoints, KP.lWrist);

    // Muñeca derecha: zona con posición suavizada + banda muerta espacial + confirmación sostenida.
    // La banda muerta hace que el límite para SALIR de una zona sea distinto al límite para ENTRAR
    // (como un Schmitt trigger): un vaivén de reposo justo sobre la línea ya no alcanza a cruzarla
    // dos veces, solo un movimiento real y claro la cruza de forma consistente.
    if (rw) {
      this.smRw = this.smRw
        ? { x: this.smRw.x + (rw.x - this.smRw.x) * SM, y: this.smRw.y + (rw.y - this.smRw.y) * SM }
        : { x: rw.x, y: rw.y };
      const b1 = H / 3, b2 = (2 * H) / 3;
      const y = this.smRw.y;
      let zone;
      if (this.prevRightZone === 'high') zone = y < b1 + MARGIN ? 'high' : (y < b2 ? 'mid' : 'low');
      else if (this.prevRightZone === 'low') zone = y > b2 - MARGIN ? 'low' : (y > b1 ? 'mid' : 'high');
      else if (this.prevRightZone === 'mid') zone = y < b1 - MARGIN ? 'high' : (y > b2 + MARGIN ? 'low' : 'mid');
      else zone = y < b1 ? 'high' : y < b2 ? 'mid' : 'low'; // primera lectura: sin zona previa

      if (zone === this.candRightZone) this.candRightCount++;
      else { this.candRightZone = zone; this.candRightCount = 1; }

      if (this.candRightCount >= CONFIRM && zone !== this.prevRightZone) {
        if (this.prevRightZone !== null) { // primera confirmación: solo registra, no dispara
          if (zone === 'high') this.triggerSiku();
          else if (zone === 'mid') this.triggerQuena();
          else this.triggerBombo();
        }
        this.prevRightZone = zone;
      }
    } else {
      this.smRw = null;
      this.prevRightZone = null;
      this.candRightZone = null;
      this.candRightCount = 0;
    }

    // Charango: muñeca IZQUIERDA por encima del pecho, con la misma banda muerta + confirmación
    if (lw) {
      this.smLw = this.smLw
        ? { x: this.smLw.x + (lw.x - this.smLw.x) * SM, y: this.smLw.y + (lw.y - this.smLw.y) * SM }
        : { x: lw.x, y: lw.y };
      const threshold = H * 0.55;
      const up = this.prevLeftDetected
        ? this.smLw.y < threshold + MARGIN   // ya estaba arriba: hay que bajar bastante para "soltar"
        : this.smLw.y < threshold - MARGIN;  // estaba abajo: hay que subir bastante para "activar"

      if (up === this.candLeft) this.candLeftCount++;
      else { this.candLeft = up; this.candLeftCount = 1; }

      if (this.candLeftCount >= CONFIRM && up !== this.prevLeftDetected) {
        if (up && hasMotion) this.triggerCharango();
        this.prevLeftDetected = up;
      }
    } else {
      this.smLw = null;
      this.prevLeftDetected = false;
      this.candLeft = null;
      this.candLeftCount = 0;
    }

    this.triggerPerc(hasMotion);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRONE ENGINE (desconectado del mixBus)
// ═══════════════════════════════════════════════════════════════════════════════
class DroneEngine {
  constructor(audioCtx) {
    this.ctx = audioCtx;
    this.oscillators = [];
    this.gains = [];
    this.running = false;
  }

  start(droneGain) {
    if (this.running) return;
    this.running = true;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 4.8);
    const convG = ctx.createGain();
    convG.gain.value = 0.55;
    conv.connect(convG);
    convG.connect(droneGain);

    const dryG = ctx.createGain();
    dryG.gain.value = 0.38;
    dryG.connect(droneGain);

    // LFO maestro (0.05Hz)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 6;
    lfo.connect(lfoG);

    // Ira voice: A2 = 108Hz, 8 cents flat (intonación cruda)
    const ira = ctx.createOscillator();
    ira.type = 'sine';
    ira.frequency.value = 108;
    ira.detune.value = -8;
    lfoG.connect(ira.detune);
    const iraG = ctx.createGain();
    iraG.gain.setValueAtTime(0, now);
    iraG.gain.linearRampToValueAtTime(0.28, now + 3.5);
    const iraBPF = ctx.createBiquadFilter();
    iraBPF.type = 'bandpass';
    iraBPF.frequency.value = 108;
    iraBPF.Q.value = 2.2;
    ira.connect(iraG);
    iraG.connect(iraBPF);
    iraBPF.connect(conv);
    iraBPF.connect(dryG);

    // Arka voice: E3 microtonal = 162.5Hz (no temperado), 5 cents sharp
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.073;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 4.5;
    lfo2.connect(lfo2G);

    const arka = ctx.createOscillator();
    arka.type = 'sine';
    arka.frequency.value = 162.5;
    arka.detune.value = 5;
    lfo2G.connect(arka.detune);
    const arkaG = ctx.createGain();
    arkaG.gain.setValueAtTime(0, now);
    arkaG.gain.linearRampToValueAtTime(0.2, now + 5);
    arka.connect(arkaG);
    arkaG.connect(conv);
    arkaG.connect(dryG);

    // Sub bombo leguero: A1 = 54Hz (tierra)
    const pulseOsc = ctx.createOscillator();
    pulseOsc.frequency.value = 0.78;
    const pulseG = ctx.createGain();
    pulseG.gain.value = 0.14;
    pulseOsc.connect(pulseG);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 54;
    pulseG.connect(sub.frequency);
    const subG = ctx.createGain();
    const subLPF = ctx.createBiquadFilter();
    subLPF.type = 'lowpass';
    subLPF.frequency.value = 80;
    subG.gain.setValueAtTime(0, now);
    subG.gain.linearRampToValueAtTime(0.33, now + 6);
    sub.connect(subG);
    subG.connect(subLPF);
    subLPF.connect(droneGain); // Sub directo, sin reverb

    // Quena armónica flotante: A4 = 432Hz
    const lfo3 = ctx.createOscillator();
    lfo3.frequency.value = 0.031;
    const lfo3G = ctx.createGain();
    lfo3G.gain.value = 3.5;
    lfo3.connect(lfo3G);

    const qflute = ctx.createOscillator();
    qflute.type = 'sine';
    qflute.frequency.value = 432;
    lfo3G.connect(qflute.detune);
    const qG = ctx.createGain();
    qG.gain.setValueAtTime(0, now);
    qG.gain.linearRampToValueAtTime(0.07, now + 7);
    qflute.connect(qG);
    qG.connect(conv);

    const allOscs = [lfo, lfo2, lfo3, ira, arka, sub, pulseOsc, qflute];
    allOscs.forEach((o) => o.start(now));

    this.oscillators = allOscs;
    this.gains = [iraG, arkaG, subG, qG, convG, dryG];
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    const now = this.ctx.currentTime;
    this.gains.forEach((g) => {
      try { g.gain.setTargetAtTime(0, now, 0.4); } catch (e) {}
    });
    this.oscillators.forEach((o) => {
      try { o.stop(now + 1.5); } catch (e) {}
    });
    this.oscillators = [];
    this.gains = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECTION APP (abre en ventana separada vía ?mode=projection)
// ═══════════════════════════════════════════════════════════════════════════════
function ProjectionApp() {
  const canvasRef = useRef(null);
  const vr0 = useRef(null); const vr1 = useRef(null);
  const vr2 = useRef(null); const vr3 = useRef(null);
  const videoRefs = [vr0, vr1, vr2, vr3];
  // Effect videos refs
  const ev0 = useRef(null); const ev1 = useRef(null);
  const ev2 = useRef(null); const ev3 = useRef(null);
  const effectVideoRefs = [ev0, ev1, ev2, ev3];

  const shadowRef = useRef(new Shadow());
  const shadowCfgRef = useRef({ opacity: 0.75 });
  const bcRef = useRef(null);
  const rafRef = useRef(null);
  const activeVidRef = useRef(-1);
  const kpsRef = useRef([]);
  const frameCountRef = useRef(0);
  const showFluidRef = useRef(false);
  const hasMotionRef = useRef(false);
  const [activeVid, setActiveVid] = useState(-1);
  const [vidSrcs, setVidSrcs] = useState([
    '/assets/videos/seasons/video_1.mp4',
    '/assets/videos/seasons/video_2.mp4',
    '/assets/videos/seasons/video_3.mp4',
    null,
  ]);
  const [vidOpacityP, setVidOpacityP] = useState(0.85);
  const [effectVidSrcs, setEffectVidSrcs] = useState([
    '/assets/videos/effects/1.mp4',
    '/assets/videos/effects/2.mp4',
    '/assets/videos/effects/3.mp4',
    '/assets/videos/effects/4.mp4',
  ]);
  const [effectActiveVid, setEffectActiveVid] = useState(-1);
  const [effectVidOpacity, setEffectVidOpacity] = useState(0.8);

  // Controla play/pause de los videos cuando cambia el activo
  useEffect(() => {
    videoRefs.forEach((ref, i) => {
      const el = ref.current;
      if (!el) return;
      if (i === activeVid) {
        el.play().catch(() => {}); // catch en caso de que no haya src aún
      } else {
        el.pause();
      }
    });
    activeVidRef.current = activeVid;
  }, [activeVid]);

  // Cuando llegan nuevas fuentes, reproduce el activo si ya está seleccionado
  useEffect(() => {
    const av = activeVidRef.current;
    if (av >= 0 && videoRefs[av]?.current && vidSrcs[av]) {
      videoRefs[av].current.play().catch(() => {});
    }
  }, [vidSrcs]);

  // Control de play/pause para effect videos
  useEffect(() => {
    effectVideoRefs.forEach((ref, i) => {
      const el = ref.current;
      if (!el) return;
      if (i === effectActiveVid) el.play().catch(() => {});
      else el.pause();
    });
  }, [effectActiveVid]);

  useEffect(() => {
    const bc = new BroadcastChannel(BC_CHANNEL);
    bcRef.current = bc;

    bc.onmessage = ({ data }) => {
      if (data.type === 'frame') {
        // Recibir posiciones ya calculadas por la ventana principal — sin física extra
        if (data.shadowPositions) {
          shadowRef.current.pos = data.shadowPositions;
          shadowRef.current.ready = data.shadowReady ?? true;
        }
        shadowCfgRef.current.opacity = data.shadowOpacity ?? shadowCfgRef.current.opacity;

        if (data.vidOpacityParallel != null) setVidOpacityP(data.vidOpacityParallel);

        const newAV = data.activeVideo ?? -1;
        if (newAV !== activeVidRef.current) {
          setActiveVid(newAV);
        }

        if (data.effectActiveVid != null) setEffectActiveVid(data.effectActiveVid);
        if (data.effectVidOpacity != null) setEffectVidOpacity(data.effectVidOpacity);

        // Datos para entidad fluida e icosaedro
        if (data.keypoints) kpsRef.current = data.keypoints;
        if (data.frameCount != null) frameCountRef.current = data.frameCount;
        if (data.showFluid != null) showFluidRef.current = data.showFluid;
        if (data.hasMotion != null) hasMotionRef.current = data.hasMotion;

      } else if (data.type === 'effectVideos') {
        const srcs = (data.files || []).map((f) => (f ? URL.createObjectURL(f) : null));
        setEffectVidSrcs(srcs);
      } else if (data.type === 'effectControl') {
        if (data.activeIdx != null) setEffectActiveVid(data.activeIdx);
        if (data.opacity != null) setEffectVidOpacity(data.opacity);
      } else if (data.type === 'videos') {
        // Recibimos los File objects y creamos ObjectURLs locales — alta calidad
        const srcs = (data.files || []).map((f) => (f ? URL.createObjectURL(f) : null));
        setVidSrcs(srcs);
      } else if (data.type === 'videoCmd') {
        // Comandos explícitos de sincronización
        const vEl = videoRefs[data.idx]?.current;
        if (!vEl) return;
        if (data.cmd === 'play') { vEl.currentTime = data.time || 0; vEl.play().catch(() => {}); }
        else if (data.cmd === 'pause') vEl.pause();
        else if (data.cmd === 'seek' && Math.abs(vEl.currentTime - data.time) > 0.5) {
          vEl.currentTime = data.time; // solo re-sincroniza si desfase > 0.5s
        }
      }
    };

    // ── Canvas overlay (resolución nativa, sin DPR) ────────────────────────
    const canvas = canvasRef.current;
    const CW = window.innerWidth;
    const CH = window.innerHeight;
    canvas.width = CW;
    canvas.height = CH;
    const ctx = canvas.getContext('2d');

    // Factor de escala: posiciones en 960×540 → pantalla completa
    const scaleX = CW / W;
    const scaleY = CH / H;

    // Anunciar al main que el paralelo está listo para recibir estado
    bc.postMessage({ type: 'ready' });

    function projLoop() {
      ctx.clearRect(0, 0, CW, CH);

      // Entidad fluida (solo flujos de energía, escalada a pantalla completa)
      if (showFluidRef.current && kpsRef.current.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.scale(scaleX, scaleY);
        const kps = kpsRef.current;
        const frame = frameCountRef.current;

        // Energy streams along skeleton
        SKELETON.forEach(([a, b]) => {
          const pa = kps[a], pb = kps[b];
          if (!pa || !pb || pa.score < CONF || pb.score < CONF) return;
          const ddx = pb.x - pa.x, ddy = pb.y - pa.y;
          const len = Math.hypot(ddx, ddy);
          if (len < 5) return;
          const nnx = -ddy / len, nny = ddx / len;
          ctx.beginPath();
          for (let s = 0; s <= 20; s++) {
            const t = s / 20;
            const bx = pa.x + ddx * t, by = pa.y + ddy * t;
            const wave = Math.sin(t * Math.PI * 3 + frame * 0.05 + a) * len * 0.06
                       + Math.sin(t * Math.PI * 5 + frame * 0.08 + b) * len * 0.03;
            const x = bx + nnx * wave, y = by + nny * wave;
            if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          const hue = (220 + frame * 0.25 + a * 12) % 360;
          const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
          grad.addColorStop(0, `hsla(${hue}, 75%, 60%, 0.45)`);
          grad.addColorStop(0.5, `hsla(${hue + 30}, 80%, 70%, 0.25)`);
          grad.addColorStop(1, `hsla(${hue + 60}, 75%, 60%, 0.45)`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.globalAlpha = 1;
          ctx.stroke();
        });

        ctx.restore();
      }

      // Dibujar sombra directo desde posiciones recibidas
      if (shadowRef.current.ready) {
        shadowRef.current.draw(ctx, {
          opacity: shadowCfgRef.current.opacity,
          color: '#7c3aed',
          scaleX,
          scaleY,
        });
      }
      rafRef.current = requestAnimationFrame(projLoop);
    }
    rafRef.current = requestAnimationFrame(projLoop);

    return () => {
      bc.close();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
      {/* Videos de estaciones — nativos, alta resolución, opacidad independiente */}
      {[0, 1, 2, 3].map((i) => (
        <video key={i} ref={videoRefs[i]}
          src={vidSrcs[i] || undefined} loop playsInline
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain',
            display: activeVid === i ? 'block' : 'none',
            opacity: vidOpacityP,
            zIndex: 1,
          }}
        />
      ))}
      {/* Videos de efectos — fondo detrás de la sombra */}
      {[ev0, ev1, ev2, ev3].map((ref, i) => (
        <video key={`e${i}`} ref={ref}
          src={effectVidSrcs[i] || undefined} loop playsInline
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain',
            display: effectActiveVid === i ? 'block' : 'none',
            opacity: effectVidOpacity,
            zIndex: 0,
          }}
        />
      ))}
      {/* Canvas overlay transparente para la sombra */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          zIndex: 2,
          pointerEvents: 'none',
          background: 'transparent',
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
function KorpSoundApp() {
  // ── Estado UI ───────────────────────────────────────────────────────────────
  const [ready, setReady] = useState(false); // AudioContext + Camera + Detector
  const [loading, setLoading] = useState('');
  const [toggles, setToggles] = useState({
    drone: false, ancestral: false, samples: false, loops: false,
    videos: false, effectVids: false, shadow: false, texts: false,
    timeline: false, parallel: false, fluid: false, bodyZones: false, hud: true, layers: false,
  });
  const [camCfg, setCamCfg] = useState({ opacity: 0.75, blend: 'normal', mirror: false });
  const [shadowCfg, setShadowCfg] = useState({
    noise: 0, opacity: 0.6, mirror: false,
  });
  const [vidSrcs, setVidSrcs] = useState([null, null, null, null]);
  const [vidFiles, setVidFiles] = useState([null, null, null, null]);
  const [activeVid, setActiveVid] = useState(-1);
  const [sampleNames, setSampleNames] = useState({
    siku: '', quena: '', bombo: '', percusion: '', charango: '',
  });
  const [loopState, setLoopState] = useState([
    { rec: false, has: false, playing: false },
    { rec: false, has: false, playing: false },
    { rec: false, has: false, playing: false },
    { rec: false, has: false, playing: false },
  ]);
  const [perfRec, setPerfRec] = useState(false);
  const [hud, setHud] = useState({ note: '—', fps: 0, effect: '—', kps: 0 });
  // Opacidad de videos de estaciones (independiente: canvas principal vs mundo paralelo)
  const [vidOpacity, setVidOpacity] = useState({ main: 0.82, parallel: 0.85 });
  // Videos de efectos — solo aparecen en mundo paralelo
  const [effectVidFiles, setEffectVidFiles] = useState([null, null, null, null]);
  const [effectVidSrcs, setEffectVidSrcs] = useState([null, null, null, null]);
  const [effectActiveVid, setEffectActiveVid] = useState(-1);
  const [effectVidOpacity, setEffectVidOpacity] = useState(0.8);
  // Volumen individual por loop (0→1)
  const [loopVolumes, setLoopVolumes] = useState([1, 1, 1, 1]);
  // Modo de video: 'full' (cubre todo el canvas) | 'split' (independiente por pantalla)
  const [vidMode, setVidMode] = useState('full');

  // ── Audio Refs ───────────────────────────────────────────────────────────────
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const mixBusRef = useRef(null);
  const droneGainRef = useRef(null);
  const droneRef = useRef(null);
  const engineRef = useRef(null);
  const loopRecordDestRef = useRef(null);
  const loopRecordersRef = useRef([null, null, null, null]);
  const loopBlobsRef = useRef([null, null, null, null]);
  const loopBuffersRef = useRef([null, null, null, null]);
  const loopSourcesRef = useRef([null, null, null, null]);
  const loopGainsRef = useRef([null, null, null, null]); // GainNode por loop para volumen en vivo
  const perfRecorderRef = useRef(null);
  const perfChunksRef = useRef([]);

  // ── Pose / Canvas Refs ────────────────────────────────────────────────────────
  const canvasRef = useRef(null);
  const camRef = useRef(null);
  const v0 = useRef(null); const v1 = useRef(null);
  const v2 = useRef(null); const v3 = useRef(null);
  const seasonRefs = [v0, v1, v2, v3];
  // Effect video refs para canvas principal
  const ev0m = useRef(null); const ev1m = useRef(null);
  const ev2m = useRef(null); const ev3m = useRef(null);
  const effectVidRefsMain = [ev0m, ev1m, ev2m, ev3m];
  const detectorRef = useRef(null);
  const kpsRef = useRef([]);
  const prevKpsRef = useRef([]);
  const motionEMARef = useRef(0); // señal de movimiento ya suavizada, usada por detectMotion
  const rafRef = useRef(null);
  const runRef = useRef(false);
  const detectingRef = useRef(false);
  const frameRef = useRef(0);
  const fpsRef = useRef({ count: 0, last: 0, val: 0 });

  // ── Visual State Refs ────────────────────────────────────────────────────────
  const shadowRef = useRef(new Shadow());
  const trailsRef = useRef([]); // estelas de luz persistentes
  // ── Layer Mixer (capas musicales con crossfade corporal) ──
  const layerAudiosRef = useRef([null, null, null, null]);
  const layerVolsRef = useRef([0, 0, 0, 0]);
  const layerNamesRef = useRef(['', '', '', '']);
  const [layerNames, setLayerNames] = useState(['—', '—', '—', '—']);
  useEffect(() => { layerNamesRef.current = layerNames; }, [layerNames]);
  const [baseLayerMax, setBaseLayerMax] = useState(0.7);
  const baseLayerMaxRef = useRef(0.7);
  useEffect(() => { baseLayerMaxRef.current = baseLayerMax; }, [baseLayerMax]);
  // ── Cualidades del movimiento (reemplaza el crossfade por sectores/altura) ──
  // Inspirado en Effort de Laban: en vez de DÓNDE está el cuerpo, mide CÓMO se mueve.
  const qualityRef = useRef({
    smoothed: {},        // {idx:{x,y}} keypoints con EMA (reduce jitter de MoveNet)
    prevSmoothed: null,  // snapshot del frame anterior, para derivadas
    vel: {},             // velocidad previa por keypoint (para aceleración/jerk/impacto)
    prevAngle: null,      // ángulo hombro-hombro del frame anterior (para rotación)
    ema: { fluidity: 0.5, rotation: 0, impact: 0, amplitude: 0.3 },
    // rangos observados por métrica, con decaimiento lento → auto-calibración en vivo
    // jerkFloor/angFloor/impFloor: por debajo de esto se ignora como jitter de MoveNet, no movimiento real.
    // *Ceil: techo semilla — crece solo ~1%/frame hacia arriba con movimiento real sostenido (no salta
    // al primer pico). Son valores de partida razonables; afínalos con el ensayo si una capa queda muy
    // sensible o muy apagada (subir el floor = más filtro de ruido, bajar el ceil = más sensible al gesto).
    range: {
      jerkFloor: 0.006, jerkCeil: 0.05,
      angFloor: 0.01, angCeil: 0.12,
      impFloor: 0.012, impCeil: 0.08,
      ampMin: 0.5, ampMax: 1.3,
    },
  });
  // Canción de efectos
  const effectSongRef = useRef(null);
  const textRef = useRef({
    idx: 0, cooldown: 0, calibration: 40, showing: false,
    elapsed: 0, duration: 420, prevKneeUp: false,
  });
  const tlRef = useRef({ idx: 0, startTime: 0 });
  const ghostRef = useRef(null);
  const vidGestRef = useRef({ leftArm: false, rightArm: false, bothArms: false, prayer: false, crossed: false });
  const prevVidGestRef = useRef({ ...vidGestRef.current });
  const vidGestCalibRef = useRef(60); // frames sin detección al activar toggle (evita activación inmediata)
  const vidLockRef = useRef({ current: -1, holdCount: 0, releaseCount: 0 });
  const effLockRef = useRef({ current: -1, holdCount: 0, releaseCount: 0 });

  // ── BroadcastChannel + parallel window ────────────────────────────────────────
  const bcRef = useRef(null);
  const parallelWinRef = useRef(null);

  // ── Toggles ref (para acceso en RAF sin stale closures) ─────────────────────
  const togglesRef = useRef(toggles);
  const camCfgRef = useRef(camCfg);
  const shadowCfgRef = useRef(shadowCfg);
  const activeVidRef = useRef(activeVid);
  const vidOpacityRef = useRef(vidOpacity);
  const effectActiveVidRef = useRef(effectActiveVid);
  const effectVidOpacityRef = useRef(effectVidOpacity);

  useEffect(() => { togglesRef.current = toggles; }, [toggles]);
  useEffect(() => { camCfgRef.current = camCfg; }, [camCfg]);
  useEffect(() => { shadowCfgRef.current = shadowCfg; }, [shadowCfg]);
  useEffect(() => { activeVidRef.current = activeVid; }, [activeVid]);
  useEffect(() => { vidOpacityRef.current = vidOpacity; }, [vidOpacity]);
  useEffect(() => { effectActiveVidRef.current = effectActiveVid; }, [effectActiveVid]);
  useEffect(() => { effectVidOpacityRef.current = effectVidOpacity; }, [effectVidOpacity]);
  const vidModeRef = useRef(vidMode);
  useEffect(() => { vidModeRef.current = vidMode; }, [vidMode]);

  // ─────────────────────────────────────────────────────────────────────────────
  // INIT: AudioContext + Camera + Detector
  // ─────────────────────────────────────────────────────────────────────────────
  const initAll = useCallback(async () => {
    if (ready) return;
    try {
      setLoading('Iniciando audio...');
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.88;
      master.connect(ctx.destination);
      masterGainRef.current = master;

      const mixBus = ctx.createGain();
      mixBus.gain.value = 1;
      mixBus.connect(master);
      mixBusRef.current = mixBus;

      const droneG = ctx.createGain();
      droneG.gain.value = 0.9;
      droneG.connect(master);
      droneGainRef.current = droneG;

      droneRef.current = new DroneEngine(ctx);
      engineRef.current = new AncestralEngine(ctx, mixBus);

      // Loop recording tap
      const loopDest = ctx.createMediaStreamDestination();
      mixBus.connect(loopDest);
      loopRecordDestRef.current = loopDest;

      // BroadcastChannel
      bcRef.current = new BroadcastChannel(BC_CHANNEL);

      setLoading('Accediendo a cámara...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      const cam = camRef.current;
      cam.srcObject = stream;
      await new Promise((res) => { cam.onloadedmetadata = res; });
      cam.play();

      setLoading('Cargando MoveNet...');
      await tf.ready();
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          modelUrl: '/models/movenet/model.json',
        }
      );
      detectorRef.current = detector;

      setLoading('');
      setReady(true);
      // Precargar samples automáticamente
      preloadSamples();
      // Precargar capas musicales
      preloadLayers();
      // Canción de efectos se maneja via ref al <audio> en JSX
      // (ver elemento hidden audio abajo)
      // Precargar videos de estaciones (3 videos)
      setVidSrcs([
        '/assets/videos/seasons/video_1.mp4',
        '/assets/videos/seasons/video_2.mp4',
        '/assets/videos/seasons/video_3.mp4',
        null,
      ]);
      // Precargar videos de efectos
      setEffectVidSrcs([
        '/assets/videos/effects/1.mp4',
        '/assets/videos/effects/2.mp4',
        '/assets/videos/effects/3.mp4',
        '/assets/videos/effects/4.mp4',
      ]);
    } catch (err) {
      setLoading('Error: ' + err.message);
    }
  }, [ready]);

  // ─────────────────────────────────────────────────────────────────────────────
  // DRONE TOGGLE
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !droneRef.current) return;
    if (toggles.drone) droneRef.current.start(droneGainRef.current);
    else droneRef.current.stop();
  }, [toggles.drone, ready]);

  // ─────────────────────────────────────────────────────────────────────────────
  // PARALLEL WINDOW
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (toggles.parallel) {
      const url = window.location.origin + window.location.pathname + '?mode=projection';
      const win = window.open(url, 'korpsound_proj', 'width=960,height=540,menubar=no,toolbar=no');
      parallelWinRef.current = win;
      // Enviar archivos de video actuales cuando el paralelo carga
      if (win) {
        win.addEventListener('load', () => {
          if (bcRef.current) {
            bcRef.current.postMessage({ type: 'videos', files: vidFiles });
          }
        });
      }
    } else {
      if (parallelWinRef.current && !parallelWinRef.current.closed) {
        parallelWinRef.current.close();
      }
      parallelWinRef.current = null;
    }
  }, [toggles.parallel]);

  // Sync video files to parallel window when they change
  useEffect(() => {
    if (bcRef.current && toggles.parallel) {
      bcRef.current.postMessage({ type: 'videos', files: vidFiles });
    }
  }, [vidFiles]);

  // El mundo paralelo anuncia cuando está listo — main responde con estado actual
  useEffect(() => {
    if (!bcRef.current) return;
    const bc = bcRef.current;
    const handleReady = ({ data }) => {
      if (data.type === 'ready') {
        bc.postMessage({ type: 'videos', files: vidFiles });
        bc.postMessage({ type: 'effectVideos', files: effectVidFiles });
        if (activeVidRef.current >= 0) {
          bc.postMessage({ type: 'videoCmd', cmd: 'play', idx: activeVidRef.current, time: 0 });
        }
      }
    };
    bc.addEventListener('message', handleReady);
    return () => bc.removeEventListener('message', handleReady);
  }, [bcRef.current, vidFiles, effectVidFiles]);

  // Sync effect video files to parallel world
  useEffect(() => {
    if (bcRef.current && toggles.parallel) {
      bcRef.current.postMessage({ type: 'effectVideos', files: effectVidFiles });
    }
  }, [effectVidFiles]);

  // Sync effect video opacity changes to parallel world
  useEffect(() => {
    if (bcRef.current && toggles.parallel) {
      bcRef.current.postMessage({ type: 'effectControl', activeIdx: effectActiveVidRef.current, opacity: effectVidOpacity });
    }
  }, [effectVidOpacity]);

  // Play/pause effect videos on main canvas
  useEffect(() => {
    effectVidRefsMain.forEach((ref, i) => {
      const el = ref.current;
      if (!el) return;
      if (i === effectActiveVid) el.play().catch(() => {});
      else el.pause();
    });
  }, [effectActiveVid, effectVidSrcs]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ANCESTRAL ENGINE ACTIVE
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (engineRef.current) engineRef.current.active = toggles.ancestral;
  }, [toggles.ancestral]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ENTIDAD FLUIDA: captura automática de estelas al desactivar
  // ─────────────────────────────────────────────────────────────────────────────
  const prevFluidRef = useRef(false);
  useEffect(() => {
    if (prevFluidRef.current && !toggles.fluid) {
      // Se acaba de desactivar → detener grabación de video
      stopTrailRecording();
    }
    if (!prevFluidRef.current && toggles.fluid) {
      // Se acaba de activar → limpiar estelas y empezar grabación
      trailsRef.current = [];
      startTrailRecording();
    }
    prevFluidRef.current = toggles.fluid;
  }, [toggles.fluid]);

  // ─────────────────────────────────────────────────────────────────────────────
  // VIDEO CALIBRATION reset al activar + reset de histéresis
  useEffect(() => {
    if (toggles.videos) {
      vidGestCalibRef.current = 60;
      vidLockRef.current = { current: -1, holdCount: 0, releaseCount: 0 };
    }
  }, [toggles.videos]);

  useEffect(() => {
    if (toggles.effectVids) {
      vidGestCalibRef.current = 60;
      effLockRef.current = { current: -1, holdCount: 0, releaseCount: 0 };
      // Reproducir canción de efectos
      if (effectSongRef.current) {
        effectSongRef.current.currentTime = 0;
        effectSongRef.current.play().catch(() => {});
      }
    } else {
      // Pausar canción
      if (effectSongRef.current) {
        effectSongRef.current.pause();
      }
    }
  }, [toggles.effectVids]);

  // TEXT CALIBRATION reset al activar
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (toggles.texts) textRef.current.calibration = 40;
  }, [toggles.texts]);

  // ─────────────────────────────────────────────────────────────────────────────
  // DETECT GESTURES
  // ─────────────────────────────────────────────────────────────────────────────
  function detectGestures(kps) {
    const lw = kp(kps, KP.lWrist);
    const rw = kp(kps, KP.rWrist);
    const ls = kp(kps, KP.lShoulder);
    const rs = kp(kps, KP.rShoulder);
    const lk = kp(kps, KP.lKnee);
    const rk = kp(kps, KP.rKnee);
    const lh = kp(kps, KP.lHip);
    const rh = kp(kps, KP.rHip);

    const leftArm = !!(lw && ls && lw.y < ls.y - 55);
    const rightArm = !!(rw && rs && rw.y < rs.y - 55);
    const bothArms = leftArm && rightArm;

    let prayer = false;
    if (lw && rw) {
      const dist = Math.hypot(lw.x - rw.x, lw.y - rw.y);
      prayer = dist < 65;
    }

    let crossed = false;
    if (lw && rw && ls && rs) {
      const cx = (ls.x + rs.x) / 2;
      const cDist = Math.abs(lw.x - rw.x);
      const cY = (lw.y + rw.y) / 2;
      const sY = (ls.y + rs.y) / 2;
      crossed = cDist < 110 && cY < sY + 80 && Math.abs((lw.x + rw.x) / 2 - cx) < 70;
    }

    let kneeUp = false;
    if (lk && lh) kneeUp = kneeUp || lk.y < lh.y - 30;
    if (rk && rh) kneeUp = kneeUp || rk.y < rh.y - 30;

    return { leftArm, rightArm, bothArms, prayer, crossed, kneeUp };
  }

  function detectMotion(kps) {
    const prev = prevKpsRef.current;
    if (!prev.length) return false;
    let total = 0; let count = 0;
    kps.forEach((k, i) => {
      const p = prev[i];
      if (k && p && k.score >= CONF && p.score >= CONF) {
        total += Math.hypot((k.x - p.x) / W, (k.y - p.y) / H);
        count++;
      }
    });
    const raw = count > 0 ? total / count : 0;
    // Suaviza la señal antes de compararla: un solo frame de jitter (estando quieto)
    // ya no alcanza a cruzar el umbral, solo el movimiento sostenido lo hace.
    motionEMARef.current += (raw - motionEMARef.current) * 0.4;
    return motionEMARef.current > 0.018;
  }

  // Calcula 4 cualidades de movimiento (0–1 cada una) a partir de los keypoints.
  // fluidity  = sinuosidad de las muñecas (inverso del jerk: alto = trayectoria continua)
  // rotation  = giro del torso (velocidad angular del eje hombro-hombro)
  // impact    = picos de aceleración en muñecas/tobillos (gestos súbitos, staccato)
  // amplitude = expansión/contracción del cuerpo respecto a su propio centro
  function computeMovementQualities(kps) {
    const q = qualityRef.current;
    const ls = kp(kps, KP.lShoulder), rs = kp(kps, KP.rShoulder);

    if (!ls || !rs) {
      // Sin ni siquiera los hombros visibles: no hay ninguna referencia de escala posible
      q.ema.fluidity *= 0.95; q.ema.rotation *= 0.9;
      q.ema.impact *= 0.85; q.ema.amplitude *= 0.95;
      q.debug = { status: 'SIN HOMBROS detectados (nada puede calcularse)' };
      return q.ema;
    }

    const lh = kp(kps, KP.lHip), rh = kp(kps, KP.rHip);
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };

    // Referencia de escala corporal: si hay caderas visibles, usa hombro-cadera (más precisa).
    // Si el encuadre es de medio cuerpo y las caderas no se detectan de forma confiable
    // (muy común en cámara de VJ), usa el ancho de hombros como aproximación — así el sistema
    // sigue funcionando con solo la parte superior del cuerpo en cuadro, en vez de quedarse mudo.
    let torsoRef;
    if (lh && rh) {
      const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
      torsoRef = Math.max(20, Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y));
    } else {
      const shoulderW = Math.hypot(rs.x - ls.x, rs.y - ls.y);
      torsoRef = Math.max(20, shoulderW * 1.4); // proporción típica hombro-cadera ≈ 1.4x el ancho de hombros
    }

    // EMA sobre keypoints válidos: suaviza el jitter de MoveNet antes de derivar
    const SMOOTH = 0.35;
    kps.forEach((k, i) => {
      if (!k || k.score < CONF) return;
      const s = q.smoothed[i];
      if (!s) q.smoothed[i] = { x: k.x, y: k.y };
      else { s.x += (k.x - s.x) * SMOOTH; s.y += (k.y - s.y) * SMOOTH; }
    });
    const sm = q.smoothed;

    if (!q.prevSmoothed) {
      const snap = {};
      for (const i in sm) snap[i] = { x: sm[i].x, y: sm[i].y };
      q.prevSmoothed = snap;
      q.prevAngle = Math.atan2(rs.y - ls.y, rs.x - ls.x);
      q.debug = { status: `hombros OK, caderas ${lh && rh ? 'OK' : 'no vistas (usando aprox.)'} — calibrando...`, torsoRef };
      return q.ema; // primer frame útil: aún no hay derivadas que calcular
    }
    const prev = q.prevSmoothed;

    // ── 1. FLUIDEZ / SINUOSIDAD — inverso del jerk promedio de las muñecas ──
    let jerkSum = 0, jerkN = 0;
    [KP.lWrist, KP.rWrist].forEach((i) => {
      const p = sm[i], pp = prev[i];
      if (!p || !pp) return;
      const v = { x: p.x - pp.x, y: p.y - pp.y };
      const pv = q.vel[i] || v;
      const a = { x: v.x - pv.x, y: v.y - pv.y };
      const pa = q.vel[`a${i}`] || a;
      const j = { x: a.x - pa.x, y: a.y - pa.y };
      jerkSum += Math.hypot(j.x, j.y) / torsoRef;
      jerkN++;
      q.vel[i] = v;
      q.vel[`a${i}`] = a;
    });
    const jerk = jerkN ? jerkSum / jerkN : 0;
    // Piso de ruido: por debajo de esto se considera temblor de MoveNet, no movimiento real → señal 0.
    // Techo: NO salta al pico instantáneo (eso era el bug — un solo salto de ruido se leía como "máximo
    // absoluto" y por lo tanto como 1.0). Ahora solo crece un 1%/frame hacia arriba, así que un pico de
    // un solo frame casi no lo mueve; solo el movimiento real y sostenido termina estirando el techo.
    const jerkSignal = Math.max(0, jerk - q.range.jerkFloor);
    if (jerkSignal > q.range.jerkCeil) q.range.jerkCeil += (jerkSignal - q.range.jerkCeil) * 0.01;
    else q.range.jerkCeil *= 0.999;
    const fluidityTarget = 1 - Math.min(1, jerkSignal / q.range.jerkCeil);
    q.ema.fluidity += (fluidityTarget - q.ema.fluidity) * 0.15;

    // ── 2. ROTACIÓN / GIRO — velocidad angular del eje hombro-hombro ──
    const angle = Math.atan2(rs.y - ls.y, rs.x - ls.x);
    let dAngle = angle - q.prevAngle;
    if (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    if (dAngle < -Math.PI) dAngle += 2 * Math.PI; // camino más corto entre ángulos (evita saltos de 2π)
    const angVel = Math.abs(dAngle);
    const angSignal = Math.max(0, angVel - q.range.angFloor);
    if (angSignal > q.range.angCeil) q.range.angCeil += (angSignal - q.range.angCeil) * 0.01;
    else q.range.angCeil *= 0.999;
    const rotationTarget = Math.min(1, angSignal / q.range.angCeil);
    q.ema.rotation += (rotationTarget - q.ema.rotation) * 0.2;
    q.prevAngle = angle;

    // ── 3. IMPACTO / PESO — pico de aceleración en muñecas y tobillos ──
    let peak = 0;
    [KP.lWrist, KP.rWrist, KP.lAnkle, KP.rAnkle].forEach((i) => {
      const p = sm[i], pp = prev[i];
      if (!p || !pp) return;
      const v = { x: p.x - pp.x, y: p.y - pp.y };
      const pv = q.vel[`i${i}`] || v;
      const mag = Math.hypot(v.x - pv.x, v.y - pv.y) / torsoRef;
      if (mag > peak) peak = mag;
      q.vel[`i${i}`] = v;
    });
    const peakSignal = Math.max(0, peak - q.range.impFloor);
    if (peakSignal > q.range.impCeil) q.range.impCeil += (peakSignal - q.range.impCeil) * 0.01;
    else q.range.impCeil *= 0.999;
    const impactTarget = Math.min(1, Math.pow(peakSignal / q.range.impCeil, 2)); // no-lineal: enfatiza picos súbitos
    // Envolvente percusiva: ataque instantáneo, caída lenta (como el release de un sinte).
    // Ahora que peakSignal ya descontó el piso de ruido, un temblor en reposo da peakSignal≈0
    // y por lo tanto no produce ataque — el ataque instantáneo solo ocurre ante un pico real.
    q.ema.impact = Math.max(impactTarget, q.ema.impact * 0.85);

    // ── 4. AMPLITUD — expansión/contracción respecto al centro del torso ──
    const limbs = [KP.lWrist, KP.rWrist, KP.lElbow, KP.rElbow, KP.lAnkle, KP.rAnkle, KP.lKnee, KP.rKnee];
    let distSum = 0, distN = 0;
    limbs.forEach((i) => {
      const p = sm[i];
      if (!p) return;
      distSum += Math.hypot(p.x - shoulderMid.x, p.y - shoulderMid.y);
      distN++;
    });
    const ampRatio = distN ? (distSum / distN) / torsoRef : q.range.ampMin;
    // Rango adaptativo (min/max observados), con decaimiento lento → se recalibra solo en vivo
    q.range.ampMax = Math.max(ampRatio, q.range.ampMax * 0.999);
    q.range.ampMin = Math.min(ampRatio, q.range.ampMin * 1.0005 + 0.0002);
    const span = Math.max(0.2, q.range.ampMax - q.range.ampMin);
    const amplitudeTarget = Math.max(0, Math.min(1, (ampRatio - q.range.ampMin) / span));
    q.ema.amplitude += (amplitudeTarget - q.ema.amplitude) * 0.12;

    const snap = {};
    for (const i in sm) snap[i] = { x: sm[i].x, y: sm[i].y };
    q.prevSmoothed = snap;

    q.debug = {
      status: `hombros OK, caderas ${lh && rh ? 'OK' : 'no vistas (usando aprox.)'}`,
      torsoRef,
      jerk, jerkSignal, jerkCeil: q.range.jerkCeil,
      angVel, angSignal, angCeil: q.range.angCeil,
      peak, peakSignal, impCeil: q.range.impCeil,
      ampRatio, ampMin: q.range.ampMin, ampMax: q.range.ampMax,
    };

    return q.ema;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DRAW FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  function drawCamera(ctx) {
    const cam = camRef.current;
    if (!cam || !cam.videoWidth) return;
    ctx.save();
    ctx.globalAlpha = camCfgRef.current.opacity;
    ctx.globalCompositeOperation = camCfgRef.current.blend;
    if (camCfgRef.current.mirror) {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(cam, 0, 0, W, H);
    ctx.restore();
  }

  function drawSeasonVideo(ctx) {
    const idx = activeVidRef.current;
    if (idx < 0 || idx > 3) return;
    const vEl = seasonRefs[idx]?.current;
    if (!vEl || !vEl.readyState || vEl.readyState < 2) return;
    ctx.save();
    ctx.globalAlpha = vidOpacityRef.current.main;
    ctx.drawImage(vEl, 0, 0, W, H);
    ctx.restore();
  }

  function drawEffectVideo(ctx) {
    const idx = effectActiveVidRef.current;
    if (idx < 0 || idx > 3) return;
    const vEl = effectVidRefsMain[idx]?.current;
    if (!vEl || !vEl.readyState || vEl.readyState < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = effectVidOpacityRef.current;
    ctx.drawImage(vEl, 0, 0, W, H);
    ctx.restore();
  }

  // Keypoints que dejan estela (extremidades que dibujan en el espacio)
  const TRAIL_KPS = [KP.nose, KP.lWrist, KP.rWrist, KP.lElbow, KP.rElbow, KP.lAnkle, KP.rAnkle];
  const TRAIL_MAX_AGE = 300; // ~5 segundos a 60fps

  function drawFluidEntity(ctx, kps, frame) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // ── Estelas de luz: registrar posiciones actuales ──
    const trails = trailsRef.current;
    TRAIL_KPS.forEach((kpIdx) => {
      const k = kps[kpIdx];
      if (k && k.score >= CONF) {
        trails.push({ kpIdx, x: k.x, y: k.y, frame });
      }
    });
    // Limpiar puntos viejos + limitar buffer total
    while (trails.length > 0 && frame - trails[0].frame > TRAIL_MAX_AGE) {
      trails.shift();
    }
    while (trails.length > 1500) trails.shift(); // cap de memoria

    // ── Dibujar estelas: líneas que se desvanecen ──
    // Agrupar por keypoint para dibujar líneas continuas
    const byKp = {};
    trails.forEach((pt) => {
      if (!byKp[pt.kpIdx]) byKp[pt.kpIdx] = [];
      byKp[pt.kpIdx].push(pt);
    });

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    Object.entries(byKp).forEach(([kpIdx, pts]) => {
      if (pts.length < 2) return;
      const hueBase = (200 + parseInt(kpIdx) * 28) % 360;

      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        // Solo conectar puntos consecutivos (no saltar gaps grandes)
        if (curr.frame - prev.frame > 3) continue;

        const age = frame - curr.frame;
        const life = 1 - age / TRAIL_MAX_AGE; // 1 = nuevo, 0 = por desaparecer
        if (life <= 0) continue;

        const alpha = life * life * 0.7; // desvanecimiento cuadrático
        const hue = (hueBase + age * 0.15) % 360;

        // Glow suave
        ctx.globalAlpha = alpha * 0.2;
        ctx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();

        // Línea core
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `hsl(${hue}, 80%, 75%)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });

    // ── Flujos de energía a lo largo del esqueleto (en tiempo real) ──
    ctx.globalAlpha = 1;
    SKELETON.forEach(([a, b]) => {
      const pa = kps[a], pb = kps[b];
      if (!pa || !pb || pa.score < CONF || pb.score < CONF) return;

      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const len = Math.hypot(dx, dy);
      if (len < 5) return;
      const nx = -dy / len, ny = dx / len;

      const segs = 20;
      ctx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const bx = pa.x + dx * t;
        const by = pa.y + dy * t;
        const wave = Math.sin(t * Math.PI * 3 + frame * 0.05 + a) * len * 0.06
                   + Math.sin(t * Math.PI * 5 + frame * 0.08 + b) * len * 0.03;
        const x = bx + nx * wave;
        const y = by + ny * wave;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      const hue = (220 + frame * 0.25 + a * 12) % 360;
      const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      grad.addColorStop(0, `hsla(${hue}, 75%, 60%, 0.45)`);
      grad.addColorStop(0.5, `hsla(${hue + 30}, 80%, 70%, 0.25)`);
      grad.addColorStop(1, `hsla(${hue + 60}, 75%, 60%, 0.45)`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 1;
      ctx.stroke();
    });

    ctx.restore();
  }

  function drawBodyZones(ctx, kps, frame) {
    const COLORS = ['#ff0040', '#ff8800', '#ffe600', '#00ff88', '#0088ff', '#cc00ff'];
    const ZONES = [
      [KP.lShoulder, KP.rShoulder, KP.rHip, KP.lHip],
      [KP.lShoulder, KP.lElbow, KP.lWrist],
      [KP.rShoulder, KP.rElbow, KP.rWrist],
      [KP.lHip, KP.lKnee, KP.lAnkle],
      [KP.rHip, KP.rKnee, KP.rAnkle],
      [KP.nose, KP.lShoulder, KP.rShoulder],
    ];
    ctx.save();
    ZONES.forEach((zone, zi) => {
      const pts = zone.map((i) => kps[i]).filter((k) => k && k.score >= CONF);
      if (pts.length < 2) return;
      const alpha = 0.45 + 0.25 * Math.sin(frame * 0.04 + zi * 1.1);
      ctx.strokeStyle = COLORS[zi % COLORS.length];
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';

      // Main stroke
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      // Afterimage
      ctx.globalAlpha = alpha * 0.18;
      ctx.lineWidth = 14;
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawTexts(ctx, kps) {
    const ts = textRef.current;
    if (!ts.showing) return;

    // Timing: 60 frames entrada + 300 frames sostener + 60 frames desvanecimiento
    const GROW = 60, HOLD = 300, FADE = 60;
    const e = ts.elapsed;
    let scale, alpha;

    if (e < GROW) {
      // Entrada suave: easeOutCubic (0.3 → 1.2)
      const t = e / GROW;
      const ease = 1 - Math.pow(1 - t, 3);
      scale = 0.3 + ease * 0.9;
      alpha = ease;
    } else if (e < GROW + HOLD) {
      // Sostener: escala fija, opacidad plena
      scale = 1.2;
      alpha = 1;
    } else {
      // Desvanecimiento lento
      const t = (e - GROW - HOLD) / FADE;
      scale = 1.2;
      alpha = Math.max(0, 1 - t);
    }

    if (alpha <= 0.01) return;

    // Centro: torso de Mariana, fallback al canvas
    let originX = W / 2, originY = H / 2;
    const ls = kps ? kp(kps, KP.lShoulder) : null;
    const rs = kps ? kp(kps, KP.rShoulder) : null;
    const lh = kps ? kp(kps, KP.lHip) : null;
    const rh = kps ? kp(kps, KP.rHip) : null;
    const bodyPts = [ls, rs, lh, rh].filter(Boolean);
    if (bodyPts.length >= 2) {
      originX = bodyPts.reduce((s, p) => s + p.x, 0) / bodyPts.length;
      originY = bodyPts.reduce((s, p) => s + p.y, 0) / bodyPts.length;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(originX, originY);
    ctx.scale(scale, scale);
    ctx.font = '300 42px Georgia, serif'; // peso light, elegante
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(TEXTS[ts.idx], 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillText(TEXTS[ts.idx], 0, 0);
    ctx.restore();
  }

  function applyTimelineEffect(ctx, canvas, now) {
    const tl = tlRef.current;
    const CYCLE = 5; // segundos por efecto
    const EFFECTS = [
      'kaleidoscope', 'ghost', 'hue_shift', 'mirror_v', 'contrast',
      'double_mirror', 'invert', 'sepia', 'zoom_echo', 'blur_ghost', 'rgb_shift',
    ];

    if (!tl.startTime) tl.startTime = now;
    const elapsed = (now - tl.startTime) / 1000;
    tl.idx = Math.floor(elapsed / CYCLE) % EFFECTS.length;
    const effect = EFFECTS[tl.idx];

    try {
      if (effect === 'ghost') {
        if (ghostRef.current) {
          ctx.save(); ctx.globalAlpha = 0.38;
          ctx.drawImage(ghostRef.current, 0, 0, W, H);
          ctx.restore();
        }
        createImageBitmap(canvas).then((bmp) => { ghostRef.current = bmp; });

      } else if (effect === 'kaleidoscope') {
        const half = document.createElement('canvas');
        half.width = W / 2; half.height = H;
        half.getContext('2d').drawImage(canvas, 0, 0, W / 2, H, 0, 0, W / 2, H);
        ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
        ctx.drawImage(half, 0, 0, W / 2, H); ctx.restore();

      } else if (effect === 'mirror_v') {
        // Mirror vertical (top half reflected)
        const half = document.createElement('canvas');
        half.width = W; half.height = H / 2;
        half.getContext('2d').drawImage(canvas, 0, 0, W, H / 2, 0, 0, W, H / 2);
        ctx.save(); ctx.translate(0, H); ctx.scale(1, -1);
        ctx.drawImage(half, 0, 0, W, H / 2); ctx.restore();

      } else if (effect === 'double_mirror') {
        // Mirror both axes (quadrant reflection)
        const q = document.createElement('canvas');
        q.width = W / 2; q.height = H / 2;
        q.getContext('2d').drawImage(canvas, 0, 0, W / 2, H / 2, 0, 0, W / 2, H / 2);
        ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
        ctx.drawImage(q, 0, 0, W / 2, H / 2); ctx.restore();
        ctx.save(); ctx.translate(0, H); ctx.scale(1, -1);
        ctx.drawImage(canvas, 0, 0, W, H / 2, 0, 0, W, H / 2); ctx.restore();

      } else if (effect === 'invert') {
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        const tCtx = tmp.getContext('2d');
        tCtx.filter = 'invert(1)';
        tCtx.drawImage(canvas, 0, 0);
        ctx.drawImage(tmp, 0, 0, W, H);

      } else if (effect === 'hue_shift') {
        // Rotating hue via CSS filter (GPU-accelerated)
        const deg = (elapsed * 40) % 360;
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        const tCtx = tmp.getContext('2d');
        tCtx.filter = `hue-rotate(${deg}deg) saturate(1.3)`;
        tCtx.drawImage(canvas, 0, 0);
        ctx.drawImage(tmp, 0, 0, W, H);

      } else if (effect === 'contrast') {
        // High contrast + slight saturation
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        const tCtx = tmp.getContext('2d');
        tCtx.filter = 'contrast(1.8) saturate(1.5)';
        tCtx.drawImage(canvas, 0, 0);
        ctx.drawImage(tmp, 0, 0, W, H);

      } else if (effect === 'sepia') {
        const tmp = document.createElement('canvas');
        tmp.width = W; tmp.height = H;
        const tCtx = tmp.getContext('2d');
        tCtx.filter = 'sepia(0.8) contrast(1.2)';
        tCtx.drawImage(canvas, 0, 0);
        ctx.drawImage(tmp, 0, 0, W, H);

      } else if (effect === 'blur_ghost') {
        // Ghost + blur combination
        if (ghostRef.current) {
          ctx.save(); ctx.globalAlpha = 0.5; ctx.filter = 'blur(3px)';
          ctx.drawImage(ghostRef.current, 0, 0, W, H);
          ctx.restore();
        }
        createImageBitmap(canvas).then((bmp) => { ghostRef.current = bmp; });

      } else if (effect === 'zoom_echo') {
        // Scaled duplicate overlay (echo effect)
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.globalCompositeOperation = 'screen';
        const s = 1.15 + Math.sin(elapsed * 2) * 0.05;
        ctx.translate(W / 2, H / 2);
        ctx.scale(s, s);
        ctx.translate(-W / 2, -H / 2);
        ctx.drawImage(canvas, 0, 0, W, H);
        ctx.restore();

      } else if (effect === 'rgb_shift') {
        // RGB channel offset (lightweight via composite operations)
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.4;
        // Red channel shifted left
        ctx.drawImage(canvas, -4, 0, W, H);
        // Blue channel shifted right
        ctx.globalAlpha = 0.3;
        ctx.drawImage(canvas, 4, 2, W, H);
        ctx.restore();
      }
    } catch (e) {}

    return EFFECTS[tl.idx];
  }

  function drawHUD(ctx, kps, fps, note, effect) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(8, 8, 200, 70);
    ctx.fillStyle = '#d4a853';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`FPS: ${fps}`, 16, 24);
    ctx.fillText(`Note: ${note}`, 16, 40);
    ctx.fillText(`Effect: ${effect}`, 16, 56);
    const nKps = kps.filter((k) => k && k.score >= CONF).length;
    ctx.fillText(`KPs: ${nKps}/17`, 16, 72);
    ctx.restore();
  }

  // Panel de diagnóstico temporal para "Capas musicales": muestra los números crudos
  // (no interpretados) de las 4 cualidades y el estado real del audio de cada capa.
  // Objetivo: ver con evidencia qué pasa, en vez de adivinar desde el código.
  function drawQualityDebug(ctx) {
    const d = qualityRef.current.debug;
    const vols = layerVolsRef.current;
    const audios = layerAudiosRef.current;
    const names = layerNamesRef.current;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(8, H - 210, 430, 202);
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    let y = H - 195;
    const line = (txt, color = '#9ef') => { ctx.fillStyle = color; ctx.fillText(txt, 16, y); y += 14; };

    line('── DEBUG: Capas musicales ──', '#d4a853');
    if (!d) {
      line('esperando primer frame de pose...', '#f88');
    } else if (!d.torsoRef) {
      line(d.status, '#f88');
    } else {
      line(d.status);
      line(`torsoRef: ${d.torsoRef.toFixed(1)}px`);
      if (d.jerk != null) {
        line(`fluidez  | jerk=${d.jerk.toFixed(4)} señal=${d.jerkSignal.toFixed(4)} techo=${d.jerkCeil.toFixed(4)}`);
        line(`rotación | angVel=${d.angVel.toFixed(4)} señal=${d.angSignal.toFixed(4)} techo=${d.angCeil.toFixed(4)}`);
        line(`impacto  | peak=${d.peak.toFixed(4)} señal=${d.peakSignal.toFixed(4)} techo=${d.impCeil.toFixed(4)}`);
        line(`amplitud | ratio=${d.ampRatio.toFixed(3)} min=${d.ampMin.toFixed(3)} max=${d.ampMax.toFixed(3)}`);
      } else {
        line('calibrando derivadas (necesita 2do frame)...', '#fc8');
      }
    }

    y += 4;
    line('── Volumen aplicado por capa ──', '#d4a853');
    for (let i = 0; i < 4; i++) {
      const a = audios[i];
      const loaded = a ? 'CARGADO' : 'NO CARGADO (revisar archivo/ruta)';
      const vol = a ? a.volume.toFixed(2) : '—';
      const paused = a ? (a.paused ? 'PAUSADO' : 'sonando') : '—';
      line(`Capa ${i} (${names[i] || '—'}): vol.target=${vols[i].toFixed(2)} | audio=${loaded} | vol.real=${vol} | ${paused}`,
        a ? '#9f9' : '#f88');
    }
    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN RAF LOOP (sync render a 60fps, detección async desacoplada)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    runRef.current = true;

    // ── Canvas setup (resolución nativa, sin DPR para reducir carga GPU) ───
    const canvas = canvasRef.current;
    canvas.width = W;
    canvas.height = H;

    const EFFECTS_LABEL = ['Caleidoscopio', 'Ghost', 'Invertido', 'Solarización'];
    let currentEffect = '—';

    // ── Detección async desacoplada: nunca bloquea el render ────────────────
    function runDetection() {
      if (!runRef.current || detectingRef.current) return;
      const cam = camRef.current;
      if (!cam || cam.readyState < 2 || !detectorRef.current) return;
      detectingRef.current = true;
      detectorRef.current.estimatePoses(cam).then((poses) => {
        if (poses && poses[0]) {
          const vW = cam.videoWidth || 1;
          const vH = cam.videoHeight || 1;
          kpsRef.current = poses[0].keypoints.map((k) => ({
            x: k.x * W / vW,
            y: k.y * H / vH,
            score: k.score || 0,
          }));
        }
        detectingRef.current = false;
        if (runRef.current) runDetection(); // lanzar siguiente detección inmediata
      }).catch(() => { detectingRef.current = false; });
    }
    runDetection(); // arrancar pipeline de detección

    // ── Render loop síncrono a 60fps ────────────────────────────────────────
    function loop(now) {
      if (!runRef.current) return;

      const ctx = canvas.getContext('2d');
      const t = togglesRef.current;

      // FPS
      fpsRef.current.count++;
      if (now - fpsRef.current.last >= 1000) {
        fpsRef.current.val = fpsRef.current.count;
        fpsRef.current.count = 0;
        fpsRef.current.last = now;
      }

      // Usar últimos keypoints disponibles (nunca bloqueamos)
      const kps = kpsRef.current;
      const gest = detectGestures(kps);
      const hasMotion = detectMotion(kps);
      prevKpsRef.current = kps;

      // Ancestral engine
      if (t.ancestral && engineRef.current) {
        engineRef.current.tick(kps, hasMotion);
      }

      // Layer mixer: crossfade por CUALIDADES DEL MOVIMIENTO (no por sectores/altura)
      if (t.layers) {
        const mq = computeMovementQualities(kps);

        // Mapeo cualidad → capa (ajustable: solo hay que reordenar este array)
        // Capa 0 (base/ambiental)  ← Fluidez / Sinuosidad   (movimiento continuo, sin quiebres)
        // Capa 1 (melódica)       ← Amplitud                (expansión-contracción del cuerpo)
        // Capa 2 (rítmica)        ← Impacto / Peso          (picos súbitos, staccato)
        // Capa 3 (textural)       ← Rotación / Giro         (torsión del torso)
        const targets = [
          mq.fluidity * baseLayerMaxRef.current, // el slider "base" sigue limitando esta capa
          mq.amplitude,
          mq.impact,
          mq.rotation,
        ];

        // Smooth follow: cada capa sigue su objetivo a su propia velocidad.
        // La rítmica (impacto) sigue más rápido para no perder el filo percusivo;
        // las demás ya vienen suavizadas por EMA dentro de computeMovementQualities.
        const followRate = [0.05, 0.06, 0.18, 0.08];
        const vols = layerVolsRef.current;
        const audios = layerAudiosRef.current;
        for (let i = 0; i < 4; i++) {
          vols[i] += (targets[i] - vols[i]) * followRate[i];
          if (audios[i]) audios[i].volume = Math.max(0, Math.min(1, vols[i]));
        }
      }

      // Shadow update
      if (t.shadow) {
        shadowRef.current.update(kps, {
          mirror: shadowCfgRef.current.mirror,
          noise: shadowCfgRef.current.noise,
        });
      }

      // Texts
      if (t.texts) {
        const ts = textRef.current;
        if (ts.calibration > 0) {
          ts.calibration--;
        } else {
          if (ts.cooldown > 0) ts.cooldown--;
          if (gest.kneeUp && !ts.prevKneeUp && ts.cooldown === 0) {
            ts.showing = true;
            ts.elapsed = 0;
            ts.cooldown = 90;
          }
          ts.prevKneeUp = gest.kneeUp;
          if (ts.showing) {
            ts.elapsed++;
            if (ts.elapsed >= ts.duration) {
              ts.showing = false;
              ts.idx = (ts.idx + 1) % TEXTS.length;
            }
          }
        }
      }

      // Video gesture con histéresis: anti-titileo
      // Decrementar calibración cuando cualquier toggle de video está activo
      if ((t.videos || t.effectVids) && vidGestCalibRef.current > 0) {
        vidGestCalibRef.current--;
      }

      if (t.videos && vidGestCalibRef.current <= 0) {
          const ACTIVATE_FRAMES = 8;   // frames para confirmar activación
          const RELEASE_FRAMES = 20;    // frames para confirmar desactivación
          const lock = vidLockRef.current;

          // Determinar target según gesto actual
          let targetVid = -1;
          if (gest.crossed) {
            targetVid = -1;
          } else if (gest.bothArms) {
            targetVid = 0;
          } else if (gest.prayer) {
            targetVid = 2;
          } else if (gest.rightArm && !gest.bothArms) {
            targetVid = 1;
          }

          if (targetVid === lock.current) {
            // Estable: mismo video que el actual, limpiar contadores
            lock.holdCount = 0;
            lock.releaseCount = 0;
          } else {
            // Quiere cambiar
            if (targetVid >= 0 && lock.current < 0) {
              // Activar: contar frames consistentes
              lock.holdCount++;
              lock.releaseCount = 0;
              if (lock.holdCount >= ACTIVATE_FRAMES) {
                lock.current = targetVid;
                lock.holdCount = 0;
                seasonRefs.forEach((r, j) => { if (j !== targetVid && r.current) r.current.pause(); });
                setActiveVid(targetVid);
                seasonRefs[targetVid]?.current?.play();
                if (t.parallel && bcRef.current) {
                  bcRef.current.postMessage({ type: 'videoCmd', cmd: 'play', idx: targetVid, time: 0 });
                }
              }
            } else if (targetVid < 0 && lock.current >= 0) {
              // Desactivar: requiere más frames para ser estable
              lock.releaseCount++;
              lock.holdCount = 0;
              if (lock.releaseCount >= RELEASE_FRAMES) {
                lock.current = -1;
                lock.releaseCount = 0;
                setActiveVid(-1);
                seasonRefs.forEach((r) => { if (r.current) r.current.pause(); });
              }
            } else if (targetVid >= 0 && lock.current >= 0 && targetVid !== lock.current) {
              // Cambiar entre videos: igual que activar
              lock.holdCount++;
              lock.releaseCount = 0;
              if (lock.holdCount >= ACTIVATE_FRAMES) {
                lock.current = targetVid;
                lock.holdCount = 0;
                seasonRefs.forEach((r, j) => { if (j !== targetVid && r.current) r.current.pause(); });
                setActiveVid(targetVid);
                seasonRefs[targetVid]?.current?.play();
                if (t.parallel && bcRef.current) {
                  bcRef.current.postMessage({ type: 'videoCmd', cmd: 'play', idx: targetVid, time: 0 });
                }
              }
            }
          }
        }

      // Effect video gesture (mismos gestos, control independiente)
      if (t.effectVids && !t.videos) {
        if (vidGestCalibRef.current <= 0) {
          const ACTIVATE_EF = 8;
          const RELEASE_EF = 20;
          const eLock = effLockRef.current;

          let targetEf = -1;
          if (gest.crossed) {
            targetEf = -1;
          } else if (gest.bothArms) {
            targetEf = 2;
          } else if (gest.prayer) {
            targetEf = 3;
          } else if (gest.rightArm && !gest.bothArms) {
            targetEf = 1;
          } else if (gest.leftArm && !gest.bothArms) {
            targetEf = 0;
          }

          if (targetEf === eLock.current) {
            eLock.holdCount = 0;
            eLock.releaseCount = 0;
          } else if (targetEf >= 0 && eLock.current < 0) {
            eLock.holdCount++;
            eLock.releaseCount = 0;
            if (eLock.holdCount >= ACTIVATE_EF) {
              eLock.current = targetEf;
              eLock.holdCount = 0;
              setEffectActiveVid(targetEf);
            }
          } else if (targetEf < 0 && eLock.current >= 0) {
            eLock.releaseCount++;
            eLock.holdCount = 0;
            if (eLock.releaseCount >= RELEASE_EF) {
              eLock.current = -1;
              eLock.releaseCount = 0;
              setEffectActiveVid(-1);
            }
          } else if (targetEf >= 0 && eLock.current >= 0 && targetEf !== eLock.current) {
            eLock.holdCount++;
            eLock.releaseCount = 0;
            if (eLock.holdCount >= ACTIVATE_EF) {
              eLock.current = targetEf;
              eLock.holdCount = 0;
              setEffectActiveVid(targetEf);
            }
          }
        }
      }

      // ── DRAW ──────────────────────────────────────────────────────────────
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, H);

      if (t.videos) drawSeasonVideo(ctx);
      drawCamera(ctx);

      if (t.fluid) {
        drawFluidEntity(ctx, kps, frameRef.current);
        renderTrailFrame(frameRef.current); // grabar frame de estelas
      }
      if (t.bodyZones) drawBodyZones(ctx, kps, frameRef.current);
      if (t.shadow) {
        shadowRef.current.draw(ctx, {
          opacity: shadowCfgRef.current.opacity,
          color: '#7c3aed',
        });
      }
      if (t.texts) drawTexts(ctx, kps);

      if (t.timeline) {
        applyTimelineEffect(ctx, canvas, now);
        currentEffect = EFFECTS_LABEL[tlRef.current.idx];
      }

      if (t.hud) {
        drawHUD(
          ctx, kps, fpsRef.current.val,
          engineRef.current?.lastInstr || '—',
          t.timeline ? currentEffect : '—'
        );
      }
      ctx.restore();

      // Panel de diagnóstico temporal: mientras afinamos Capas musicales, se ve solo con ese toggle activo
      if (t.layers) drawQualityDebug(ctx);

      // ── Broadcast a ventana paralela ──────────────────────────────────────
      if (t.parallel && bcRef.current) {
        const sc = shadowCfgRef.current;
        const av = activeVidRef.current;
        const msg = {
          type: 'frame',
          shadowPositions: shadowRef.current.ready ? shadowRef.current.pos : null,
          shadowReady: shadowRef.current.ready,
          activeVideo: av,
          shadowMirror: sc.mirror,
          shadowNoise: sc.noise,
          shadowOpacity: sc.opacity,
          vidOpacityParallel: vidOpacityRef.current.parallel,
          effectActiveVid: effectActiveVidRef.current,
          effectVidOpacity: effectVidOpacityRef.current,
          // Datos para renderizado de entidad fluida en paralelo
          keypoints: kps,
          frameCount: frameRef.current,
          showFluid: t.fluid,
          hasMotion,
        };
        bcRef.current.postMessage(msg);

        if (frameRef.current % 60 === 0 && av >= 0 && seasonRefs[av]?.current) {
          bcRef.current.postMessage({
            type: 'videoCmd',
            cmd: 'seek',
            idx: av,
            time: seasonRefs[av].current.currentTime,
          });
        }
      }

      frameRef.current++;
      if (runRef.current) rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      runRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ready]);

  // ─────────────────────────────────────────────────────────────────────────────
  // SAMPLE LOADING (Audio elements conectados al mixBus vía createMediaElementSource)
  // ─────────────────────────────────────────────────────────────────────────────
  function loadSampleFromURL(role, url, name) {
    if (!engineRef.current || !audioCtxRef.current) return;
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.loop = false;
    audio.crossOrigin = 'anonymous';
    // Conectar al bus del motor para que pase por el mixer (grabable + volumen unificado)
    try {
      const source = audioCtxRef.current.createMediaElementSource(audio);
      source.connect(engineRef.current.bus);
    } catch (e) {
      console.warn('MediaElementSource failed for', role, '— playing direct', e);
    }
    engineRef.current.sampleAudios[role] = audio;
    setSampleNames((p) => ({ ...p, [role]: name }));
  }

  function loadSample(role, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    loadSampleFromURL(role, url, file.name);
  }

  // Precarga automática de capas musicales
  async function preloadLayers() {
    const presets = [
      { idx: 0, file: '/assets/layers/Capa_base.mp3', name: 'Base' },
      { idx: 1, file: '/assets/layers/capa_melodica.mp3', name: 'Melódica' },
      { idx: 2, file: '/assets/layers/Capa_ritmica.mp3', name: 'Rítmica' },
      { idx: 3, file: '/assets/layers/Capa_textural.mp3', name: 'Textural' },
    ];
    for (const { idx, file, name } of presets) {
      try {
        const res = await fetch(file);
        if (!res.ok) continue;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.loop = true;
        audio.volume = 0;
        audio.crossOrigin = 'anonymous';
        // Conectar al mixBus
        try {
          const source = audioCtxRef.current.createMediaElementSource(audio);
          source.connect(mixBusRef.current);
        } catch (e) {
          console.warn('Layer MediaElementSource failed:', idx, e);
        }
        layerAudiosRef.current[idx] = audio;
        setLayerNames((p) => { const n = [...p]; n[idx] = name; return n; });
      } catch (e) {
        console.warn('Preload layer failed:', idx, e);
      }
    }
  }

  // Start/stop layers on toggle
  useEffect(() => {
    const audios = layerAudiosRef.current;
    if (toggles.layers) {
      audios.forEach((a) => { if (a) { a.currentTime = 0; a.volume = 0; a.play().catch(() => {}); } });
    } else {
      audios.forEach((a) => { if (a) { a.pause(); a.volume = 0; } });
      layerVolsRef.current = [0, 0, 0, 0];
    }
  }, [toggles.layers]);
  async function preloadSamples() {
    const presets = [
      { role: 'siku', file: '/assets/samples/Siku.mp3' },
      { role: 'quena', file: '/assets/samples/Quena.mp3' },
      { role: 'bombo', file: '/assets/samples/Bombo.mp3' },
      { role: 'charango', file: '/assets/samples/Charango.mp3' },
    ];
    for (const { role, file } of presets) {
      try {
        const res = await fetch(file);
        if (!res.ok) continue;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        loadSampleFromURL(role, url, file.split('/').pop());
      } catch (e) {
        console.warn('Preload sample failed:', role, e);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // VIDEO LOADING
  // ─────────────────────────────────────────────────────────────────────────────
  function loadVideo(idx, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVidSrcs((p) => { const n = [...p]; n[idx] = url; return n; });
    setVidFiles((p) => { const n = [...p]; n[idx] = file; return n; });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOOP RECORDING
  // ─────────────────────────────────────────────────────────────────────────────
  function startLoopRec(idx) {
    if (!loopRecordDestRef.current) return;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const rec = new MediaRecorder(loopRecordDestRef.current.stream, { mimeType });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: mimeType });
      loopBlobsRef.current[idx] = blob;
      try {
        const ab = await blob.arrayBuffer();
        const buffer = await audioCtxRef.current.decodeAudioData(ab);
        loopBuffersRef.current[idx] = buffer;
      } catch (e) {}
      setLoopState((p) => {
        const n = [...p];
        n[idx] = { ...n[idx], rec: false, has: true };
        return n;
      });
    };
    rec.start();
    loopRecordersRef.current[idx] = rec;
    setLoopState((p) => { const n = [...p]; n[idx] = { ...n[idx], rec: true }; return n; });
    setTimeout(() => stopLoopRec(idx), 10000);
  }

  function stopLoopRec(idx) {
    const rec = loopRecordersRef.current[idx];
    if (rec && rec.state === 'recording') rec.stop();
  }

  function toggleLoopPlay(idx) {
    const buf = loopBuffersRef.current[idx];
    const ctx = audioCtxRef.current;
    if (!buf || !ctx) return;

    if (loopState[idx].playing) {
      loopSourcesRef.current[idx]?.stop();
      loopSourcesRef.current[idx] = null;
      loopGainsRef.current[idx] = null;
      setLoopState((p) => { const n = [...p]; n[idx] = { ...n[idx], playing: false }; return n; });
    } else {
      // GainNode individual para control de volumen en vivo
      const gainNode = ctx.createGain();
      gainNode.gain.value = loopVolumes[idx];
      gainNode.connect(mixBusRef.current);

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gainNode);
      src.start();
      loopSourcesRef.current[idx] = src;
      loopGainsRef.current[idx] = gainNode;
      setLoopState((p) => { const n = [...p]; n[idx] = { ...n[idx], playing: true }; return n; });
    }
  }

  function setLoopVolume(idx, vol) {
    setLoopVolumes((p) => { const n = [...p]; n[idx] = vol; return n; });
    if (loopGainsRef.current[idx]) {
      loopGainsRef.current[idx].gain.value = vol;
    }
  }

  // ── Grabación de estelas como video con música generativa reactiva ──
  const trailRecorderRef = useRef(null);
  const trailCanvasRef = useRef(null);
  const trailChunksRef = useRef([]);
  const trailAudioCtxRef = useRef(null);
  const trailOscsRef = useRef([]); // osciladores reactivos

  function startTrailRecording() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    trailCanvasRef.current = canvas;
    try {
      const videoStream = canvas.captureStream(30);

      // ── Audio generativo REACTIVO a las estelas ──
      const aCtx = new (window.AudioContext || window.webkitAudioContext)();
      trailAudioCtxRef.current = aCtx;
      const dest = aCtx.createMediaStreamDestination();

      // Reverb simulado con delay feedback
      const delay = aCtx.createDelay(1);
      delay.delayTime.value = 0.4;
      const feedback = aCtx.createGain();
      feedback.gain.value = 0.35;
      const reverbG = aCtx.createGain();
      reverbG.gain.value = 0.3;
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(reverbG);
      reverbG.connect(dest);

      // Master
      const masterG = aCtx.createGain();
      masterG.gain.value = 0.2;
      masterG.connect(dest);
      masterG.connect(delay); // enviar al reverb

      // 7 osciladores (uno por keypoint rastreado) — frecuencias controladas por posición
      const oscs = TRAIL_KPS.map((kpIdx, i) => {
        const osc = aCtx.createOscillator();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.value = 216; // A3 base
        const g = aCtx.createGain();
        g.gain.value = 0; // empieza en silencio
        const pan = aCtx.createStereoPanner();
        pan.pan.value = 0;
        osc.connect(g);
        g.connect(pan);
        pan.connect(masterG);
        osc.start();
        return { osc, gain: g, pan, kpIdx };
      });
      trailOscsRef.current = oscs;

      // Drone base sutil (siempre presente)
      const drone = aCtx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 108; // sub-octava
      const droneG = aCtx.createGain();
      droneG.gain.value = 0.06;
      drone.connect(droneG);
      droneG.connect(masterG);
      drone.start();

      // Combinar video + audio
      const combinedStream = new MediaStream([
        ...videoStream.getTracks(),
        ...dest.stream.getTracks(),
      ]);

      const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      trailChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) trailChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(trailChunksRef.current, { type: 'video/webm' });
        if (blob.size > 1000) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `korpsound-estelas-${Date.now()}.webm`;
          a.click();
          URL.revokeObjectURL(url);
        }
        trailCanvasRef.current = null;
        trailOscsRef.current = [];
        if (trailAudioCtxRef.current) {
          trailAudioCtxRef.current.close();
          trailAudioCtxRef.current = null;
        }
      };
      recorder.start(1000);
      trailRecorderRef.current = recorder;
    } catch (e) {
      console.warn('Trail video recording failed:', e);
    }
  }

  function stopTrailRecording() {
    if (trailRecorderRef.current && trailRecorderRef.current.state === 'recording') {
      trailRecorderRef.current.stop();
      trailRecorderRef.current = null;
    }
  }

  // Renderizar estelas + actualizar audio reactivo
  function renderTrailFrame(frame) {
    const tCanvas = trailCanvasRef.current;
    if (!tCanvas) return;
    const tCtx = tCanvas.getContext('2d');
    tCtx.clearRect(0, 0, W, H);
    tCtx.fillStyle = '#000';
    tCtx.fillRect(0, 0, W, H);

    const trails = trailsRef.current;
    const byKp = {};
    trails.forEach((pt) => {
      if (!byKp[pt.kpIdx]) byKp[pt.kpIdx] = [];
      byKp[pt.kpIdx].push(pt);
    });

    // ── Actualizar audio reactivo según posición de estelas ──
    const oscs = trailOscsRef.current;
    const aCtx = trailAudioCtxRef.current;
    if (oscs.length && aCtx) {
      const now = aCtx.currentTime;
      oscs.forEach((o) => {
        const pts = byKp[o.kpIdx];
        if (pts && pts.length > 1) {
          const latest = pts[pts.length - 1];
          const age = frame - latest.frame;
          if (age < 10) {
            // Punto reciente → sonido activo
            // Y position → frecuencia (arriba=agudo, abajo=grave)
            const yNorm = 1 - latest.y / H; // 0=abajo, 1=arriba
            const freq = 108 + yNorm * 540; // 108Hz → 648Hz (rango andino)
            // Cuantizar a pentatónica A=432
            const pentatonic = [108, 144, 162, 216, 243, 288, 324, 432, 486, 540, 648];
            const closest = pentatonic.reduce((a, b) => Math.abs(b - freq) < Math.abs(a - freq) ? b : a);
            o.osc.frequency.setTargetAtTime(closest, now, 0.15);
            // X position → paneo estéreo
            const xNorm = (latest.x / W) * 2 - 1; // -1 → 1
            o.pan.pan.setTargetAtTime(xNorm * 0.7, now, 0.1);
            // Volumen proporcional a recencia
            const vol = Math.max(0, (1 - age / 10) * 0.08);
            o.gain.gain.setTargetAtTime(vol, now, 0.08);
          } else {
            // Punto viejo → silencio gradual
            o.gain.gain.setTargetAtTime(0, now, 0.3);
          }
        } else {
          o.gain.gain.setTargetAtTime(0, now, 0.5);
        }
      });
    }

    // ── Dibujar estelas ──
    tCtx.lineCap = 'round';
    tCtx.lineJoin = 'round';
    Object.entries(byKp).forEach(([kpIdx, pts]) => {
      if (pts.length < 2) return;
      const hueBase = (200 + parseInt(kpIdx) * 28) % 360;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1], curr = pts[i];
        if (curr.frame - prev.frame > 3) continue;
        const age = frame - curr.frame;
        const life = 1 - age / TRAIL_MAX_AGE;
        if (life <= 0) continue;
        const alpha = life * life * 0.85;
        const hue = (hueBase + age * 0.15) % 360;

        tCtx.globalAlpha = alpha * 0.3;
        tCtx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
        tCtx.lineWidth = 5;
        tCtx.beginPath();
        tCtx.moveTo(prev.x, prev.y);
        tCtx.lineTo(curr.x, curr.y);
        tCtx.stroke();

        tCtx.globalAlpha = alpha;
        tCtx.strokeStyle = `hsl(${hue}, 80%, 75%)`;
        tCtx.lineWidth = 1.8;
        tCtx.stroke();
      }
    });
  }

  function loadEffectVideo(idx, file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setEffectVidSrcs((p) => { const n = [...p]; n[idx] = url; return n; });
    setEffectVidFiles((p) => { const n = [...p]; n[idx] = file; return n; });
  }

  function activateEffectVideo(idx) {
    const next = effectActiveVid === idx ? -1 : idx;
    setEffectActiveVid(next);
    if (bcRef.current) {
      bcRef.current.postMessage({ type: 'effectControl', activeIdx: next, opacity: effectVidOpacityRef.current });
    }
  }

  function downloadLoop(idx) {
    const blob = loopBlobsRef.current[idx];
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `korpsound_loop_${idx + 1}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllLoops() {
    loopBlobsRef.current.forEach((blob, i) => { if (blob) downloadLoop(i); });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PERFORMANCE RECORDING (canvas + audio)
  // ─────────────────────────────────────────────────────────────────────────────
  function togglePerfRec() {
    if (!canvasRef.current || !audioCtxRef.current) return;
    if (perfRec) {
      perfRecorderRef.current?.stop();
      setPerfRec(false);
    } else {
      const canvasStream = canvasRef.current.captureStream(30);
      const audioDest = audioCtxRef.current.createMediaStreamDestination();
      masterGainRef.current.connect(audioDest);
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDest.stream.getAudioTracks(),
      ]);
      perfChunksRef.current = [];
      const rec = new MediaRecorder(combined, { mimeType: 'video/webm' });
      rec.ondataavailable = (e) => perfChunksRef.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(perfChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `korpsound_${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      rec.start();
      perfRecorderRef.current = rec;
      setPerfRec(true);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS UI
  // ─────────────────────────────────────────────────────────────────────────────
  function tog(key) {
    setToggles((p) => ({ ...p, [key]: !p[key] }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STYLES
  // ─────────────────────────────────────────────────────────────────────────────
  const S = {
    root: {
      display: 'flex', flexDirection: 'row', width: '100vw', height: '100vh',
      background: '#08080f', overflow: 'hidden', fontFamily: 'monospace',
    },
    canvasWrap: {
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', background: '#000',
    },
    panel: {
      width: 220, minWidth: 220, height: '100vh', overflowY: 'auto',
      background: '#0f0f1a', borderLeft: '1px solid #1e1e30',
      padding: '12px 10px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 6,
    },
    panelTitle: {
      color: '#d4a853', fontSize: 11, fontWeight: 'bold',
      letterSpacing: '0.12em', marginBottom: 4, textTransform: 'uppercase',
    },
    section: {
      borderTop: '1px solid #1e1e30', paddingTop: 6, marginTop: 4,
    },
    sectionLabel: {
      color: '#d4a853', fontSize: 9, letterSpacing: '0.15em',
      textTransform: 'uppercase', marginBottom: 4,
    },
    row: {
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', padding: '2px 0',
    },
    label: { color: '#9ca3af', fontSize: 11 },
    toggleTrack: (on) => ({
      width: 30, height: 15, borderRadius: 7,
      background: on ? '#7c3aed' : '#2a2a3a', cursor: 'pointer',
      position: 'relative', transition: 'background 0.18s', flexShrink: 0,
    }),
    toggleThumb: (on) => ({
      position: 'absolute', top: 2, left: on ? 17 : 2,
      width: 11, height: 11, borderRadius: '50%', background: '#fff',
      transition: 'left 0.18s',
    }),
    btn: {
      background: '#1e1e30', border: '1px solid #2e2e45',
      color: '#9ca3af', fontSize: 10, padding: '3px 7px',
      borderRadius: 3, cursor: 'pointer', transition: 'background 0.15s',
    },
    btnActive: {
      background: '#7c3aed', border: '1px solid #7c3aed', color: '#fff',
    },
    btnRed: {
      background: '#7f1d1d', border: '1px solid #991b1b', color: '#fca5a5',
    },
    fileBtn: {
      background: '#1e1e30', border: '1px solid #2e2e45',
      color: '#6b7280', fontSize: 9, padding: '2px 5px',
      borderRadius: 2, cursor: 'pointer',
    },
    slider: {
      width: '100%', accentColor: '#7c3aed', margin: '2px 0',
    },
    selectEl: {
      background: '#1e1e30', border: '1px solid #2e2e45',
      color: '#9ca3af', fontSize: 10, padding: '2px 4px', borderRadius: 2, width: '100%',
    },
    startBtn: {
      position: 'absolute', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,8,15,0.9)', zIndex: 10, flexDirection: 'column', gap: 12,
    },
    startInner: {
      padding: '28px 40px', background: '#0f0f1a',
      border: '1px solid #7c3aed', borderRadius: 8,
      textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10,
    },
  };

  const Toggle = ({ label, id }) => (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <div style={S.toggleTrack(toggles[id])} onClick={() => tog(id)}>
        <div style={S.toggleThumb(toggles[id])} />
      </div>
    </div>
  );

  const FileBtn = ({ label, onChange }) => (
    <label style={{ ...S.fileBtn, display: 'block', textAlign: 'center', marginTop: 2 }}>
      {label}
      <input type="file" style={{ display: 'none' }} onChange={onChange} />
    </label>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* Hidden camera */}
      <video ref={camRef} style={{ display: 'none' }} playsInline muted />

      {/* Hidden season videos */}
      {[v0, v1, v2, v3].map((ref, i) => (
        <video
          key={i}
          ref={ref}
          src={vidSrcs[i] || undefined}
          loop playsInline
          style={{ display: 'none' }}
        />
      ))}

      {/* Hidden effect videos (para canvas principal) */}
      {effectVidRefsMain.map((ref, i) => (
        <video
          key={`ef${i}`}
          ref={ref}
          src={effectVidSrcs[i] || undefined}
          loop playsInline
          style={{ display: 'none' }}
        />
      ))}

      {/* Canción de efectos (Pájaro Bochinchero) */}
      <audio
        ref={effectSongRef}
        src="/assets/songs/sicuriadas_-_inti-illimani.mp3"
        loop
        preload="auto"
        style={{ display: 'none' }}
      />

      {/* Canvas area */}
      <div style={S.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
        />

        {!ready && (
          <div style={S.startBtn}>
            <div style={S.startInner}>
              <div style={{ color: '#d4a853', fontSize: 18, fontWeight: 'bold', letterSpacing: '0.15em' }}>
                KORPSOUND v3.0
              </div>
              <div style={{ color: '#6b7280', fontSize: 11 }}>
                Performer: Mariana · A=432Hz
              </div>
              {loading ? (
                <div style={{ color: '#7c3aed', fontSize: 11 }}>{loading}</div>
              ) : (
                <button
                  style={{
                    ...S.btn, ...S.btnActive, fontSize: 13, padding: '8px 24px',
                    borderRadius: 4, letterSpacing: '0.1em',
                  }}
                  onClick={initAll}
                >
                  INICIAR
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control panel */}
      <div style={S.panel}>
        <div style={S.panelTitle}>KorpSound v3.0</div>

        {/* ── AUDIO ── */}
        <div style={S.sectionLabel}>Audio</div>
        <Toggle label="Drone ancestral" id="drone" />
        <Toggle label="Motor ancestral" id="ancestral" />
        <Toggle label="Capas musicales" id="layers" />
        {toggles.layers && (
          <div style={{ paddingLeft: 4, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ ...S.label, fontSize: 9, color: '#4b5563' }}>
              Base=quietud · Melódica=brazo izq · Rítmica=movimiento · Textural=brazo der
            </div>
            {['Base', 'Melódica', 'Rítmica', 'Textural'].map((name, i) => (
              <div key={i} style={{ ...S.label, fontSize: 9, color: layerNames[i] !== '—' ? '#7c3aed' : '#6b7280' }}>
                {name}: {layerNames[i]} {layerNames[i] !== '—' ? '✓' : ''}
              </div>
            ))}
            <div style={{ marginTop: 3 }}>
              <div style={{ ...S.label, fontSize: 9, color: '#6b7280' }}>
                Vol. base: {Math.round(baseLayerMax * 100)}%
              </div>
              <input type="range" min={0} max={1} step={0.02}
                value={baseLayerMax} style={S.slider}
                onChange={(e) => setBaseLayerMax(parseFloat(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* ── SAMPLES ── */}
        <div style={S.section}>
          <div style={{ ...S.row }}>
            <span style={S.label}>Samples</span>
            <div style={S.toggleTrack(toggles.samples)} onClick={() => tog('samples')}>
              <div style={S.toggleThumb(toggles.samples)} />
            </div>
          </div>
          {toggles.samples && (
            <div style={{ paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
              {['siku', 'quena', 'bombo', 'percusion', 'charango'].map((role) => (
                <div key={role}>
                  <div style={{ ...S.label, fontSize: 9, color: '#6b7280', textTransform: 'capitalize', marginBottom: 1 }}>
                    {role === 'charango' ? 'Charango/Voces' : role.charAt(0).toUpperCase() + role.slice(1)}
                    {sampleNames[role] && (
                      <span style={{ color: '#7c3aed', marginLeft: 4 }}>✓</span>
                    )}
                  </div>
                  <FileBtn
                    label={sampleNames[role] ? sampleNames[role].slice(0, 16) + '…' : '+ Cargar audio'}
                    onChange={(e) => { if (e.target.files[0]) loadSample(role, e.target.files[0]); }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── LOOPS ── */}
        <div style={S.section}>
          <div style={S.row}>
            <span style={S.label}>Loops manuales</span>
            <div style={S.toggleTrack(toggles.loops)} onClick={() => tog('loops')}>
              <div style={S.toggleThumb(toggles.loops)} />
            </div>
          </div>
          {toggles.loops && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <span style={{ ...S.label, fontSize: 9, width: 14 }}>L{i + 1}</span>
                    <button
                      style={{
                        ...S.btn, ...(loopState[i].rec ? S.btnRed : {}),
                        padding: '2px 5px', fontSize: 9, flex: 1,
                      }}
                      onClick={() => loopState[i].rec ? stopLoopRec(i) : startLoopRec(i)}
                    >
                      {loopState[i].rec ? '■ Stop' : '● Rec'}
                    </button>
                    {loopState[i].has && (
                      <>
                        <button
                          style={{
                            ...S.btn, ...(loopState[i].playing ? S.btnActive : {}),
                            padding: '2px 5px', fontSize: 9,
                          }}
                          onClick={() => toggleLoopPlay(i)}
                        >
                          {loopState[i].playing ? '❚❚' : '▶'}
                        </button>
                        <button
                          style={{ ...S.btn, padding: '2px 5px', fontSize: 9 }}
                          onClick={() => downloadLoop(i)}
                        >↓</button>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 18 }}>
                    <span style={{ ...S.label, fontSize: 8, color: '#6b7280', width: 22 }}>
                      {Math.round(loopVolumes[i] * 100)}%
                    </span>
                    <input
                      type="range" min={0} max={1} step={0.02}
                      value={loopVolumes[i]}
                      style={{ ...S.slider, flex: 1 }}
                      onChange={(e) => setLoopVolume(i, parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              ))}
              <button style={{ ...S.btn, marginTop: 2, fontSize: 9 }} onClick={downloadAllLoops}>
                ↓ Descargar todos
              </button>
            </div>
          )}
        </div>

        {/* ── VIDEOS ── */}
        <div style={S.section}>
          <div style={S.row}>
            <span style={S.label}>Videos de estaciones</span>
            <div style={S.toggleTrack(toggles.videos)} onClick={() => tog('videos')}>
              <div style={S.toggleThumb(toggles.videos)} />
            </div>
          </div>
          {toggles.videos && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
              {VID_LABELS.map((label, i) => (
                <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <button
                    style={{
                      ...S.btn,
                      ...(activeVid === i ? S.btnActive : {}),
                      padding: '2px 5px', fontSize: 9,
                    }}
                    onClick={() => {
                      if (activeVid === i) {
                        setActiveVid(-1);
                        seasonRefs[i]?.current?.pause();
                      } else {
                        seasonRefs.forEach((r, j) => { if (j !== i && r.current) r.current.pause(); });
                        setActiveVid(i);
                        seasonRefs[i]?.current?.play();
                      }
                    }}
                  >
                    {label}
                  </button>
                  <label style={{ ...S.fileBtn }}>
                    {vidSrcs[i] ? '✓' : '+'}
                    <input
                      type="file" accept="video/*"
                      style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files[0]) loadVideo(i, e.target.files[0]); }}
                    />
                  </label>
                </div>
              ))}
              <div style={{ ...S.label, fontSize: 9, color: '#4b5563', marginTop: 2 }}>
                Gestos: Arriba→V1 D→V2 Prayer→V3 Cruzados→×
              </div>
              {/* Modo de vídeo */}
              <div style={{ marginTop: 4 }}>
                <div style={{ ...S.label, fontSize: 9, color: '#d4a853', marginBottom: 3 }}>Modo de vídeo</div>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button
                    style={{ ...S.btn, ...(vidMode === 'full' ? S.btnActive : {}), flex: 1, fontSize: 9 }}
                    onClick={() => setVidMode('full')}
                  >
                    Completo
                  </button>
                  <button
                    style={{ ...S.btn, ...(vidMode === 'split' ? S.btnActive : {}), flex: 1, fontSize: 9 }}
                    onClick={() => setVidMode('split')}
                  >
                    Separado
                  </button>
                </div>
              </div>
              {/* Opacidad según modo */}
              <div style={{ marginTop: 4 }}>
                {vidMode === 'full' ? (
                  <>
                    <div style={{ ...S.label, fontSize: 9, color: '#6b7280' }}>
                      Opacidad global: {Math.round(vidOpacity.main * 100)}%
                    </div>
                    <input type="range" min={0} max={1} step={0.03}
                      value={vidOpacity.main} style={S.slider}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setVidOpacity({ main: v, parallel: v });
                      }}
                    />
                  </>
                ) : (
                  <>
                    <div style={{ ...S.label, fontSize: 9, color: '#6b7280' }}>
                      Opacidad cámara: {Math.round(vidOpacity.main * 100)}%
                    </div>
                    <input type="range" min={0} max={1} step={0.03}
                      value={vidOpacity.main} style={S.slider}
                      onChange={(e) => setVidOpacity(p => ({ ...p, main: parseFloat(e.target.value) }))}
                    />
                    <div style={{ ...S.label, fontSize: 9, color: '#6b7280', marginTop: 2 }}>
                      Opacidad paralelo: {Math.round(vidOpacity.parallel * 100)}%
                    </div>
                    <input type="range" min={0} max={1} step={0.03}
                      value={vidOpacity.parallel} style={S.slider}
                      onChange={(e) => setVidOpacity(p => ({ ...p, parallel: parseFloat(e.target.value) }))}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── VIDEOS DE EFECTOS ── */}
        <div style={S.section}>
          <div style={S.row}>
            <span style={S.label}>Videos de efectos</span>
            <div style={S.toggleTrack(toggles.effectVids)} onClick={() => tog('effectVids')}>
              <div style={S.toggleThumb(toggles.effectVids)} />
            </div>
          </div>
          {toggles.effectVids && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
              <div style={{ ...S.label, fontSize: 9, color: '#4b5563' }}>
                Blend: screen · Visibles en ambas pantallas
              </div>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <button
                    style={{
                      ...S.btn, ...(effectActiveVid === i ? S.btnActive : {}),
                      padding: '2px 5px', fontSize: 9, flex: 1,
                    }}
                    onClick={() => activateEffectVideo(i)}
                  >
                    {effectVidSrcs[i] ? `EF${i+1}` : `EF${i+1} —`}
                    {effectActiveVid === i ? ' ▶' : ''}
                  </button>
                  <label style={S.fileBtn}>
                    {effectVidSrcs[i] ? '✓' : '+'}
                    <input type="file" accept="video/*" style={{ display: 'none' }}
                      onChange={(e) => { if (e.target.files[0]) loadEffectVideo(i, e.target.files[0]); }}
                    />
                  </label>
                </div>
              ))}
              <div style={{ marginTop: 3 }}>
                <div style={{ ...S.label, fontSize: 9, color: '#6b7280' }}>
                  Opacidad efectos: {Math.round(effectVidOpacity * 100)}%
                </div>
                <input type="range" min={0} max={1} step={0.03}
                  value={effectVidOpacity} style={S.slider}
                  onChange={(e) => setEffectVidOpacity(parseFloat(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── VISUALES ── */}
        <div style={S.section}>
          <div style={S.sectionLabel}>Visuales</div>
          <Toggle label="Sombra silueta" id="shadow" />
          {toggles.shadow && (
            <div style={{ paddingLeft: 4, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { label: 'Aleatorio', key: 'noise', min: 0, max: 1, step: 0.05 },
                { label: 'Opacidad', key: 'opacity', min: 0, max: 1, step: 0.05 },
              ].map(({ label, key, min, max, step }) => (
                <div key={key}>
                  <div style={{ ...S.label, fontSize: 9, color: '#6b7280' }}>
                    {label}: {shadowCfg[key].toFixed(2)}
                  </div>
                  <input
                    type="range" min={min} max={max} step={step}
                    value={shadowCfg[key]}
                    style={S.slider}
                    onChange={(e) => setShadowCfg((p) => ({ ...p, [key]: parseFloat(e.target.value) }))}
                  />
                </div>
              ))}
              <div style={S.row}>
                <span style={{ ...S.label, fontSize: 9 }}>Espejo</span>
                <div
                  style={S.toggleTrack(shadowCfg.mirror)}
                  onClick={() => setShadowCfg((p) => ({ ...p, mirror: !p.mirror }))}
                >
                  <div style={S.toggleThumb(shadowCfg.mirror)} />
                </div>
              </div>
            </div>
          )}

          <Toggle label="Textos (rodilla)" id="texts" />
          <Toggle label="Línea de tiempo" id="timeline" />
          <Toggle label="Entidad fluida" id="fluid" />
          {toggles.fluid && (
            <div style={{ ...S.label, fontSize: 8, color: '#4b5563', paddingLeft: 4, marginTop: 2 }}>
              🎬 Video de estelas se graba automáticamente
            </div>
          )}
          <Toggle label="Zonas de color" id="bodyZones" />
        </div>

        {/* ── CÁMARA ── */}
        <div style={S.section}>
          <div style={S.sectionLabel}>Cámara</div>
          <div>
            <div style={{ ...S.label, fontSize: 9, color: '#6b7280' }}>
              Opacidad: {camCfg.opacity.toFixed(2)}
            </div>
            <input
              type="range" min={0} max={1} step={0.05}
              value={camCfg.opacity} style={S.slider}
              onChange={(e) => setCamCfg((p) => ({ ...p, opacity: parseFloat(e.target.value) }))}
            />
          </div>
          <div>
            <div style={{ ...S.label, fontSize: 9, color: '#6b7280', marginBottom: 2 }}>Blend</div>
            <select
              value={camCfg.blend}
              style={S.selectEl}
              onChange={(e) => setCamCfg((p) => ({ ...p, blend: e.target.value }))}
            >
              {['normal', 'screen', 'multiply', 'overlay', 'difference', 'luminosity'].map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div style={{ ...S.row, marginTop: 3 }}>
            <span style={{ ...S.label, fontSize: 9 }}>Espejo cam</span>
            <div
              style={S.toggleTrack(camCfg.mirror)}
              onClick={() => setCamCfg((p) => ({ ...p, mirror: !p.mirror }))}
            >
              <div style={S.toggleThumb(camCfg.mirror)} />
            </div>
          </div>
        </div>

        {/* ── SISTEMA ── */}
        <div style={S.section}>
          <div style={S.sectionLabel}>Sistema</div>
          <Toggle label="HUD" id="hud" />

          <div style={{ marginTop: 4 }}>
            <button
              style={{
                ...S.btn,
                ...(toggles.parallel ? S.btnActive : {}),
                width: '100%', marginBottom: 4,
              }}
              onClick={() => tog('parallel')}
            >
              {toggles.parallel ? '◉ Mundo paralelo ON' : '○ Mundo paralelo'}
            </button>
          </div>

          <div>
            <button
              style={{
                ...S.btn,
                ...(perfRec ? S.btnRed : {}),
                width: '100%',
              }}
              onClick={togglePerfRec}
            >
              {perfRec ? '■ Detener grabación' : '● Grabar performance'}
            </button>
          </div>
        </div>

        {/* ── NOTA ACTIVA ── */}
        {ready && (
          <div style={{ ...S.section, marginTop: 'auto' }}>
            <div style={{
              color: '#d4a853', fontSize: 9, letterSpacing: '0.12em',
              textAlign: 'center', padding: '6px 0',
            }}>
              {engineRef.current?.lastInstr || 'sin instrumento'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT — detecta modo de proyección
// ═══════════════════════════════════════════════════════════════════════════════
export default function RootApp() {
  const isProjection = new URLSearchParams(window.location.search).get('mode') === 'projection';
  return isProjection ? <ProjectionApp /> : <KorpSoundApp />;
}
