// `install-browser`: download the Chrome headless shell that the bundled
// playwright-core expects, into Playwright's own cache, so chromium.launch()
// finds it. Works in a `bun build --compile` binary, where Playwright's
// installer can't run (it forks a Node script).
import { existsSync, mkdirSync, writeFileSync, chmodSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright-core';
// Not in the package exports, hence the relative path. A static import, so a compiled binary embeds it.
import browsers from '../node_modules/playwright-core/browsers.json' with { type: 'json' };

const CDNS = ['https://cdn.playwright.dev', 'https://playwright.download.prss.microsoft.com/dbazure/download/playwright'];

function cftPlatform(): string {
  const { platform, arch } = process;
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (platform === 'linux') return arch === 'arm64' ? 'linux-arm64' : 'linux64';
  if (platform === 'win32' && arch === 'x64') return 'win64';
  throw new Error(`No Chrome headless shell build for ${platform}-${arch}`);
}

export interface HeadlessShell {
  version: string;
  dir: string;
  executable: string;
  installed: boolean;
}

/** Where Playwright looks for its headless shell (honours PLAYWRIGHT_BROWSERS_PATH). */
export function headlessShell(): HeadlessShell {
  const shell = browsers.browsers.find((b) => b.name === 'chromium-headless-shell');
  if (!shell?.browserVersion) throw new Error('playwright-core/browsers.json has no chromium-headless-shell');
  // chromium.executablePath() is <cache>/chromium-<rev>/...; the shell sits next to it.
  const m = /^(.*)[\\/]chromium-\d+[\\/]/.exec(chromium.executablePath());
  if (!m) throw new Error(`Can't find Playwright's browser cache from ${chromium.executablePath()}`);
  const dir = join(m[1]!, `chromium_headless_shell-${shell.revision}`);
  const plat = cftPlatform();
  const executable = join(dir, `chrome-headless-shell-${plat}`, plat === 'win64' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
  return { version: shell.browserVersion, dir, executable, installed: existsSync(join(dir, 'INSTALLATION_COMPLETE')) };
}

export async function installBrowser(opts: { force?: boolean; log?: (msg: string) => void } = {}): Promise<HeadlessShell> {
  const log = opts.log ?? (() => {});
  const shell = headlessShell();
  if (shell.installed && !opts.force) {
    log(`Chrome headless shell ${shell.version} already installed`);
    return shell;
  }
  const plat = cftPlatform();
  const path = `builds/cft/${shell.version}/${plat}/chrome-headless-shell-${plat}.zip`;
  let zip: Uint8Array | undefined;
  const errors: string[] = [];
  for (const cdn of CDNS) {
    const url = `${cdn}/${path}`;
    log(`Downloading ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      zip = new Uint8Array(await res.arrayBuffer());
      break;
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!zip) throw new Error(`Download failed:\n${errors.join('\n')}`);
  log(`Extracting ${(zip.length / 1e6).toFixed(0)} MB to ${shell.dir}`);
  // Extract next to the target, then rename, so a failed run leaves nothing half-installed.
  const tmp = `${shell.dir}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  for (const [name, data] of Object.entries(unzipSync(zip))) {
    if (name.endsWith('/')) continue;
    const p = join(tmp, name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, data);
    // fflate drops file modes: the shell has a few executables and dylibs, so mark all as executable.
    chmodSync(p, 0o755);
  }
  writeFileSync(join(tmp, 'INSTALLATION_COMPLETE'), '');
  rmSync(shell.dir, { recursive: true, force: true });
  renameSync(tmp, shell.dir);
  return { ...shell, installed: true };
}
