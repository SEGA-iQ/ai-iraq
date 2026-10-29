// Builds the soundtrack for a motion ad: a 120 BPM maqsum groove (synthesised darbuka,
// sub, shaker, bass, Hijaz pluck melody) plus sound effects placed from the page's cue
// sheet (window.CUES). Pure JS synthesis — no samples, no licences — then ffmpeg
// loudness-normalises it to -14 LUFS with a -2 dBTP ceiling.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const SR = 48000;

// ---------------------------------------------------------------- helpers
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Biquad {
  constructor(type, f, q = 0.707) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.type = type;
    this.set(f, q);
  }
  set(f, q = this.q) {
    this.q = q;
    const w = (2 * Math.PI * Math.min(Math.max(f, 10), SR * 0.45)) / SR;
    const c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    let b0, b1, b2;
    const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    if (this.type === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (this.type === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; } // band-pass, 0 dB peak
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const exp = (t, tau) => Math.exp(-t / tau);
const atk = (t, a) => (t < a ? t / a : 1);
const noteHz = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note → Hz
const N = { D2: 38, Eb2: 39, Fs2: 42, A1: 33, D4: 62, Eb4: 63, Fs4: 66, G4: 67, A4: 69, Bb4: 70, C5: 72, D5: 74 };

/** render a mono voice: fn(t, i) → sample, for `len` seconds */
function voice(len, fn) {
  const n = Math.ceil(len * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

// ---------------------------------------------------------------- instruments
function doum(r) {
  const lp = new Biquad("lp", 700, 0.8);
  let ph = 0;
  return voice(0.5, (t) => {
    const f = 74 + 70 * exp(t, 0.03);
    ph += (2 * Math.PI * f) / SR;
    const body = Math.tanh(2.4 * Math.sin(ph)) / Math.tanh(2.4) * atk(t, 0.002) * exp(t, 0.2);
    const skin = lp.run(r() * 2 - 1) * exp(t, 0.012) * 0.6;
    return body + skin;
  });
}
function tek(r, bright = 1, decay = 0.04) {
  const bp = new Biquad("bp", 3300 * bright, 1.4);
  let ph = 0;
  return voice(0.22, (t) => {
    ph += (2 * Math.PI * 760 * bright) / SR;
    return bp.run(r() * 2 - 1) * 2.2 * atk(t, 0.0008) * exp(t, decay) + Math.sin(ph) * 0.35 * exp(t, 0.018);
  });
}
function shaker(r) {
  const hp = new Biquad("hp", 6500, 0.7);
  return voice(0.09, (t) => hp.run(r() * 2 - 1) * atk(t, 0.006) * exp(t, 0.022));
}
function sub() {
  let ph = 0;
  return voice(0.55, (t) => {
    const f = 46 + 70 * exp(t, 0.045);
    ph += (2 * Math.PI * f) / SR;
    return Math.sin(ph) * atk(t, 0.003) * exp(t, 0.24);
  });
}
function bass(note, len) {
  const f = noteHz(note);
  const lp = new Biquad("lp", 900, 1.1);
  let ph = 0;
  return voice(len + 0.12, (t) => {
    ph += f / SR;
    const saw = 2 * (ph % 1) - 1;
    const sq = ph % 1 < 0.5 ? 1 : -1;
    lp.set(220 + 1400 * exp(t, 0.06));
    const amp = atk(t, 0.004) * (t < len ? 0.55 + 0.45 * exp(t, 0.12) : 0.55 * exp(t - len, 0.035));
    return lp.run(0.7 * saw + 0.3 * sq) * amp;
  });
}
/** Karplus–Strong plucked string — oud-ish when the attack is soft */
function pluck(note, r, len = 1.4, bright = 0.5) {
  const f = noteHz(note);
  const n = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { const x = r() * 2 - 1; prev = prev + bright * (x - prev); buf[i] = prev; }
  let idx = 0;
  const decay = 0.996;
  const body = new Biquad("lp", 3800, 0.7);
  return voice(len, (t) => {
    const a = buf[idx], b = buf[(idx + 1) % n];
    const y = decay * 0.5 * (a + b);
    buf[idx] = y;
    idx = (idx + 1) % n;
    return body.run(y) * (t > len - 0.05 ? (len - t) / 0.05 : 1);
  });
}

// ---------------------------------------------------------------- sound effects
function whoosh(r, len) {
  const bp = new Biquad("bp", 500, 0.9);
  const bp2 = new Biquad("bp", 900, 2.5);
  return voice(len, (t) => {
    const u = t / len;
    const f = u < 0.6 ? 300 * Math.pow(9, u / 0.6) : 2700 * Math.pow(0.25, (u - 0.6) / 0.4);
    bp.set(f); bp2.set(f * 1.6);
    // swell up to 62 % of the length, then fall away faster
    const shape = u < 0.62 ? Math.pow(Math.sin((Math.PI / 2) * (u / 0.62)), 2) : Math.pow(Math.cos((Math.PI / 2) * ((u - 0.62) / 0.38)), 2);
    const x = r() * 2 - 1;
    return (bp.run(x) * 1.6 + bp2.run(x) * 0.8) * shape;
  });
}
function riser(r, len) {
  const bp = new Biquad("bp", 400, 1.2);
  let ph = 0;
  return voice(len, (t) => {
    const u = t / len;
    const f = 350 * Math.pow(12, u);
    bp.set(f);
    ph += (2 * Math.PI * (180 * Math.pow(6, u))) / SR;
    const amp = Math.pow(u, 2.2) * (u > 0.97 ? (1 - u) / 0.03 : 1);
    return (bp.run(r() * 2 - 1) * 1.8 + Math.sin(ph) * 0.25) * amp;
  });
}
function impact(r) {
  const lp = new Biquad("lp", 3800, 0.7);
  const tail = new Biquad("lp", 900, 0.6);
  let ph = 0;
  return voice(1.1, (t) => {
    const f = 34 + 56 * exp(t, 0.06);
    ph += (2 * Math.PI * f) / SR;
    const x = r() * 2 - 1;
    return Math.sin(ph) * atk(t, 0.002) * exp(t, 0.32) * 1.1 + lp.run(x) * exp(t, 0.035) * 0.9 + tail.run(x) * exp(t, 0.35) * 0.35;
  });
}
function pop(k) {
  let ph = 0;
  const f0 = 620 * Math.pow(2, ((k % 4) * 2) / 12);
  return voice(0.12, (t) => {
    ph += (2 * Math.PI * f0 * (0.62 + 0.38 * exp(t, 0.02))) / SR;
    return Math.sin(ph) * atk(t, 0.0015) * exp(t, 0.035);
  });
}
function tick(r) {
  const hp = new Biquad("hp", 2500, 0.7);
  let ph = 0;
  return voice(0.06, (t) => {
    ph += (2 * Math.PI * 2100) / SR;
    return Math.sin(ph) * exp(t, 0.01) * 0.8 + hp.run(r() * 2 - 1) * exp(t, 0.003) * 0.7;
  });
}
function drop() {
  let p1 = 0, p2 = 0;
  return voice(0.2, (t) => {
    p1 += (2 * Math.PI * 760) / SR; p2 += (2 * Math.PI * 1230) / SR;
    return (Math.sin(p1) * exp(t, 0.045) + Math.sin(p2) * 0.5 * exp(t, 0.025)) * atk(t, 0.001);
  });
}
function zip(r, len) {
  // a ratchet of ticks along the route, speeding up and rising in pitch
  const out = new Float32Array(Math.ceil((len + 0.1) * SR));
  let t = 0;
  while (t < len) {
    const u = t / len;
    let ph = 0;
    const f = 900 + 1100 * u;
    const n = Math.ceil(0.03 * SR), s0 = Math.floor(t * SR);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const tt = i / SR;
      ph += (2 * Math.PI * f) / SR;
      out[s0 + i] += Math.sin(ph) * exp(tt, 0.006) * (0.5 + 0.5 * Math.sin(Math.PI * u));
    }
    t += 0.1 - 0.055 * Math.sin(Math.PI * Math.min(1, u * 1.1)); // gaps tighten mid-route
  }
  return out;
}
function ding() {
  const notes = [[0, 1046.5], [0.085, 1567.98]];
  const parts = [[1, 1, 0.9], [2.0, 0.25, 0.4], [2.76, 0.18, 0.22], [5.4, 0.07, 0.1]];
  return voice(1.6, (t) => {
    let v = 0;
    for (const [d, f] of notes) {
      const tt = t - d;
      if (tt < 0) continue;
      for (const [m, g, tau] of parts) v += Math.sin(2 * Math.PI * f * m * tt) * g * exp(tt, tau) * atk(tt, 0.002);
    }
    return v * 0.5;
  });
}
function motor(r, len) {
  const lp = new Biquad("lp", 650, 0.9);
  let ph = 0, fire = 0;
  return voice(len, (t) => {
    const u = t / len;
    const rev = u > 0.82 ? Math.pow((u - 0.82) / 0.18, 1.5) : 0; // revs up as the courier bolts
    const f = 54 + 3 * Math.sin(t * 7) + 70 * rev;
    ph += f / SR; fire += (f * 0.5) / SR;
    const saw = 2 * (ph % 1) - 1;
    const pulse = 0.65 + 0.35 * Math.sin(2 * Math.PI * fire);
    const amp = atk(t, 0.25) * (u > 0.96 ? (1 - u) / 0.04 : 1) * (1 + 0.6 * rev);
    return lp.run(saw * pulse + (r() * 2 - 1) * 0.08) * amp;
  });
}

// ---------------------------------------------------------------- mixing
class Bus {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR);
    this.L = new Float32Array(this.n);
    this.R = new Float32Array(this.n);
  }
  add(at, mono, gain = 1, pan = 0) {
    const s0 = Math.round(at * SR);
    const panAt = typeof pan === "function" ? pan : () => pan;
    for (let i = 0; i < mono.length; i++) {
      const j = s0 + i;
      if (j < 0 || j >= this.n) continue;
      const p = Math.max(-1, Math.min(1, panAt(i / mono.length)));
      const a = ((p + 1) * Math.PI) / 4;
      this.L[j] += mono[i] * gain * Math.cos(a);
      this.R[j] += mono[i] * gain * Math.sin(a);
    }
  }
  mixInto(dst, gain = 1) {
    for (let i = 0; i < this.n; i++) { dst.L[i] += this.L[i] * gain; dst.R[i] += this.R[i] * gain; }
  }
}

/** small Schroeder reverb used as a send */
function reverb(bus, wet) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => Math.round((d * SR) / 44100));
  const aps = [556, 441].map((d) => Math.round((d * SR) / 44100));
  const run = (inp, spread) => {
    const out = new Float32Array(inp.length);
    for (const d0 of combs) {
      const d = d0 + spread;
      const buf = new Float32Array(d);
      let k = 0, lp = 0;
      for (let i = 0; i < inp.length; i++) {
        const y = buf[k];
        lp = y * 0.6 + lp * 0.4;
        buf[k] = inp[i] + lp * 0.8;
        k = (k + 1) % d;
        out[i] += y / combs.length;
      }
    }
    for (const d0 of aps) {
      const d = d0 + spread;
      const buf = new Float32Array(d);
      let k = 0;
      for (let i = 0; i < out.length; i++) {
        const b = buf[k];
        const y = -out[i] * 0.5 + b;
        buf[k] = out[i] + b * 0.5;
        out[i] = y;
        k = (k + 1) % d;
      }
    }
    return out;
  };
  const l = run(bus.L, 0), r = run(bus.R, 23);
  for (let i = 0; i < bus.n; i++) { bus.L[i] += l[i] * wet; bus.R[i] += r[i] * wet; }
}

