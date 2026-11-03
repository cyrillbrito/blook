# jq recipes for an Overseer bundle

`B` is the unzipped bundle folder (see SKILL.md). Every time is ms since session start. Each block sets its own inputs (`T`, `W`, `ID`, `Q`) at the top: change them and run. Output is one line per item.

## Session

```bash
jq '{version, url, title, durationMs, firstSnapshotT, tabs, settings, mic, transcript, counts}' "$B/session.json"
```

`counts.errors` includes Chrome's `[network] Failed to load resource` lines, so it is usually higher than the number of `error` entries in the timeline.

## Timeline

```bash
# Everything except DOM snapshots
jq -r '.[] | select(.type != "snapshot") | "\(.t)\t\(.type)\t\(.summary)"' "$B/timeline.json"

# What went wrong
jq -r '.[] | select(.type == "error" or .type == "request-failed") | "\(.t)\t\(.type)\t\(.summary)"' "$B/timeline.json"

# What the user did: clicks, inputs, navigations, tab opens
jq -r '.[] | select(.type | IN("click", "input", "navigation", "tab-open")) | "\(.t)\t\(.type)\t\(.summary)"' "$B/timeline.json"
```

### Window around a moment

The core query: everything within ±W ms of T, speech included. Set T to a speech segment's `t` or a click's `t`.

```bash
T=9300 W=3000
jq -r --argjson t $T --argjson w $W '.[] | select(.t >= $t - $w and .t <= $t + $w and .type != "snapshot")
  | "\(.t)\t\(.type)\t\(.summary)"' "$B/timeline.json"

# Plus requests that started earlier and were still running at T
jq -r --argjson t $T '.[] | select(.t < $t and (.endT // 1e15) >= $t) | "\(.t)-\(.endT // "open")\t\(.method) \(.status // "-") \(.url[0:120])\tid=\(.id)"' "$B/network.json"
```

Each timeline entry's `ref` names the full record: `{file: "network.json", requestId}`, `{file: "console.json", index}`, `{file: "websockets.json", socketId, frame, frameEnd}`, `{file: "transcript.json", segment}`, `{file: "rrweb/<tab>.json", event}`.

## Transcript

Check `.status` first: `ok`, `partial` and `pending` (still transcribing) have segments; `none`, `skipped` and `failed` say why in `.note`.

```bash
jq '{status, note, model, segmentCount, errors}' "$B/transcript.json"

# All segments
jq -r '.segments[] | "\(.t)-\(.endT)\t#\(.index)\t\(.text)"' "$B/transcript.json"

# Segments that match a regex, case-insensitive
Q='broken|wrong|error|doesn.t|should|nothing happens|slow'
jq -r --arg q "$Q" '.segments[] | select(.text | test($q; "i")) | "\(.t)-\(.endT)\t#\(.index)\t\(.text)"' "$B/transcript.json"

# Pointing words: run `pointer` at each t
jq -r '.segments[].words[] | select(.word | test("^(this|that|here|there|these|those)\\W*$"; "i")) | "\(.t)\t\(.word)"' "$B/transcript.json"

# What was being said at T
T=4500
jq -r --argjson t $T '.segments[] | select(.t <= $t and .endT >= $t) | "\(.t)-\(.endT)\t\(.text)"' "$B/transcript.json"
```

## HTTP requests (`network.json`)

```bash
# Summary without static assets
jq -r '.[] | select(.resourceType | IN("Image", "Stylesheet", "Font", "Script", "Media") | not)
  | "\(.t)\t\(.method) \(.status // "-") \(.durationMs // "-")ms\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# Failed: status >= 400 or a network error (cancels don't count)
jq -r '.[] | select(.failed) | "\(.t)\t\(.method) \(.status // .errorText)\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# Started within ±W ms of T
T=9648 W=2000
jq -r --argjson t $T --argjson w $W '.[] | select(.t >= $t - $w and .t <= $t + $w)
  | "\(.t)\t\(.method) \(.status // "-")\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# Slowest API calls
jq -r '[.[] | select(.durationMs and (.resourceType | IN("XHR", "Fetch", "Document")))] | sort_by(-.durationMs) | .[0:10][]
  | "\(.durationMs)ms\tt=\(.t)\t\(.method) \(.url[0:120])"' "$B/network.json"

# Calls to one endpoint (regex on the URL)
Q='/api/'
jq -r --arg q "$Q" '.[] | select(.url | test($q)) | "\(.t)\t\(.method) \(.status // "-")\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# One request, without its inline bodies
ID=75559.10
jq --arg id "$ID" '.[] | select(.id == $id) | del(.requestBody, .responseBody)' "$B/network.json"
```

