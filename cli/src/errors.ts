// Errors the CLI expects, each with a stable exit code and a next step.
// Exit codes are part of the CLI's contract: add new ones, never reuse one.
export const EXIT = {
  ok: 0,
  /** Unexpected failure (a bug, or a crash in the browser). */
  error: 1,
  /** Bad arguments or options: wrong time format, unknown tab, bad selector, missing argument. */
  usage: 2,
  /** Input not found or not usable: bundle path, bundle contents, the extension folder. */
  notFound: 3,
  /** A well-formed time outside the recording. */
  timeRange: 4,
  /** No browser to replay in. */
  browser: 5,
  /** A download failed. */
  network: 6,
} as const;

export const EXIT_CODES_HELP = `Exit codes:
  0  ok
  1  unexpected error
  2  usage: bad or missing argument, option, time format, tab or selector
  3  not found or invalid: bundle path, bundle contents, extension folder
  4  time outside the recording
  5  no browser: run \`blook install-browser\` or install Google Chrome
  6  network: a download failed`;

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
