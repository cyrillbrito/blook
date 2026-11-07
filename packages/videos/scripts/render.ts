// Renders films/<film> to out/<film>.mp4. With --gif, also out/<film>.gif (960 px wide, for the README).
// Usage: bun run render <film> [--gif]
import { $ } from 'bun';
import { existsSync } from 'node:fs';

const film = process.argv[2];
if (!film || !existsSync(`films/${film}/index.html`)) {
  console.error('Usage: bun run render <film> [--gif]   (a folder in films/)');
  process.exit(2);
}

await $`mkdir -p out`;
await $`hyperframes render films/${film} -o out/${film}.mp4 --quiet`;
console.log(`out/${film}.mp4`);

if (process.argv.includes('--gif')) {
  const filter =
    'fps=25,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
  await $`ffmpeg -loglevel error -y -i out/${film}.mp4 -vf ${filter} -loop 0 out/${film}.gif`;
  console.log(`out/${film}.gif`);
}
