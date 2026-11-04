// stdout carries the result (JSON, or a path); stderr carries everything else.
let quiet = false;
export const setQuiet = (q: boolean) => void (quiet = q);

export const printJson = (v: unknown) => void process.stdout.write(JSON.stringify(v, null, 2) + '\n');
export const printLine = (s: string) => void process.stdout.write(s.endsWith('\n') ? s : s + '\n');

/** Progress and notes for people, on stderr. Silenced by --quiet. */
export const note = (msg: string) => void (quiet || process.stderr.write(msg + '\n'));
export const warn = (msg: string) => note(`warning: ${msg}`);

export const useColor = (stream: NodeJS.WriteStream) => !!stream.isTTY && !process.env.NO_COLOR;
