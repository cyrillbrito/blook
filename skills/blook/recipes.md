# jq recipes

`B` is the unzipped bundle folder (SKILL.md, First steps). Times are ms since the session start. Each block sets its inputs (`T`, `W`, `ID`, `Q`) at the top. Output is one line per item.

## Read first

```bash
# Narration (check the status first: no segments unless ok, partial or pending)
jq -r '"status: \(.status) \(.note // "") source: \(.source | if . then "\(.method) \(.model) by \(.by)" else "-" end)", (.segments[] | "\(.t)-\(.endT)\t#\(.index)\t\(.text)")' "$B/transcript.json"

# Timeline without DOM snapshots and static assets: speech, clicks, inputs, API calls, errors
jq -r '.[] | select(.type != "snapshot")
  | select(.type != "request" or (.resourceType // "" | IN("Script", "Stylesheet", "Image", "Font", "Media") | not))
  | "\(.t)\t\(.type)\t\(.summary[0:140])"' "$B/timeline.json"

# What went wrong
jq -r '.[] | select(.type == "error" or .type == "request-failed") | "\(.t)\t\(.type)\t\(.summary)"' "$B/timeline.json"

# What the user did
jq -r '.[] | select(.type | IN("click", "input", "scroll", "navigation", "tab-open")) | "\(.t)\t\(.type)\t\(.summary)"' "$B/timeline.json"
```

Long sessions: add `| head -200`, or filter by type or window.

## Window around a moment

Everything within ±W ms of T, speech included, then requests that started earlier and were still open at T.

```bash
T=6193 W=3000
jq -r --argjson t $T --argjson w $W '.[] | select(.t >= $t - $w and .t <= $t + $w and .type != "snapshot")
  | "\(.t)\t\(.type)\t\(.summary[0:140])"' "$B/timeline.json"
jq -r --argjson t $T '.[] | select(.t < $t and (.endT // 1e15) >= $t)
  | "\(.t)-\(.endT // "open")\t\(.method) \(.status // "-") \(.url[0:120])\tid=\(.id)"' "$B/network.json"
```

A timeline entry's `ref` names its full record: `{file: "network.json", requestId}`, `{file: "console.json", index}`, `{file: "websockets.json", socketId, frame, frameEnd}`, `{file: "transcript.json", segment}`, `{file: "rrweb.json", tabId, event}`.

## Transcript

```bash
# Pointing words: run `blook pointer` at each t
jq -r '.segments[].words[] | select(.word | test("^(this|that|here|there|these|those)\\W*$"; "i")) | "\(.t)\t\(.word)"' "$B/transcript.json"

# Segments matching a regex
Q='broken|wrong|error|doesn.t|should|nothing happens|slow'
jq -r --arg q "$Q" '.segments[] | select(.text | test($q; "i")) | "\(.t)-\(.endT)\t#\(.index)\t\(.text)"' "$B/transcript.json"

# When a word was said
Q='save'
jq -r --arg q "$Q" '.segments[].words[] | select(.word | test($q; "i")) | "\(.t)\t\(.word)"' "$B/transcript.json"

# What was being said at T
T=4500
jq -r --argjson t $T '.segments[] | select(.t <= $t and .endT >= $t) | "\(.t)-\(.endT)\t\(.text)"' "$B/transcript.json"
```

The first word of a segment often starts early, over the silence before it: use its `endT` or the next word.

## HTTP requests

`network.json` holds the kept bodies inline, so it can be large. Always go through jq.

```bash
# API calls and page loads, without static assets
jq -r '.[] | select(.resourceType | IN("Image", "Stylesheet", "Font", "Script", "Media") | not)
  | "\(.t)\t\(.method) \(.status // "-") \(.durationMs // "-")ms\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# Failed: status >= 400 or a network error (cancels don't count)
jq -r '.[] | select(.failed) | "\(.t)\t\(.method) \(.status // .errorText)\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# Started within ±W ms of T
T=6193 W=2000
jq -r --argjson t $T --argjson w $W '.[] | select(.t >= $t - $w and .t <= $t + $w)
  | "\(.t)\t\(.method) \(.status // "-")\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# Calls to one endpoint (regex on the URL)
Q='/api/'
jq -r --arg q "$Q" '.[] | select(.url | test($q)) | "\(.t)\t\(.method) \(.status // "-")\t\(.url[0:120])\tid=\(.id)"' "$B/network.json"

# Slowest API calls
jq -r '[.[] | select(.durationMs and (.resourceType | IN("XHR", "Fetch", "Document")))] | sort_by(-.durationMs) | .[0:10][]
  | "\(.durationMs)ms\tt=\(.t)\t\(.method) \(.url[0:120])"' "$B/network.json"

# One request, without its bodies
ID=1.1
jq --arg id "$ID" '.[] | select(.id == $id) | del(.requestBody, .responseBody)' "$B/network.json"
```

