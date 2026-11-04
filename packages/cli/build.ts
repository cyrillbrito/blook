// Compile the single `blook` binary. Usage: bun build.ts [--target=bun-linux-x64] [--outfile=dist/blook-linux-x64]
// playwright-core loads its package.json and browsers.json with require(path.join(packageRoot, ...)).
// Bun can't embed a computed path, so the binary would look for the build machine's node_modules.
// The plugin turns those into static requires, which get bundled.
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { target: { type: 'string' }, outfile: { type: 'string' } } });

const res = await Bun.build({
  entrypoints: ['src/cli.ts'],
  minify: true,
  external: ['chromium-bidi', 'chromium-bidi/*'],
  compile: { target: (values.target ?? `bun-${process.platform}-${process.arch}`) as Bun.Build.Target, outfile: values.outfile ?? 'dist/blook' },
  plugins: [
    {
      name: 'playwright-static-json',
      setup(build) {
        build.onLoad({ filter: /playwright-core[\\/]lib[\\/][^\\/]+\.js$/ }, async ({ path }) => {
          const src = await Bun.file(path).text();
          return {
            loader: 'js',
            contents: src.replace(
              /require\(\w+\.default\.join\(packageRoot, "(package|browsers)\.json"\)\)/g,
              'require("../$1.json")',
            ),
          };
        });
      },
    },
  ],
});
if (!res.success) {
  for (const log of res.logs) console.error(log);
  process.exit(1);
}
console.log(res.outputs.map((o) => o.path).join('\n'));
