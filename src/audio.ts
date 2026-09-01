// audio.ts — owns all sound. Everything is SYNTHESISED with the Web Audio API
// (no audio files to ship, load or license): a paper tear is a burst of
// band-passed noise with a crackly amplitude envelope, a landing sheet is a
// short low rustle, and the finish is a soft two-note chime.
//
// Browsers block audio until a user gesture, so the context is created lazily
// and resume() is called from the first real interaction.

const MASTER = 0.5;

export interface Sfx {
  /** Paper ripping free of the pad. `strength` 0..1 scales brightness/level. */
  tear(strength?: number): void;
  /** A discarded sheet settling on the mat. */
  land(): void;
  /** The sculpture is fully revealed. */
  chime(): void;
  resume(): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let muted = false;
  let lastTear = 0;

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null; // no Web Audio — run silent rather than throwing
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(ctx.destination);

    // One second of white noise, reused as the source for every paper sound.
    const len = Math.floor(ctx.sampleRate);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noiseSource(c: AudioContext, rate: number): AudioBufferSourceNode {
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.playbackRate.value = rate;
    return src;
  }

  function tear(strength = 1): void {
    const c = ensure();
    if (!c || muted || !master) return;
    const now = c.currentTime;

    // Rapid-fire tears (the auto-reveal peels ~12 sheets a second) would stack
    // into a harsh buzz — duck each one that follows close on the last.
    const gap = now - lastTear;
    const crowd = gap < 0.18 ? 0.42 : 1.0;
    lastTear = now;

    const dur = 0.16 + Math.random() * 0.1;
    const peak = 0.35 * (0.55 + strength * 0.45) * crowd;

    const src = noiseSource(c, 0.85 + Math.random() * 0.4);

    // Band-pass sweeping upward: the "zip" of fibres letting go.
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(900 + Math.random() * 400, now);
    bp.frequency.exponentialRampToValueAtTime(3200 + Math.random() * 1600, now + dur);

    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 620;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.008);
    // Crackle: step the gain around at irregular intervals while it decays, so
    // it reads as fibres tearing rather than a smooth noise swell.
    let t = now + 0.012;
    while (t < now + dur) {
      const fall = 1 - (t - now) / dur;
      g.gain.setValueAtTime(peak * fall * (0.32 + Math.random() * 0.68), t);
      t += 0.006 + Math.random() * 0.012;
    }
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(bp).connect(hp).connect(g).connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  function land(): void {
    const c = ensure();
    if (!c || muted || !master) return;
    const now = c.currentTime;
    const dur = 0.13;

    const src = noiseSource(c, 0.6 + Math.random() * 0.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, now);
    lp.frequency.exponentialRampToValueAtTime(420, now + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.1, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(lp).connect(g).connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  function chime(): void {
    const c = ensure();
    if (!c || muted || !master) return;
    const now = c.currentTime;
    // A gentle rising fifth — the reveal has landed.
    [
      { f: 660, at: 0.0 },
      { f: 990, at: 0.11 },
    ].forEach(({ f, at }) => {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.linearRampToValueAtTime(0.12, now + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.5);
      osc.connect(g).connect(master!);
      osc.start(now + at);
      osc.stop(now + at + 0.55);
    });
  }

  function resume(): void {
    const c = ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  return {
    tear,
    land,
    chime,
    resume,
    setMuted(m: boolean): void {
      muted = m;
      if (master && ctx) {
        master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.02);
      }
    },
    isMuted: () => muted,
  };
}
