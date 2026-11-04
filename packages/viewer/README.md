# @blook/viewer

The React viewer for a Blook bundle: the rrweb replay with the mic audio on one clock, next to the timeline, transcript, network, WebSockets and console. It has no browser-extension APIs, so any React host can use it.

```tsx
import { ViewerApp } from '@blook/viewer';

// Empty, it shows a drop zone and a picker for a bundle .zip or unzipped folder.
<ViewerApp initial={{ label: 'bundle', load: async () => bundle }} onDownload={async () => {}} />;
```

`bundleFromZip`, `bundleFromFiles` and `bundleFromUserFiles` load a bundle; `Viewer` shows one already loaded. The host's Tailwind stylesheet needs:

```css
@import "tailwindcss";
@import "@blook/ui/theme.css";
@import "@blook/viewer/styles.css";
```

`note` adds host content under the picker. The extension's Replay page (`packages/extension/entrypoints/replay/`) is the reference host; the website's `/viewer` (`packages/site`) is the other.
