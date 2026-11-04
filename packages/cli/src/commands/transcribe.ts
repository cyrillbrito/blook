// `blook transcribe <bundle>`: fill or re-run transcript.json from the bundle's audio.
import { resolve } from 'node:path';
import { InvalidArgumentError, Option, type Command } from 'commander';
import { printJson } from '../output.ts';
import { transcribeBundle, type Method } from '../transcribe.ts';
import { DEFAULT_WHISPER_MODEL, modelsDir } from '../whisper.ts';
import { TRANSCRIPTION_MODEL } from '@blook/core/types';

export function registerTranscribe(program: Command) {
  program
    .command('transcribe')
    .description('transcribe the narration from audio/ into transcript.json (OpenRouter or local whisper.cpp)')
    .argument('<bundle>', 'a blook-*.zip or its unzipped folder; rewritten in place unless --out')
    .addOption(
      new Option('--method <method>', 'openrouter (needs OPENROUTER_API_KEY) or whisper (local whisper-cli); default: openrouter with a key, else whisper')
        .choices(['openrouter', 'whisper']),
    )
    .option('--model <name>', `whisper: model name or ggml .bin path (default ${DEFAULT_WHISPER_MODEL}, downloaded once to ${modelsDir().replace(process.env.HOME ?? '~', '~')}); openrouter: model id (default ${TRANSCRIPTION_MODEL})`)
    .option('--force', 'run again even if transcript.json status is already ok')
    .option('--out <path>', 'write the result here instead (a .zip path, or a folder)', (v: string) => {
      if (!v.trim()) throw new InvalidArgumentError('Pass a file or folder path.');
      return v;
    })
    .addHelpText('after', `
Transcribes every audio chunk, then rewrites transcript.json, the speech entries of timeline.json,
and session.json (.transcript, .counts, .files). A zip is rewritten via a temp file. Words get
session ms, with edges moved out of silence (audio/chunks.json voiced ranges), as in the extension.
Skips when transcript.json status is ok, unless --force. If every chunk fails, the bundle is left as it was.
Env: OPENROUTER_API_KEY, BLOOK_WHISPER_CLI (whisper-cli path), BLOOK_MODELS_DIR.

Output: { path, skipped, status, note?, method, model, segments, words, chunks, errors?, elapsedMs,
source: { method, model, by, at, blookVersion } }. Progress on stderr.

Examples:
  blook transcribe blook-2026-11-03_21-12-51.zip                   # OpenRouter with a key, else whisper
  blook transcribe blook-2026-11-03_21-12-51.zip --method whisper --force
  blook transcribe blook-2026-11-03_21-12-51/ --method whisper --model small.en --out /tmp/b.zip
Next: jq -r '.segments[] | "\\(.t)\\t\\(.text)"' transcript.json, or \`blook skill print\`.`)
    .action(async (bundle: string, opts: { method?: Method; model?: string; force?: boolean; out?: string }) => {
      printJson(await transcribeBundle(resolve(bundle), { ...opts, out: opts.out ? resolve(opts.out) : undefined }));
    });
}