function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(L[i], 44 + i * 8); buf.writeFloatLE(R[i], 48 + i * 8); }
  fs.writeFileSync(file, buf);
}

// ---------------------------------------------------------------- arrangement
function music(duration, bpm) {
  const r = rng(7);
  const bus = new Bus(duration + 1);
  const beat = 60 / bpm, eighth = beat / 2;
  const bar = beat * 4;
  const silent = (t) => (t >= 4.45 && t < 4.99) || t >= 14.25; // break for the dive; stop for the ending
  const bars = Math.ceil(duration / bar);
  const bassLine = [[0, N.D2, 0.42], [3, N.D2, 0.2], [4, N.Fs2, 0.34], [6, N.Eb2, 0.4]];
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    for (let e = 0; e < 8; e++) {
      const t = t0 + e * eighth;
      if (t >= duration || silent(t)) continue;
      // maqsum: D T . T D . T .  (ka ghost notes in the gaps)
      if (e === 0 || e === 4) { bus.add(t, doum(r), 0.5, 0); bus.add(t, sub(), 0.3, 0); }
      if (e === 1 || e === 3 || e === 6) bus.add(t, tek(r, 1, 0.045), 0.3, e === 3 ? 0.18 : -0.12);
      if (e === 2 || e === 5 || e === 7) bus.add(t, tek(r, 0.8, 0.025), 0.12, 0.25);
      for (const s of [0, 0.5]) {
        const ts = t + s * eighth;
        if (!silent(ts) && ts < duration) bus.add(ts, shaker(r), s ? 0.07 : 0.045, s ? 0.35 : -0.35);
      }
    }
    for (const [e, note, len] of bassLine) {
      const t = t0 + e * eighth;
      if (t < duration && !silent(t)) bus.add(t, bass(note, len), 0.3, 0);
    }
  }
  // tek roll into the band slam (10.5 → 11.0), and a fill into the map scene
  for (let k = 0; k < 8; k++) bus.add(10.5 + k * 0.0625, tek(r, 1.05, 0.03), 0.1 + k * 0.03, k % 2 ? 0.2 : -0.2);
  // final hit on the downbeat of bar 8, then let it ring out
  bus.add(14.0, doum(r), 0.52); bus.add(14.0, sub(), 0.3); bus.add(14.0, bass(N.D2, 0.7), 0.26);

  // Hijaz melody on a plucked string
  const mel = new Bus(duration + 1);
  const phrase = [
    [6.0, N.A4], [6.25, N.Bb4], [6.5, N.A4], [6.75, N.G4], [7.0, N.Fs4], [7.5, N.Eb4], [7.75, N.D4],
    [8.0, N.D5, 0.9], [8.5, N.C5], [8.75, N.Bb4], [9.0, N.A4, 0.9], [9.5, N.G4], [9.75, N.Fs4],
    [10.0, N.G4], [10.25, N.Fs4], [10.5, N.Eb4], [10.75, N.D4],
    [11.5, N.D4, 1.6], [11.52, N.A4, 1.6], [11.54, N.D5, 1.6],
    [13.0, N.A4], [13.25, N.G4], [13.5, N.Fs4], [13.75, N.Eb4], [14.0, N.D4, 1.0], [14.02, N.A4, 1.0],
  ];
  for (const [t, note, g = 0.7] of phrase) mel.add(t, pluck(note, r, 1.5, 0.45), (t >= 14 ? 0.24 : 0.34) * g, ((note % 5) - 2) * 0.12);
  reverb(mel, 0.35);
  mel.mixInto(bus);
  return bus;
}

