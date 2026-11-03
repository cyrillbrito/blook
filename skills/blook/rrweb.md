# rrweb events in `rrweb.json`

`{ tabs: [{ tabId, url, events }] }` on one line. Each `events` is an array of rrweb events (`type`, `data`, `timestamp`), sorted by `timestamp`. That's the session clock: ms since start. Only top-frame events. A timeline `ref.event` is an index into the `events` of tab `ref.tabId`. Prefer the replay CLI. Read these only for questions it can't answer.

## Event `type`

| type | Name | `data` |
|---|---|---|
| 0, 1 | DomContentLoaded, Load | |
| 2 | FullSnapshot | `node`: the serialized DOM tree; every node has an `id` |
| 3 | IncrementalSnapshot | `source` and the fields below |
| 4 | Meta | `href`, `width`, `height`: a page load |
| 5, 6 | Custom, Plugin | `tag`/`plugin`, `payload` |

A navigation starts a new Meta and FullSnapshot, and node ids restart. A node id only means something with the latest full snapshot before it.

## IncrementalSnapshot `data.source`

| source | Name | Fields |
|---|---|---|
| 0 | Mutation | `adds[]` (`parentId`, `node`), `removes[]`, `texts[]` (`id`, `value`), `attributes[]` |
| 1 | MouseMove | `positions[]`: `x`, `y`, `id` (node under the pointer), `timeOffset` (≤ 0, ms relative to `timestamp`) |
| 2 | MouseInteraction | `type`: 0 MouseUp, 1 MouseDown, 2 Click, 3 ContextMenu, 4 DblClick, 5 Focus, 6 Blur, 7 TouchStart, 9 TouchEnd; `id`, `x`, `y` |
| 3 | Scroll | `id`, `x`, `y` |
| 4 | ViewportResize | `width`, `height` |
| 5 | Input | `id`, `text`, `isChecked` |
| 8, 9, 15 | StyleSheetRule, CanvasMutation (only with `settings.canvas`), AdoptedStyleSheet | rarely needed |

Serialized node `type`: 0 Document, 1 DocumentType, 2 Element (`tagName`, `attributes`, `childNodes`), 3 Text (`textContent`), 5 Comment.

## Gotchas

- Generated class names (`css-1f8mf9c`) are build output. Don't use them as test selectors.
- Clicks often land on an inner `span` or icon. The real control is the nearest `button`, `a`, `label` or `[role=button]` ancestor; `pointer` shows the ancestry.
- Not replayed: cross-origin iframes and video. Canvas only replays when `settings.canvas` was on.