### Bodies

`requestBodyEncoding` and `responseBodyEncoding` say what the body is: `json` (parsed, jq walks into it), `text` (HTML, XML, a cut body) or `base64` (binary). A cut body has `*BodyTruncated` (at 1 MB). No body and no `responseBodyNotKept`: the request failed, was still open at Stop, or had none.

```bash
ID=1.1
# What's there
jq -c --arg id "$ID" '.[] | select(.id == $id) | {responseBodyEncoding, responseBodySize, responseBodyTruncated, responseBodyNotKept}' "$B/network.json"

# A JSON body: its paths, then one of them
jq -r --arg id "$ID" '.[] | select(.id == $id) | .responseBody | [paths | map(if type == "number" then "[]" else . end) | join(".")] | unique[]' "$B/network.json" | head -40
jq -c --arg id "$ID" '.[] | select(.id == $id) | .responseBody' "$B/network.json" | head -c 2000; echo

# A text body: the first 2000 characters
jq -r --arg id "$ID" '.[] | select(.id == $id) | .responseBody | strings | .[0:2000]' "$B/network.json"

# The request body (POST/PUT payload)
jq -c --arg id "$ID" '.[] | select(.id == $id) | .requestBody' "$B/network.json" | head -c 2000; echo
```

A `base64` body: `jq -r ... | .responseBody' | base64 -d > /tmp/body.bin`, and open images with the read tool.

## WebSockets

Every payload is inline. `payloadEncoding` says what it is, as for HTTP bodies: `json` (parsed, jq walks into it), `text` or `base64` (binary). A cut payload has `truncated` (at 1 MB).

```bash
# Sockets
jq -r '.[] | "\(.t)-\(.endT // "open")\t\(.frameCount) frames (\(.sentCount) sent, \(.receivedCount) received)\t\(.url)\tid=\(.id)"' "$B/websockets.json"

# Frames within ±W ms of T
T=1500 W=2000
jq -r --argjson t $T --argjson w $W '.[] as $s | $s.frames[] | select(.t >= $t - $w and .t <= $t + $w)
  | "\(.t)\t\($s.id)#\(.index)\t\(.direction)\t\(.size) B\t\(if .payloadEncoding == "json" then .payload | tojson else .payload end | .[0:200])"' "$B/websockets.json"

# Frames whose payload matches (text and JSON payloads)
Q='subscribe'
jq -r --arg q "$Q" '.[] as $s | $s.frames[] | select(.payloadEncoding != "base64")
  | (if .payloadEncoding == "json" then .payload | tojson else .payload end) as $p | select($p | test($q))
  | "\(.t)\t\($s.id)#\(.index)\t\(.direction)\t\($p[0:200])"' "$B/websockets.json"

# One frame's JSON payload, by socket id and frame index (from a timeline ref)
ID=1.2 I=0
jq --arg id "$ID" --argjson i $I '.[] | select(.id == $id) | .frames[$i].payload' "$B/websockets.json"
```

## Console

```bash
# Errors and exceptions, without Chrome's "[network] Failed to load resource" lines (the requests cover those)
jq -r '.[] | select(.level == "error" and (.text | startswith("[network]") | not))
  | "\(.t)\t#\(.index) \(.source)\t\(.text[0:200])\t\(.url // "" | .[0:80]):\(.line // "")"' "$B/console.json"

# Everything within ±W ms of T
T=2050 W=2000
jq -r --argjson t $T --argjson w $W '.[] | select(.t >= $t - $w and .t <= $t + $w) | "\(.t)\t#\(.index) \(.level)\t\(.text[0:200])"' "$B/console.json"

# One entry with its stack
I=0
jq -r --argjson i $I '.[$i] | "\(.text)\n\(.stack // "(no stack)")"' "$B/console.json"
```

## rrweb

`blook pointer` answers most rrweb questions. These find times the timeline doesn't list. Event types: [rrweb.md](rrweb.md).

```bash
# Text selections (source 14): when, then `blook pointer` at that t for .selection.text
jq -r '.tabs[] | .tabId as $tab | .events[] | select(.type == 3 and .data.source == 14) | "\(.timestamp)\ttab \($tab)\tselection"' "$B/rrweb.json"

# Mouse down and up: a drag (select text, move, resize) is a MouseDown and MouseUp at different x/y
jq -r '.tabs[0].events[] | select(.type == 3 and .data.source == 2 and (.data.type == 0 or .data.type == 1))
  | "\(.timestamp)\t\(if .data.type == 1 then "down" else "up" end)\t\(.data.x | floor),\(.data.y | floor)\tnode \(.data.id)"' "$B/rrweb.json"
```
