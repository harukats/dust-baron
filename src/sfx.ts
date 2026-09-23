// Tiny WebAudio synth for one-shot SFX. Phaser 4 plays files but has no synth, so
// these are built from oscillators/noise and routed into Phaser's own sound graph
// (its `destination`), so the game-wide mute and volume apply to them too.
import type Phaser from 'phaser';

interface Voice {
  type?: OscillatorType | 'noise';
  freq?: number;
  freqEnd?: number;
  notes?: number[]; // Hz steps, each `step` seconds
  step?: number;
  dur?: number; // seconds (ignored when `notes` is set)
  vol?: number;
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number; freqEnd?: number; q?: number };
  jitter?: number; // ±fraction of random pitch
  delay?: number;
}

const note = (n: number): number => 440 * 2 ** ((n - 69) / 12); // MIDI → Hz

export const SFX: Record<string, Voice[]> = {
  dig: [
    { type: 'noise', dur: 0.09, vol: 0.35, filter: { type: 'lowpass', freq: 1800, freqEnd: 300 } },
    { type: 'square', freq: 1400, freqEnd: 900, dur: 0.05, vol: 0.1, jitter: 0.15 },
  ],
  buy: [{ type: 'square', notes: [note(72), note(76), note(79)], step: 0.05, vol: 0.25 }],
  nope: [{ type: 'sawtooth', freq: 140, freqEnd: 90, dur: 0.12, vol: 0.2 }],
  click: [{ type: 'square', freq: 660, dur: 0.04, vol: 0.18 }],
  cache: [{ type: 'square', notes: [note(76), note(79), note(83), note(88)], step: 0.06, vol: 0.28 }],
  chime: [{ type: 'sine', notes: [1800, 2400], step: 0.1, vol: 0.2 }],
  storm: [
    { type: 'noise', dur: 1.6, vol: 0.35, attack: 0.5, filter: { type: 'bandpass', freq: 400, freqEnd: 1600, q: 2 } },
  ],
  start: [{ type: 'square', notes: [note(60), note(67), note(72)], step: 0.08, vol: 0.3 }],
  fanfare: [
    {
      type: 'square',
      notes: [note(60), note(64), note(67), note(72), note(72), 0, note(67), note(72), note(72), note(72)],
      step: 0.11,
      vol: 0.35,
    },
  ],
};

export class Sfx {
  private manager: Phaser.Sound.BaseSoundManager;
  private noise: AudioBuffer | null = null;

  constructor(manager: Phaser.Sound.BaseSoundManager) {
    this.manager = manager;
  }

  private graph(): { ctx: AudioContext; out: AudioNode } | null {
    const m = this.manager as Phaser.Sound.WebAudioSoundManager;
    if (!m.context || !m.destination || m.context.state !== 'running') return null;
    return { ctx: m.context, out: m.destination };
  }

  play(name: keyof typeof SFX): void {
    const gr = this.graph();
    if (!gr) return;
    for (const v of SFX[name] ?? []) this.voice(gr.ctx, gr.out, v);
  }

  private voice(ctx: AudioContext, out: AudioNode, v: Voice): void {
    const t0 = ctx.currentTime + (v.delay ?? 0);
    const dur = v.notes ? v.notes.length * (v.step ?? 0.1) : (v.dur ?? 0.15);
    const vol = v.vol ?? 0.3;
    const attack = v.attack ?? 0.005;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let head: AudioNode = gain;
    if (v.filter) {
      const f = ctx.createBiquadFilter();
      f.type = v.filter.type;
      f.Q.value = v.filter.q ?? 1;
      f.frequency.setValueAtTime(v.filter.freq, t0);
      if (v.filter.freqEnd) f.frequency.exponentialRampToValueAtTime(v.filter.freqEnd, t0 + dur);
      f.connect(gain);
      head = f;
    }
    gain.connect(out);

    let src: AudioScheduledSourceNode;
    if (v.type === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer(ctx);
      n.loop = true;
      src = n;
    } else {
      const o = ctx.createOscillator();
      o.type = v.type ?? 'square';
      const j = 1 + (Math.random() * 2 - 1) * (v.jitter ?? 0);
      if (v.notes) {
        for (const [i, hz] of v.notes.entries())
          o.frequency.setValueAtTime(Math.max(1, hz) * j, t0 + i * (v.step ?? 0.1));
      } else {
        o.frequency.setValueAtTime((v.freq ?? 440) * j, t0);
        if (v.freqEnd) o.frequency.exponentialRampToValueAtTime(v.freqEnd * j, t0 + dur);
      }
      src = o;
    }
    src.connect(head);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }
}
