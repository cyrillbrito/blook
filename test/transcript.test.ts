/// <reference types="bun" />
// Transcript logic shared by the extension and `blook transcribe`: chunk results to session ms,
// merging, transcript.json, the timeline's speech entries, and the live pause check.
import { describe, expect, test } from 'bun:test';
import { chunkTranscript, mergeChunks, replaceSpeech, transcriptJson, type TranscriptSource } from '../lib/transcribe/transcript';
import { alignWords, PauseDetector } from '../lib/transcribe/vad';
import type { TranscriptChunkResult } from '../lib/types';

const source = (at: string): TranscriptSource => ({ method: 'openrouter', model: 'm', by: 'extension', at, blookVersion: '0.0.0' });

describe('chunk results to session ms', () => {
  test('seconds from the chunk start become session ms; edges in silence move to voiced edges', () => {
    const r = chunkTranscript(
      { t: 10_000, durationMs: 5000, voiced: [[1000, 2000], [3000, 4000]] },
      {
        segments: [{ start: 0, end: 4.5, text: ' Click here ' }],
        words: [
          { word: ' Click', start: 0, end: 1.5 }, // starts in the leading silence
          { word: 'here', start: 2.2, end: 4.5 }, // starts in the pause, ends after the speech
        ],
      },
    );
    expect(r.words).toEqual([
      { word: 'Click', start: 11_000, end: 11_500 },
      { word: 'here', start: 13_000, end: 14_000 },
    ]);
    expect(r.segments).toEqual([{ text: 'Click here', start: 11_000, end: 14_000 }]);
  });
  test('without voiced ranges times are only shifted', () => {
    const r = chunkTranscript({ t: 500, durationMs: 3000 }, { words: [{ word: 'hi', start: 0.25, end: 0.5 }], text: 'hi' });
    expect(r.words).toEqual([{ word: 'hi', start: 750, end: 1000 }]);
    // No segments: the whole text spans the chunk.
    expect(r.segments).toEqual([{ text: 'hi', start: 500, end: 3500 }]);
  });
  test('non-speech markers are dropped', () => {
    const r = chunkTranscript({ t: 0, durationMs: 1000 }, { text: '[BLANK_AUDIO]', segments: [{ start: 0, end: 1, text: ' [BLANK_AUDIO]' }], words: [{ word: '(silence)', start: 0, end: 1 }] });
    expect(r).toEqual({ words: [], segments: [] });
  });
});

describe('alignWords', () => {
  test('the first word of a voiced range snaps to its onset when it starts just after it', () => {
    // whisper.cpp DTW starts lag the voice by a few hundred ms after a pause.
    const out = alignWords([{ start: 1400, end: 1700 }, { start: 1700, end: 2000 }, { start: 5600, end: 6000 }], [[1000, 2000], [5000, 6000]]);
    expect(out).toEqual([{ start: 1000, end: 1700 }, { start: 1700, end: 2000 }, { start: 5000, end: 6000 }]);
  });
  test('a word far after the onset stays', () => {
    expect(alignWords([{ start: 2500, end: 2800 }], [[1000, 3000]])).toEqual([{ start: 2500, end: 2800 }]);
  });
});

describe('merging and transcript.json', () => {
  const chunk = (index: number, t: number, extra: Partial<TranscriptChunkResult> = {}): TranscriptChunkResult => ({
    index,
    t,
    segments: [{ text: `segment ${index}`, start: t, end: t + 1000 }],
    words: [{ word: 'a', start: t, end: t + 400 }, { word: 'b', start: t + 400, end: t + 1000 }],
    source: source(`2026-01-01T00:00:0${index}.000Z`),
    ...extra,
  });

  test('chunks merge in order; the newest source stands for the transcript', () => {
    const m = mergeChunks([chunk(1, 30_000), chunk(0, 0)]);
    expect(m.segments.map((s) => s.start)).toEqual([0, 30_000]);
    expect(m.source?.at).toBe('2026-01-01T00:00:01.000Z');
    const t = transcriptJson(m, 2);
    expect(t).toMatchObject({ status: 'ok', source: m.source, segmentCount: 2, wordCount: 4 });
    expect(t).not.toHaveProperty('note');
    expect(t.segments[1]).toEqual({ index: 1, t: 30_000, endT: 31_000, durationMs: 1000, text: 'segment 1', words: [{ word: 'a', t: 30_000, endT: 30_400 }, { word: 'b', t: 30_400, endT: 31_000 }] });
  });

  test('a failed chunk makes it partial, with errors and a note', () => {
    const m = mergeChunks([chunk(0, 0), { index: 1, t: 30_000, segments: [], words: [], error: 'OpenRouter 500' }]);
    const t = transcriptJson(m, 2);
    expect(t).toMatchObject({ status: 'partial', note: '1 of 2 audio chunks transcribed; failed: OpenRouter 500', errors: [{ chunk: 1, t: 30_000, error: 'OpenRouter 500' }] });
  });

  test('no transcript: none, with the mic error', () => {
    expect(transcriptJson(undefined, 0, { micError: 'NotAllowedError' })).toEqual({ status: 'none', note: 'no audio recorded: NotAllowedError', segmentCount: 0, wordCount: 0, segments: [] });
  });

  test('speech entries are replaced and sorted like buildTimeline (speech last on a tie)', () => {
    const timeline = [
      { t: 0, type: 'navigation', summary: 'nav' },
      { t: 500, type: 'speech', summary: 'old' },
      { t: 1000, type: 'click', summary: 'click' },
    ];
    const segments = transcriptJson(mergeChunks([chunk(0, 1000)]), 1).segments;
    expect(replaceSpeech(timeline, segments).map((e) => [e.t, e.type, e.summary])).toEqual([
      [0, 'navigation', 'nav'],
      [1000, 'click', 'click'],
      [1000, 'speech', '🗣 "segment 0"'],
    ]);
  });
});

describe('live pause check', () => {
  const RATE = 16_000;
  const tone = (ms: number, amp: number) => Float32Array.from({ length: (RATE * ms) / 1000 }, (_, i) => amp * Math.sin(i / 3));
  const join = (...parts: Float32Array[]) => {
    const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) out.set(p, (o += p.length) - p.length);
    return out;
  };

  test('a pause is the last 400 ms below the voiced threshold', () => {
    const d = new PauseDetector(400);
    expect(d.isPause(join(tone(300, 0.0005), tone(400, 0.3)), RATE)).toBe(false); // speaking now
    expect(d.isPause(join(tone(300, 0.3), tone(400, 0.0005)), RATE)).toBe(true); // just went quiet
    expect(d.isPause(join(tone(500, 0.0005), tone(200, 0.3), tone(200, 0.0005)), RATE)).toBe(false); // quiet too short
  });
});