### Bodies

Small text bodies are inline (`requestBody`, `responseBody`, at most 2 KB). Larger or binary ones are files named by `requestBodyFile` and `responseBodyFile`. Always follow those fields; don't build file names yourself.

```bash
ID=75559.8
# Inline body, or the file path
jq -r --arg id "$ID" '.[] | select(.id == $id) | {responseBodySize, responseBodyFile, responseBodyTruncated, responseBodyOmitted, inline: (.responseBody // "" | .[0:500])}' "$B/network.json"

# A JSON body file: look at its shape, then pull one path
F="$B/$(jq -r --arg id "$ID" '.[] | select(.id == $id) | .responseBodyFile // empty' "$B/network.json")"
jq -r '[paths | map(if type == "number" then "[]" else . end) | join(".")] | unique[]' "$F" | head -40
jq -c '.items[0:2]' "$F"

# Request body (POST/PUT payload), inline or file
ID=75559.10
jq -r --arg id "$ID" '.[] | select(.id == $id) | .requestBody // empty' "$B/network.json" | head -c 500
F=$(jq -r --arg id "$ID" '.[] | select(.id == $id) | .requestBodyFile // empty' "$B/network.json")
[ -n "$F" ] && head -c 500 "$B/$F"; echo
```

For non-JSON bodies use `head -c 2000 "$F"`. Binary bodies (`responseBodyBinary`) are raw bytes; images can be opened with the read tool.

## WebSocket (`websockets.json`)

Payloads up to 2 KB are inline in `payload`; larger or binary ones are in `payloadFile`.

```bash
# Sockets
jq -r '.[] | "\(.t)-\(.endT // "open")\t\(.status // "-")\t\(.frameCount) frames (\(.sentCount) sent, \(.receivedCount) received)\t\(.url)\tid=\(.id)"' "$B/websockets.json"

# Frames within ±W ms of T, all sockets
T=3334 W=2000
jq -r --argjson t $T --argjson w $W '.[] as $s | $s.frames[] | select(.t >= $t - $w and .t <= $t + $w)
  | "\(.t)\t\($s.id)#\(.index)\t\(.direction)\t\(.size) B\t\(.payload // .payloadFile | .[0:200])"' "$B/websockets.json"

# Frames whose payload matches a regex (inline payloads; for files use rg on websockets/frames/)
Q='subscribe'
jq -r --arg q "$Q" '.[] as $s | $s.frames[] | select(.payload // "" | test($q)) | "\(.t)\t\($s.id)#\(.index)\t\(.direction)\t\(.payload[0:200])"' "$B/websockets.json"
```

## Console (`console.json`)

```bash
# Errors and exceptions, without Chrome's "Failed to load resource" lines (the requests cover those)
jq -r '.[] | select(.level == "error" and (.text | startswith("[network]") | not))
  | "\(.t)\t#\(.index) \(.source)\t\(.text[0:200])\t\(.url // "" | .[0:80]):\(.line // "")"' "$B/console.json"

# Errors and warnings
jq -r '.[] | select(.level | IN("error", "warn")) | "\(.t)\t#\(.index) \(.level)\t\(.text[0:200])"' "$B/console.json"

# Everything within ±W ms of T
T=9661 W=2000
jq -r --argjson t $T --argjson w $W '.[] | select(.t >= $t - $w and .t <= $t + $w) | "\(.t)\t#\(.index) \(.level)\t\(.text[0:200])"' "$B/console.json"

# Stack of one entry
I=4
jq -r --argjson i $I '.[$i] | "\(.text)\n\(.stack // "(no stack)")"' "$B/console.json"
```

## rrweb (`rrweb/<tabId>.json`)

Clicks and inputs are already in the timeline with a readable `target`, and the replay CLI answers "what was under the mouse". Use these only without the CLI. Event types are in [rrweb.md](rrweb.md).

```bash
R=$(ls "$B"/rrweb/*.json | head -1)

# Mouse position at or just before T
T=5000
jq -c --argjson t $T '[.[] | select(.type == 3 and .data.source == 1) | .timestamp as $ts
  | .data.positions[] | {t: ($ts + .timeOffset), x, y, nodeId: .id}] | map(select(.t <= $t)) | last' "$R"

# A node by rrweb id: tag and attributes, from the full snapshot or a later mutation
ID=20
jq -c --argjson id $ID '[(.[] | select(.type == 2) | .data.node | .. | objects | select(.id? == $id)),
  (.[] | select(.type == 3 and .data.source == 0) | .data.adds[]? | .node | select(.id == $id))]
  | last | {id, tagName, attributes}' "$R"
```