function effects(cues, duration) {
  const r = rng(11);
  const bus = new Bus(duration + 1);
  let pops = 0;
  for (const c of cues) {
    const g = c.gain ?? 1;
    const pan = c.pan ? (u) => c.pan[0] + (c.pan[1] - c.pan[0]) * u : 0;
    switch (c.type) {
      case "whoosh": bus.add(c.t, whoosh(r, c.len || 0.6), 0.46 * g, pan); break;
      case "riser": bus.add(c.t, riser(r, c.len || 0.6), 0.42 * g, 0); break;
      case "impact": bus.add(c.t, impact(r), 0.7 * g, 0); break;
      case "pop": bus.add(c.t, pop(pops++), 0.2 * g, ((pops % 3) - 1) * 0.25); break;
      case "tick": bus.add(c.t, tick(r), 0.22 * g, 0); break;
      case "drop": bus.add(c.t, drop(), 0.24 * g, 0); break;
      case "zip": bus.add(c.t, zip(r, c.len || 1), 0.14 * g, (u) => 0.4 - 0.8 * u); break;
      case "ding": bus.add(c.t, ding(), 0.34 * g, -0.2); break;
      case "motor": bus.add(c.t, motor(r, c.len || 3), 0.2 * g, -0.25); break;
      default: throw new Error(`unknown cue type: ${c.type}`);
    }
  }
  reverb(bus, 0.12);
  return bus;
}

