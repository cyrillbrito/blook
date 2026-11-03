// Playback on the session clock. One Clock is the master; the rrweb Replayer of the shown tab
// and the mic audio follow it. Times are session ms (the bundle's `t`).
import { Replayer } from '@rrweb/replay';
import type { eventWithTime } from '@rrweb/types';
import type { AudioChunk, Bundle } from './bundle';

type Listener = () => void;

export class Clock {
  playing = false;
  speed = 1;
  private t0 = 0; // session time at wall0
  private wall0 = 0;
  private raf = 0;
  private changeListeners = new Set<Listener>();
  private tickListeners = new Set<Listener>();

  constructor(readonly end: number) {}

  now(): number {
    if (!this.playing) return this.t0;
    return Math.min(this.end, this.t0 + (performance.now() - this.wall0) * this.speed);
  }

  play() {
    if (this.playing) return;
    if (this.t0 >= this.end) this.t0 = 0;
    this.wall0 = performance.now();
    this.playing = true;
    this.loop();
    this.emitChange();
  }

  pause() {
    if (!this.playing) return;
    this.t0 = this.now();
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.emitChange();
    this.emitTick();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(t: number) {
    this.t0 = Math.max(0, Math.min(this.end, t));
    this.wall0 = performance.now();
    this.emitChange();
    this.emitTick();
  }

  setSpeed(speed: number) {
    this.t0 = this.now();
    this.wall0 = performance.now();
    this.speed = speed;
    this.emitChange();
  }

  /** Play/pause/seek/speed changes. */
  onChange(fn: Listener) {
    this.changeListeners.add(fn);
    return () => void this.changeListeners.delete(fn);
  }

  /** Every animation frame while playing, and after seeks. */
  onTick(fn: Listener) {
    this.tickListeners.add(fn);
    return () => void this.tickListeners.delete(fn);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.changeListeners.clear();
    this.tickListeners.clear();
  }

  private loop = () => {
    if (!this.playing) return;
    if (this.now() >= this.end) {
      this.t0 = this.end;
      this.playing = false;
      this.emitChange();
      this.emitTick();
      return;
    }
    this.emitTick();
    this.raf = requestAnimationFrame(this.loop);
  };

  private emitChange() {
    for (const fn of this.changeListeners) fn();
  }

  private emitTick() {
    for (const fn of this.tickListeners) fn();
  }
}

/**
 * The rrweb Replayer of one tab, slaved to the clock. The replayer's offset 0 is the tab's
 * first event (`base`), so session time t is offset `t - base`.
 */
export class TabReplay {
  readonly replayer: Replayer;
  readonly base: number;
  private last: number;
  private state: 'idle' | 'playing' = 'idle';
  private offs: (() => void)[] = [];
  width = 0;
  height = 0;
  onResize?: () => void;

  constructor(
    root: HTMLElement,
    events: eventWithTime[],
    private clock: Clock,
    opts: { canvas: boolean },
  ) {
    this.base = events[0]!.timestamp;
    this.last = events.at(-1)!.timestamp;
    const meta = events.find((e) => e.type === 4) as { data: { width: number; height: number } } | undefined;
    this.width = meta?.data.width ?? 1024;
    this.height = meta?.data.height ?? 768;
    this.replayer = new Replayer(events, {
      root,
      showWarning: false,
      skipInactive: false,
      // Canvas recordings are WebP snapshots; rrweb only draws them with this on.
      UNSAFE_replayCanvas: opts.canvas,
      mouseTail: { strokeStyle: 'rgba(239, 68, 68, 0.6)', lineWidth: 2, duration: 600 },
      triggerFocus: false,
    });
    this.replayer.on('resize', (d) => {
      const dim = d as { width: number; height: number };
      this.width = dim.width;
      this.height = dim.height;
      this.onResize?.();
    });
    this.offs.push(clock.onChange(() => this.sync(true)));
    this.offs.push(clock.onTick(() => this.sync(false)));
    this.sync(true);
  }

  /** Tab events cover session time t. */
  covers(t: number) {
    return t >= this.base;
  }

  private sync(force: boolean) {
    const t = this.clock.now();
    const offset = Math.max(0, t - this.base);
    const shouldPlay = this.clock.playing && t >= this.base && t < this.last;
    if (force) {
      // Re-anchor on every play/pause/seek/speed change.
      this.replayer.setConfig({ speed: this.clock.speed });
      if (shouldPlay) {
        this.replayer.play(offset);
        this.state = 'playing';
      } else {
        this.replayer.pause(Math.min(offset, this.last - this.base));
        this.state = 'idle';
      }
      return;
    }
    if (shouldPlay && this.state !== 'playing') {
      this.replayer.play(offset);
      this.state = 'playing';
    } else if (!shouldPlay && this.state === 'playing') {
      this.state = 'idle';
    } else if (shouldPlay && Math.abs(this.replayer.getCurrentTime() - offset) > 500) {
      // Drifted (tab throttled, slow rebuild): snap back to the clock.
      this.replayer.play(offset);
    }
  }

  destroy() {
    for (const off of this.offs) off();
    this.replayer.pause();
    this.replayer.destroy();
  }
}

/** Plays the mic chunks in sync with the clock. */
export class AudioSync {
  private el = new Audio();
  private urls = new Map<number, string>();
  private current?: AudioChunk;
  private offs: (() => void)[] = [];
  muted = false;

  constructor(
    private bundle: Bundle,
    private clock: Clock,
  ) {
    this.el.preload = 'auto';
    this.offs.push(clock.onChange(() => this.sync(true)));
    this.offs.push(clock.onTick(() => this.sync(false)));
  }

  get available() {
    return this.bundle.audio.some((c) => this.bundle.file(c.file));
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.el.muted = m;
  }

  private url(c: AudioChunk) {
    let url = this.urls.get(c.index);
    if (!url) {
      const bytes = this.bundle.file(c.file);
      if (!bytes) return undefined;
      url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: c.mimeType?.split(';')[0] ?? 'audio/webm' }));
      this.urls.set(c.index, url);
    }
    return url;
  }

  private sync(force: boolean) {
    const t = this.clock.now();
    const chunk = this.bundle.audio.find((c) => t >= c.t && t < (c.endT ?? c.t + 31_000));
    if (!this.clock.playing || !chunk || this.clock.speed > 4) {
      if (!this.el.paused) this.el.pause();
      this.current = chunk;
      return;
    }
    const want = (t - chunk.t) / 1000;
    if (chunk !== this.current || !this.el.src) {
      const url = this.url(chunk);
      if (!url) return;
      this.current = chunk;
      this.el.src = url;
      force = true;
    }
    this.el.playbackRate = this.clock.speed;
    if (force || Math.abs(this.el.currentTime - want) > 0.3) this.el.currentTime = want;
    if (this.el.paused) this.el.play().catch(() => {});
  }

  destroy() {
    for (const off of this.offs) off();
    this.el.pause();
    this.el.src = '';
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
  }
}

/** Index of the last item with t <= now in a t-sorted array, or -1. */
export function lastAtOrBefore<T extends { t: number }>(items: T[], now: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.t <= now) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
