// The Blook viewer: a React app around one loaded bundle. No browser-extension APIs:
// hosts pass what they own (the initial loader, the download handler) as ViewerApp props.
// Styles: @import "@blook/viewer/styles.css" in the host's Tailwind stylesheet.
export { ViewerApp, type ViewerAppProps } from './ViewerApp';
export { Viewer } from './Viewer';
export * from './bundle';