/**
 * Build the soundtrack WAV for a cue sheet.
 * @returns {{file: string, stats: object}}
 */
function buildSoundtrack({ cues, duration, bpm = 120, out, ffmpeg = "ffmpeg", musicGain = 0.62, sfxGain = 1.0 }) {
  const master = new Bus(duration);
  music(duration, bpm).mixInto(master, musicGain);
  effects(cues, duration).mixInto(master, sfxGain);
  // fade the last 0.6 s so the video ends cleanly
  const fade = 0.6 * SR;
  for (let i = 0; i < master.n; i++) {
    const k = Math.min(1, (master.n - i) / fade);
    const g = k * k;
    master.L[i] = Math.tanh(master.L[i] * g * 1.1) / 1.1;
    master.R[i] = Math.tanh(master.R[i] * g * 1.1) / 1.1;
  }
  const raw = out.replace(/\.wav$/i, "") + ".raw.wav";
  writeWav(raw, master.L, master.R);

  // two-pass loudness normalisation: -14 LUFS integrated, -1.5 dBTP
  const target = "I=-14:TP=-2:LRA=11"; // -2 dBTP leaves room for AAC encoding overshoot
  const pre = "highpass=f=30:poles=2";
  const pass1 = spawnSync(ffmpeg, ["-hide_banner", "-nostats", "-i", raw, "-af", `${pre},loudnorm=${target}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const json = pass1.stderr.slice(pass1.stderr.lastIndexOf("{"), pass1.stderr.lastIndexOf("}") + 1);
  const m = JSON.parse(json);
  const af = `${pre},loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
  const pass2 = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-af", af, "-c:a", "pcm_s16le", "-ar", "48000", out], { encoding: "utf8" });
  if (pass2.status !== 0) throw new Error("ffmpeg loudnorm failed: " + pass2.stderr);
  fs.rmSync(raw, { force: true });
  return { file: out, stats: m };
}

module.exports = { buildSoundtrack, _music: music, _effects: effects, SR };

// CLI: node scripts/motion-audio.cjs cues.json out.wav [duration] [bpm]
if (require.main === module) {
  const [cuesFile, out, dur = "15", bpm = "120"] = process.argv.slice(2);
  const cues = JSON.parse(fs.readFileSync(cuesFile, "utf8"));
  const res = buildSoundtrack({ cues, duration: Number(dur), bpm: Number(bpm), out: path.resolve(out) });
  console.log("wrote", res.file, "input loudness", res.stats.input_i, "LUFS");
}
