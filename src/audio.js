import { distance } from './world.js';

const samples = ['pistol', 'shotgun', 'smg', 'pump', 'reload-short', 'reload-smg-short',
  'growl2', 'z1', 'z5', 'z10', 'z14', 'z20', 'zombienoise3', 'fastzombie1'];
const voices = {
  shambler: ['growl2', 'z1', 'z5', 'zombienoise3'],
  shrieker: ['z10', 'fastzombie1', 'z14'],
  brute: ['z20', 'growl2', 'z5'],
};

function setPosition(node, position) {
  if (node.positionX) {
    node.positionX.value = position.x;
    node.positionY.value = position.y;
    node.positionZ.value = position.z;
  } else node.setPosition(position.x, position.y, position.z);
}

export function createAudio() {
  const buffers = new Map(), active = new Set();
  let context, master, ambience, threats, weapons, effects, lastCreak = 0, volume = .76, paused = true;

  async function unlock() {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
      master = context.createGain();
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 18;
      limiter.ratio.value = 6;
      limiter.attack.value = .003;
      limiter.release.value = .20;
      master.gain.value = volume;
      master.connect(limiter).connect(context.destination);
      [ambience, threats, weapons, effects] = Array.from({ length: 4 }, () => {
        const bus = context.createGain(); bus.connect(master); return bus;
      });
      ambience.gain.value = .46;
      threats.gain.value = .67;
      weapons.gain.value = .78;
      effects.gain.value = .47;
      ambienceLoop();
      for (const key of samples) {
        fetch(new URL('./assets/audio/' + key + '.ogg', import.meta.url))
          .then(response => { if (!response.ok) throw Error(key); return response.arrayBuffer(); })
          .then(data => context.decodeAudioData(data)).then(data => buffers.set(key, data))
          .catch(() => {});
      }
      makeSounds();
    }
    if (context.state !== 'running') await context.resume().catch(() => {});
  }

  function procedural(name, duration, calculate, channels = 1) {
    const count = Math.ceil(context.sampleRate * duration), b = context.createBuffer(channels, count, context.sampleRate);
    for (let ch = 0; ch < channels; ch++) {
      const data = b.getChannelData(ch);
      let noise = 0;
      for (let i = 0; i < count; i++) {
        const white = Math.random() * 2 - 1;
        noise = .935 * noise + white * .065;
        data[i] = calculate(i / context.sampleRate, white, noise, ch);
      }
    }
    buffers.set(name, b);
    return b;
  }

  function ambienceLoop() {
    const source = context.createBufferSource();
    source.buffer = procedural('wind', 10, (t, n, smooth, c) =>
      smooth * (.14 + .047 * Math.sin(t * Math.PI * .4 + c)) * Math.min(1, t * 5, (10 - t) * 5) +
      Math.sin(t * Math.PI * 37) * .0065 * (Math.sin(t * Math.PI * .2) ** 2), 2);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 485;
    source.connect(filter).connect(ambience);
    source.start();
  }

  function makeSounds() {
    procedural('gravel', .26, (t, n, low) => (.55*n + .45*low) * Math.exp(-t * 14)
      * Math.min(1, t * 120) * (.64 + .36*Math.sin(2*Math.PI*38*t)**2));
    procedural('brush', .43, (t, n, low) => (.46*n + .54*low) * Math.exp(-t * 7)
      * Math.min(1, t*110) * (.65 + .35 * Math.sin(2*Math.PI*59*t)**2));
    procedural('creak', .81, (t, n, low) => (Math.sin(2*Math.PI*(76 + 19*t)*t)*.23 + low*.77)
      * Math.sin(Math.PI*t/.81)**3 * (Math.sin(t*36)**2));
    procedural('switch', .10, (t, n, low) => (n*.68 + low*.32) * Math.exp(-t*54) * Math.min(1,t*160));
    procedural('flare', .68, (t, n, low) => (n*.74 + low*.26) * .50 * Math.exp(-t*5)
      * Math.min(1,t*74) * (.52 + .48*Math.sin(170*t)**2));
    procedural('swing', .23, (t, n, low) => (n*.4 + low*.6) * .56 * Math.sin(Math.PI*t/.23)**3);
    procedural('armor', .33, (t, n) => (.43 * Math.sin(2*Math.PI*91*t) + n*.57)
      * Math.exp(-t*22) * Math.min(1,t*90));
    procedural('fallback', .42, (t, n, low) => (n*.56 + low*.44)
      * Math.exp(-t*23) * .93 * Math.min(1,t*900));
  }

  function play(name, { bus = effects, gain = .4, speed = 1, loc, priority = 0, occluded = false, id = null } = {}) {
    const data = buffers.get(name);
    if (!data || !context || !bus) return;
    const isVoice = bus === threats;
    if (isVoice && active.size >= 6) {
      const least = [...active].sort((a,b) => a.priority - b.priority)[0];
      if (least.priority >= priority) return;
      least.source.stop(); active.delete(least);
    }
    const player = context.createBufferSource(), adjust = context.createGain();
    player.buffer = data; player.playbackRate.value = speed;
    adjust.gain.value = gain;
    player.connect(adjust);
    let panner;
    if (loc) {
      panner = context.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'linear';
      panner.refDistance = 1.35; panner.maxDistance = 21; panner.rolloffFactor = 1;
      setPosition(panner, loc);
      if (occluded) {
        const muffled = context.createBiquadFilter();
        muffled.type = 'lowpass'; muffled.frequency.value = 560;
        adjust.connect(muffled).connect(panner);
      } else adjust.connect(panner);
      panner.connect(bus);
    } else adjust.connect(bus);
    if (isVoice) {
      const cue = { source: player, panner, priority, id };
      active.add(cue);
      player.onended = () => active.delete(cue);
    }
    player.start();
  }

  function setPaused(value) {
    paused = value;
    if (!context) return;
    const t = context.currentTime;
    ambience.gain.setTargetAtTime(value ? .12 : .46, t, .11);
    threats.gain.setTargetAtTime(value ? .01 : .67, t, .06);
  }

  function setVolume(value) {
    volume = value;
    if (master) master.gain.setTargetAtTime(value, context.currentTime, .06);
  }

  function listener(position, facing, up, run) {
    if (!context) return;
    const l = context.listener;
    setPosition(l, position);
    if (l.forwardX) {
      l.forwardX.value = facing.x; l.forwardY.value = facing.y; l.forwardZ.value = facing.z;
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else l.setOrientation(facing.x, facing.y, facing.z, up.x, up.y, up.z);
    for (const cue of active) {
      if (!cue.id) continue;
      const zombie = run.enemies.find(e => e.id === cue.id);
      if (zombie && cue.panner) setPosition(cue.panner, { x:zombie.x,y:zombie.y+1.38,z:zombie.z });
    }
    if (!paused && run.time > lastCreak) {
      const a = Math.random() * Math.PI * 2, d = 7 + Math.random() * 10;
      lastCreak = run.time + 9 + Math.random() * 12;
      play('creak', { bus: ambience, loc: { x:position.x+Math.cos(a)*d,y:position.y+.8,z:position.z+Math.sin(a)*d },
        gain: .21, speed: .72+Math.random()*.53 });
    }
  }

  function events(batch, run) {
    if (!context) return;
    const p = run.player;
    for (const e of batch) {
      if (e.type === 'shot') {
        play(buffers.has(e.weapon) ? e.weapon : 'fallback', { bus: weapons, gain: e.weapon === 'shotgun' ? .81 : .59,
          speed: .94 + Math.random() * .13 });
      } else if (e.type === 'reload') {
        play(e.weapon === 'smg' ? 'reload-smg-short' : e.weapon === 'shotgun' ? 'pump' : 'reload-short',
          { bus: weapons, gain: .35 });
      } else if (e.type === 'loaded' || e.type === 'dry' || e.type === 'light' || e.type === 'pickup') {
        play('switch', { gain: e.type === 'dry' ? .36 : .23, speed: e.type === 'pickup' ? 1.57 : 1 });
      } else if (e.type === 'footstep') {
        play(e.road ? 'gravel' : 'brush', { gain: e.quiet ? .13 : .24, speed: .86 + Math.random() * .26 });
      } else if (e.type === 'flare') {
        play('flare', { gain: .39, loc: e });
      } else if (e.type === 'death' || e.type === 'armorHit') {
        play('armor', { gain: .61, speed: e.type === 'death' ? .62 : .91 });
      } else if (e.type === 'voice' || e.type === 'shriek' || e.type === 'windup' || e.type === 'swing') {
        const gap = distance(e, p);
        const urgent = e.type === 'windup' || e.type === 'swing' || e.type === 'shriek';
        if (gap > (urgent ? 20 : 17)) continue;
        const list = voices[e.kind] || voices.shambler;
        const key = e.type === 'shriek' ? 'fastzombie1' : e.type === 'swing' ? 'swing' : list[Math.floor(Math.random() * list.length)];
        const audible = 1 / (1 + (Math.max(0, gap - 1.5) / 5.1) ** 2);
        const occluded = !run.world.clear({ x:p.x,y:p.y+p.eyeHeight,z:p.z }, e, false);
        play(key, { bus: threats, id: e.id, loc: e, occluded,
          priority: (urgent ? 3.3 : 1.25) * audible,
          gain: (e.type === 'shriek' ? .89 : e.type === 'windup' ? .68 : .54) * audible * (occluded ? .52 : 1),
          speed: (e.kind === 'brute' ? .68 : e.kind === 'shrieker' ? 1.12 : .90) + Math.random() * .21 });
      }
    }
  }

  return { unlock, setPaused, setVolume, listener, events, reset() {
    lastCreak = 2.8;
    for (const cue of active) cue.source.stop();
    active.clear();
  } };
}
