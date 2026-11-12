// Audio slots. Each slot plays a CC0 file from the art pack when the manifest provides one (public/art/manifest.json,
// type "music" or "sfx", key = slot name). Until then: music slots are silent and sfx slots play a short synthesized blip.
export const MUSIC_SLOTS = ['music_title', 'music_town', 'music_l1'] as const;
export const SFX_SLOTS = ['swing', 'bow', 'hit', 'miss', 'block', 'player_hit', 'player_die', 'mon_die', 'butcher_die', 'fresh_meat', 'levelup',
  'potion', 'gold', 'pickup', 'item_drop', 'door', 'chest', 'sarc', 'barrel', 'explode', 'shrine', 'portal', 'book', 'scroll', 'repair',
  'cast_fire', 'cast_lightning', 'cast_magic', 'nope', 'ui_click', 'npc_griswold', 'npc_pepin', 'npc_adria', 'npc_cain', 'npc_ogden', 'npc_gillian',
  'npc_farnham', 'npc_wirt', 'npc_wounded'] as const;

const BLIP: Record<string, [number, number, OscillatorType]> = {
  swing: [220, 0.05, 'triangle'], bow: [500, 0.05, 'triangle'], hit: [120, 0.07, 'square'], miss: [300, 0.03, 'sine'], block: [700, 0.05, 'square'],
  player_hit: [90, 0.1, 'sawtooth'], mon_die: [70, 0.15, 'sawtooth'], levelup: [660, 0.3, 'sine'], potion: [400, 0.1, 'sine'], gold: [1200, 0.06, 'sine'],
  pickup: [800, 0.05, 'sine'], door: [150, 0.08, 'square'], chest: [250, 0.1, 'triangle'], barrel: [180, 0.08, 'square'], explode: [60, 0.3, 'sawtooth'],
  shrine: [520, 0.25, 'sine'], portal: [300, 0.4, 'sine'], cast_fire: [350, 0.12, 'sawtooth'], cast_lightning: [900, 0.1, 'square'], cast_magic: [600, 0.12, 'sine'],
  nope: [100, 0.1, 'square'], ui_click: [1000, 0.02, 'sine'], fresh_meat: [80, 0.6, 'sawtooth'], player_die: [55, 0.8, 'sawtooth'], butcher_die: [50, 0.6, 'sawtooth'],
};

export class Audio {
  ctx: AudioContext | null = null;
  files: Record<string, string> = {};
  buffers: Record<string, AudioBuffer> = {};
  music: AudioBufferSourceNode | null = null; musicKey = '';
  musicGain: GainNode | null = null; sfxGain: GainNode | null = null;
  constructor(public musicVol = 7, public sfxVol = 7) {}
  unlock() {
    if (this.ctx || typeof AudioContext === 'undefined') return;
    this.ctx = new AudioContext();
    this.musicGain = this.ctx.createGain(); this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.connect(this.ctx.destination);
    this.setVolumes(this.musicVol, this.sfxVol);
  }
  setVolumes(m: number, s: number) {
    this.musicVol = m; this.sfxVol = s;
    if (this.musicGain) this.musicGain.gain.value = (m / 10) * 0.5;
    if (this.sfxGain) this.sfxGain.gain.value = (s / 10) * 0.4;
  }
  async load(key: string): Promise<AudioBuffer | null> {
    if (this.buffers[key]) return this.buffers[key];
    const url = this.files[key];
    if (!url || !this.ctx) return null;
    try { const r = await fetch(url); this.buffers[key] = await this.ctx.decodeAudioData(await r.arrayBuffer()); return this.buffers[key]; } catch { return null; }
  }
  play(key: string) {
    if (!this.ctx || !this.sfxGain) return;
    if (key.startsWith('music_')) { void this.playMusic(key); return; }
    if (this.files[key]) { void this.load(key).then((b) => { if (b && this.ctx && this.sfxGain) { const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.sfxGain); s.start(); } }); return; }
    const bl = BLIP[key];
    if (!bl) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = bl[2]; o.frequency.value = bl[0];
    g.gain.setValueAtTime(0.5, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + bl[1]);
    o.connect(g); g.connect(this.sfxGain); o.start(); o.stop(this.ctx.currentTime + bl[1]);
  }
  async playMusic(key: string) {
    if (this.musicKey === key) return;
    this.musicKey = key;
    this.music?.stop(); this.music = null;
    const b = await this.load(key);
    if (!b || !this.ctx || !this.musicGain || this.musicKey !== key) return;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.connect(this.musicGain); s.start(); this.music = s;
  }
}
