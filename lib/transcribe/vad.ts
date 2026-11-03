// Voice activity detection and word-time clean-up. Whisper's word times are loose: a word
// after a pause often "starts" in the silence before it (the first word of a chunk can span
// the whole leading silence). We find voiced ranges from the audio energy and move word
// boundaries that fall in silence to the nearest voiced edge.
// Pure functions, so they run in the offscreen document and in tests.

/** [start, end] in ms from the start of the chunk. */
export type Range = [number, number];

const FRAME_MS = 20;
/** Voiced if this many dB above the noise floor (10th percentile of frame levels). */
const ABOVE_FLOOR_DB = 12;
/** Never call anything below this voiced, however quiet the room. */
const MIN_VOICED_DB = -55;
/** Pauses shorter than this inside speech are bridged. */
const BRIDGE_MS = 200;
/** Voiced runs shorter than this are clicks, not speech. */
const MIN_RUN_MS = 80;
/** Padding added around each range for soft onsets and tails. */
const PAD_MS = 60;

/** Voiced ranges of mono PCM samples (-1..1). */
export function voicedRanges(samples: Float32Array, sampleRate: number): Range[] {
  const frame = Math.max(1, Math.round((sampleRate * FRAME_MS) / 1000));
  const levels: number[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    let sum = 0;
    for (let j = i; j < i + frame; j++) sum += samples[j]! * samples[j]!;
    levels.push(10 * Math.log10(sum / frame + 1e-12));
  }
  if (!levels.length) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)]!;
  const threshold = Math.max(floor + ABOVE_FLOOR_DB, MIN_VOICED_DB);

  const runs: Range[] = [];
  let start = -1;
  levels.forEach((db, i) => {
    if (db >= threshold && start < 0) start = i;
    if (db < threshold && start >= 0) {
      runs.push([start * FRAME_MS, i * FRAME_MS]);
      start = -1;
    }
  });
  if (start >= 0) runs.push([start * FRAME_MS, levels.length * FRAME_MS]);

  const bridged: Range[] = [];
  for (const r of runs) {
    const last = bridged.at(-1);
    if (last && r[0] - last[1] < BRIDGE_MS) last[1] = r[1];
    else bridged.push([...r]);
  }
  const total = levels.length * FRAME_MS;
  return bridged
    .filter(([a, b]) => b - a >= MIN_RUN_MS)
    .map(([a, b]): Range => [Math.max(0, a - PAD_MS), Math.min(total, b + PAD_MS)])
    .reduce<Range[]>((out, r) => {
      const last = out.at(-1);
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
      else out.push(r);
      return out;
    }, []);
}

export interface TimedWord {
  start: number;
  end: number;
}

/**
 * Moves word boundaries out of silence, in order: a start in silence moves to the next voiced
 * start, an end in silence moves back to the previous voiced end. A word that lies wholly in
 * silence moves to the next voiced range, keeping its length (at most to that range's end).
 * Starts never go before the previous word's start, so order is kept. Times in ms, same base
 * as `voiced`. Words past the last voiced range are left as they are.
 */
export function alignWords<W extends TimedWord>(words: W[], voiced: Range[]): W[] {
  if (!voiced.length) return words;
  const inside = (t: number) => voiced.find(([a, b]) => t >= a && t <= b);
  const nextStart = (t: number) => voiced.find(([a]) => a >= t);
  const prevEnd = (t: number) => [...voiced].reverse().find(([, b]) => b <= t)?.[1];

  let prevStart = 0;
  let prevEndT = 0;
  return words.map((w) => {
    const len = Math.max(0, w.end - w.start);
    // Whisper often overlaps neighbours, so a voiced start only has to keep order. A start in
    // silence moves to the first voiced range after the previous word.
    let s = Math.max(w.start, prevStart);
    let range = inside(w.start) && inside(s);
    if (!range) {
      const next = nextStart(Math.max(w.start, prevEndT));
      if (!next) return w;
      s = Math.max(next[0], prevEndT);
      range = next;
    }
    let e = Math.max(w.end, s);
    if (!inside(e)) {
      const back = prevEnd(e);
      e = back !== undefined && back > s ? back : Math.min(s + len, range[1]);
    }
    if (e <= s) e = Math.min(s + Math.max(len, FRAME_MS), range[1]);
    prevStart = s;
    prevEndT = e;
    return { ...w, start: Math.round(s), end: Math.round(e) };
  });
}
