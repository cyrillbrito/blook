/**
 * Whether Chrome lets Blook record a page: http(s) and file pages, except the Web Store,
 * which no extension may script. Without the `tabs` permission, a page outside <all_urls>
 * (chrome://, other extensions) shows no URL, so it fails here too.
 */
export function isRecordable(url: string | undefined): boolean {
  if (!url || !/^(https?|file):/.test(url)) return false;
  const { hostname, pathname } = new URL(url);
  return !(hostname === 'chromewebstore.google.com' || (hostname === 'chrome.google.com' && pathname.startsWith('/webstore')));
}
