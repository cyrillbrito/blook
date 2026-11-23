# Chrome Web Store listing

Blook is public on the [Chrome Web Store](https://chromewebstore.google.com/detail/njijkneplfdknfbmbokldfpbdhgpppbi), item ID `njijkneplfdknfbmbokldfpbdhgpppbi`, published from the [Developer Dashboard](https://chrome.google.com/webstore/devconsole). Users install the extension only from there. The README (the official badge), the site (header, hero button, the badge in Install, footer, the viewer's drop zone) and `blook extension` link to it.

This folder holds what the dashboard shows:

- [listing.md](listing.md): title, summary, description, category, images
- [privacy-practices.md](privacy-practices.md): single purpose, permission justifications, remote code, data usage
- [PRIVACY.md](../../PRIVACY.md): the privacy policy, linked from the dashboard
- `images/`: store icon, the 5 listing screenshots (`listing-*.png`, 1280×800), the real product screenshots (`screenshot-*.png`; `screenshot-4-popup.png` is the toolbar popup at 2x, shown on the site, and `screenshot-4-sidepanel.png` is the old side panel, still used by the `store-intro` film), small promo tile (440×280), and `chrome-web-store-badge.png`, Google's unmodified "Available in the Chrome Web Store" badge for the README and the site ([branding rules](https://developer.chrome.com/docs/webstore/branding))
- [screenshots.html](screenshots.html): the source of the listing screenshots
- [promo-small.html](promo-small.html): the source of the promo tile (logo on light slate, a faint vermilion glow); render it at 440×280 and screenshot
- [demo-app/](demo-app/): the fictional team chat recorded for the screenshots and the site's example timeline. `bun packages/store/demo-app/server.ts` serves it on `http://localhost:4317` (restart it for a clean channel). A message with an emoji fails to save (500, `console.error`), and the WebSocket sync removes it.

## Releasing an update

1. Run the release workflow (see `AGENTS.md`). It bumps the version and attaches `blook-chrome.zip` to the GitHub release. The store rejects a ZIP whose version isn't higher than the published one.
2. In the dashboard's [Package page for Blook](https://chrome.google.com/webstore/devconsole/c9806a17-57e3-495f-8cef-7a4245cfb141/njijkneplfdknfbmbokldfpbdhgpppbi/edit/package), upload that ZIP and submit it for review.
3. Chrome updates installed copies within a few hours of approval.

A change to the listing texts or images goes in this folder first, then into the **Store listing** or **Privacy** tab.

## Review

Every upload goes through review: usually a day to a few days. The `debugger` permission and `<all_urls>` draw more scrutiny ([review process](https://developer.chrome.com/docs/webstore/review-process)).

A rejection email names a violation code ([codes](https://developer.chrome.com/docs/webstore/troubleshooting)). The common ones: **Purple Potassium** (a permission the code doesn't use), **Blue Argon** (remote code), **Purple Lithium** or **Purple Nickel** (privacy disclosures that don't match the code), **Red Magnesium** (more than one purpose), **Yellow Zinc** (a thin or misleading listing). Fix it and resubmit, or appeal from the dashboard. An added permission needs a justification in [privacy-practices.md](privacy-practices.md) and the **Privacy** tab, and Chrome asks existing users to accept it.

## Automating uploads

WXT has `wxt submit` ([publishing guide](https://wxt.dev/guide/essentials/publishing)). Set up once:

1. In Google Cloud, enable the Chrome Web Store API and create OAuth credentials (client ID and secret), then get a refresh token. `bunx wxt submit init` walks through it and writes `.env.submit` (keep it out of git).
2. Add repo secrets `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.
3. In `.github/workflows/release.yml`, after "Create release", add a step, so only a tagged release uploads:

   ```yaml
   - name: Submit to Chrome Web Store
     run: bunx wxt submit --chrome-zip packages/extension/.output/blook-chrome.zip
     env:
       CHROME_EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
       CHROME_CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
       CHROME_CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
       CHROME_REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
   ```

   Test it first with `--dry-run`.

Changes to permissions or the listing stay manual in the dashboard.
