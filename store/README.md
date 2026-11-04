# Chrome Web Store submission

Drafts for publishing Blook. Nothing here is submitted yet.

- [listing.md](listing.md): title, summary, description, category, images
- [privacy-practices.md](privacy-practices.md): single purpose, permission justifications, remote code, data usage
- [../PRIVACY.md](../PRIVACY.md): the privacy policy, linked from the dashboard
- `images/`: store icon, 4 screenshots (1280×800), small promo tile (440×280)

## Checklist

1. **Developer account.** Turn on [2-Step Verification](https://myaccount.google.com/signinoptions/two-step-verification) on the Google account, then open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), accept the agreement and pay the one-time $5 fee ([register](https://developer.chrome.com/docs/webstore/register)). The account email can't be changed later.
2. **Account page.** Publisher name, verify the contact email ([set up account](https://developer.chrome.com/docs/webstore/set-up-account)). Declare trader or non-trader ([EU DSA FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)): a free personal tool is usually non-trader; a trader must publish a legal name, address, phone and email.
3. **Push `PRIVACY.md`** to `main`, so the policy URL resolves.
4. **Upload the ZIP.** `bun run zip`, then **Add new item** and upload `.output/blook-<version>-chrome.zip`.
5. **Store listing tab** ([docs](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)): paste from `listing.md`, upload `images/` ([image specs](https://developer.chrome.com/docs/webstore/images)).
6. **Privacy practices tab** ([docs](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)): paste from `privacy-practices.md`, and the privacy policy URL `https://github.com/cyrillbrito/blook/blob/main/PRIVACY.md`.
7. **Distribution tab** ([docs](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)): free; Visibility **Unlisted** (anyone with the link) or **Private** (only trusted testers) or **Public**. All three get the same review. All regions.
8. **Submit for review.** Optionally untick "publish automatically" to publish by hand after approval (you then have 30 days).

## What to expect in review

- Most reviews take a few days; new developers, new items, `<all_urls>` and powerful permissions such as `debugger` all add scrutiny, so expect up to 1 to 3 weeks ([review process](https://developer.chrome.com/docs/webstore/review-process)). After 3 weeks, contact support.
- Common rejections ([violation codes](https://developer.chrome.com/docs/webstore/troubleshooting)): **Purple Potassium** (a permission not used or not needed), **Blue Argon** (remote code), **Purple Lithium** / **Purple Nickel** (privacy policy or disclosures missing or not matching the code), **Red Magnesium** and friends (single purpose), **Yellow Zinc** (thin or misleading listing). The drafts here aim at each.
- A rejection email names the code. Fix it and resubmit, or appeal from the dashboard if it's a false positive (developers report `debugger` false positives that pass after explaining).
- Every update goes through review again, so later releases also take a day or more.

Decided: name **Blook**, visibility **Unlisted**, support via GitHub issues (no email in the policy; the dashboard still needs a verified contact email).

## Build check (0.1.4)

`bun run zip` builds `.output/blook-0.1.4-chrome.zip` (235 kB). Findings:

- **Remote code: clean.** No `eval`, `new Function` or remote scripts in the bundle. The only network endpoint is OpenRouter. The code is minified, not obfuscated, which is allowed; the public repo helps the reviewer.
- **Manifest:** name, version, 16/32/48/128 icons, `description` 72 characters (limit 132). WXT's default extension-page CSP applies; no `content_security_policy` override, which is good.
- **`tabs` dropped.** Blook only reads `tab.url`/`title`, and `<all_urls>` already gives those; the store's own guide lists this as a common Purple Potassium cause. `chrome://` tabs now show no URL in the side panel; they can't be recorded anyway.
- **`minimum_chrome_version: '116'`**, since `sidePanel.setPanelBehavior` needs Chrome 116.
- **Icon:** `public/icon/128.png` now has 96 px artwork with 16 px padding, as the store asks; `images/store-icon-128.png` is the same file for the listing.
- **Dev-only endpoint override** (`blook-stt-endpoint` in `lib/transcribe/openrouter.ts`) lets storage redirect audio to any URL. Harmless, but a reviewer could ask about it. Optional: compile it out of production builds.
- **Not a blocker, worth knowing:** network capture keeps `Cookie` and `Authorization` headers unredacted. It's disclosed in `PRIVACY.md`; redacting them by default would make the ZIP safer to attach to tickets.

## Automating updates later

WXT has `wxt submit` ([publishing guide](https://wxt.dev/guide/essentials/publishing)). Set up once:

1. In Google Cloud, enable the Chrome Web Store API and create OAuth credentials (client ID and secret), then get a refresh token. `bunx wxt submit init` walks through it and writes `.env.submit` (keep it out of git).
2. Add repo secrets `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.
3. In `.github/workflows/release.yml`, the "Build extension" step already runs `bun run zip`. Add a step after "Create release", so a store upload only happens for a tagged release:

   ```yaml
   - name: Submit to Chrome Web Store
     run: bunx wxt submit --chrome-zip .output/blook-${{ steps.version.outputs.v }}-chrome.zip
     env:
       CHROME_EXTENSION_ID: ${{ secrets.CHROME_EXTENSION_ID }}
       CHROME_CLIENT_ID: ${{ secrets.CHROME_CLIENT_ID }}
       CHROME_CLIENT_SECRET: ${{ secrets.CHROME_CLIENT_SECRET }}
       CHROME_REFRESH_TOKEN: ${{ secrets.CHROME_REFRESH_TOKEN }}
   ```

   Test first with `--dry-run`. The version in `package.json` must go up for every upload.

The first submission and any change to permissions or the listing stay manual in the dashboard.
