// Errors the CLI expects, each with a stable exit code and a next step.
// Exit codes are part of the CLI's contract: add new ones, never reuse one.

/** Every exit code with its line in `blook --help`. */
const CODES = {
  ok: [0, 'ok'],
  error: [1, 'unexpected error'],
  usage: [2, 'usage: bad or missing argument, option, time format, tab or selector'],
  notFound: [3, 'not found or invalid: bundle path, bundle contents, extension folder'],
  timeRange: [4, 'time outside the recording'],
  browser: [5, 'no browser: run `blook install-browser` or install Google Chrome'],
  network: [6, 'network: a download or request failed'],
  transcriber: [7, 'no speech-to-text: set OPENROUTER_API_KEY or install whisper-cli (`brew install whisper-cpp`)'],
} as const;

export const EXIT = Object.fromEntries(Object.entries(CODES).map(([k, [code]]) => [k, code])) as {
  [K in keyof typeof CODES]: (typeof CODES)[K][0];
};

export const EXIT_CODES_HELP = `Exit codes:\n${Object.values(CODES)
  .map(([code, text]) => `  ${code}  ${text}`)
  .join('\n')}`;

export class CliError extends Error {
  readonly exitCode: number;
  /** What to do next, one sentence. */
  readonly hint?: string;
  constructor(message: string, exitCode: number, hint?: string) {
    super(message);
    this.exitCode = exitCode;
    this.hint = hint;
  }
}
