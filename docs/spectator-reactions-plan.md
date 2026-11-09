# Spectator Reactions

## Status (2026-11-09)

Rounds 1 and 2 are implemented and unstaged in both repos (dartBackend and dartClient).

- **Deploy the backend first.** An old backend lacks the `SubscribeReactions` hub method. The
  client copes (only reactions stay off), but it retries the join every 5 s until the backend
  is new.
- Round 2 needs a **backend restart** as well: `GetSpectators` and `OnSpectatorsChanged` are
  new.

## Round 2 (2026-11-09): a 5-in-5-seconds limit and the watching crowd

### Rate limit: 5 reactions in any 5 seconds

- The token bucket becomes a **sliding window** on both sides. A spectator may send 5
  reactions at once; the 6th waits until the oldest of those 5 is 5 s old.
- **Server:** `SpectatorReactionRegistry` keeps the send times of each spectator's last 5
  reactions. Its window is 250 ms shorter (`NetworkAllowance`), so a reaction the client
  spaced correctly is never rejected because the network delivered it a little early.
- **Client:** `ReactionRateLimiter` keeps the same window, so the picker knows when each used
  reaction comes back.
- **Tray:** a waiting time of up to 5 s needs a visible reason. Five small dots sit at the
  right of the "You're the …" row:
  - A full dot is a reaction ready to send.
  - A used dot fills up again over its 5 s.
  - When all are used, the grid dims, as before. The dots teach the rule without any text.

### "Who's watching" on the board

- **What:** a small chip in the bottom-right corner of the board with an eye icon and the
  watching spectators' animal avatars (the newest 5, then "+N").
  - The reactions rise out of it, so the crowd and its reactions read as one thing.
  - When a spectator reacts, their avatar does a small hop. Players see who cheered without
    reading any name.
- **Not distracting:**
  - No chip at all when nobody watches, and no notifications on join or leave.
  - A new avatar pops in once; a leaving one just goes.
  - Small (24 px avatars) and lightly see-through. It sits in the overlay layer, so the board
    never moves.
  - No count text: the avatars already show how many, and a "3 watching" next to three
    avatars would be the same info twice. The full list is in the tooltip and the screen
    reader label ("3 watching: Giraffe, Otter and Fox").
  - Hops and pops use only transform. With reduced motion there are none.
- **Who counts:** connections with an animal in the game, i.e. spectators. The players'
  board never claims one, so players don't count themselves.
- **Protocol:**
  - The hub sends `OnSpectatorsChanged(gameId, { version, animals })` to `reactions:{gameId}`
    whenever the set changes: a claim, a send that claims, a leave or a disconnect.
  - A new hub query, `GetSpectators(gameId)`, gives the current snapshot. Every game page
    calls it on each (re)join of the group.
  - Versions come from one counter for the whole registry and only grow, so a client keeps
    the newest snapshot whatever order they arrive in.
  - A rejoin resets the client's version. After a server restart, when the counter starts
    over, the new snapshots still apply.
  - A send that claims an animal broadcasts the change before the reaction, so receivers
    know the animal before its float appears.
- **Client:**
  - `GamePage` keeps the newest snapshot in a plain field and passes it straight to the
    overlay, so a join never re-renders the board.
  - The overlay draws the crowd and makes room for it: floats start above the chip.

## What it is

Anyone spectating a game becomes an anonymous animal ("Giraffe", "Otter", …) and can send
reactions. Every screen on the game shows them floating up for a few seconds: the players'
board by the dartboard and every other spectator. The sender sees their own reaction at
once.

There is no login and no persistence. A spectator keeps their animal while their SignalR
connection lives. Reloading the page, or a reconnect, gives a new one.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Artwork | Fluent Emoji **Flat** SVGs (Microsoft, MIT), bundled in `public/emoji/` | Same picture on every OS. Native emoji fail in Chrome on minimal Linux (empty boxes), Windows 10 stops at Emoji 12, and every platform draws them differently. An emoji webfont breaks in Safari. |
| Wire format | Reaction and animal **keys** (`fire`, `giraffe`), never emoji or free text | The server checks keys against a fixed list. The artwork stays a client detail that can be swapped later. |
| Who names | The **server** picks the animal | One source of truth. Unique among a game's spectators while the 46 animals last. |
| Who sends | Spectators only; the players' page has no React button | Players play. A player can open the spectate page on a phone to react. |
| Who sees | Everyone on the game: players and spectators | As asked. |
| Sender echo | Shown locally on tap; the server sends to the *others* in the group | Instant feedback, even on a slow connection. |
| Abuse | Fixed list of reactions, and 5 reactions per spectator in any 5 s, a sliding window on both sides (the server's is 250 ms shorter, so jitter never rejects a correctly spaced send) | Protects the Pi and keeps the board readable. The user's rule (round 2). |
| Picker place | A **React** button in the spectator header, opening a popover tray | The header is already the spectator's area. The popover sits in the top layer, so it is never clipped by the page. |
| Float place | A lane along the right edge of the board, rising from just above the last-dart strip and fading out at about half height | Keeps clear of the hints, the top-right notifications and the player names. Pointer events pass through. |

## Reactions

Ten, in a 5 × 2 grid:

| Key | Shows | Label |
|---|---|---|
| `fire` | Fire | On fire |
| `clap` | Clapping hands | Applause |
| `party` | Party popper | Party |
| `bullseye` | Bullseye | Bullseye |
| `wow` | Star-struck | Wow |
| `haha` | Face with tears of joy | Haha |
| `mind-blown` | Exploding head | Mind blown |
| `oof` | Grimacing face | Oof |
| `180` | "180!" sticker | 180 |
| `26` | See-no-evil monkey with a "26" tag | Bed and breakfast (26) |

The darts calls are text: words read better than any picture for them. "180!" is a sticker on its own. "26" is a small tag stuck to the can't-watch monkey (`tag` in `spectatorReactions`): the classic poor round, 20 + 5 + 1.

> **2026-11-09:** `26` replaced `ton` ("Ton!" on lime), since a ton isn't something players chase in this count-up-to-250 game. The monkey is Fluent Emoji Flat's `see-no-evil_monkey_flat.svg` (MIT), saved as `public/emoji/reactions/26.svg`. The backend's `SpectatorReactionRegistry.Reactions` takes `26` instead of `ton`, so deploy both together. An old client never shows the monkey: it doesn't know the key and ignores it.

The 46 animals are listed in `SpectatorReactionRegistry.Animals` (backend) and
`spectatorAnimals` (client). They are friendly ones only: no rat, pig, snake or worm.

## Protocol (SignalR hub `/api/hubs/main`)

| Direction | Name | Shape |
|---|---|---|
| client → hub | `SubscribeReactions(gameId)` / `UnsubscribeReactions(gameId)` | Joins or leaves group `reactions:{gameId}`. Leaving frees the animal. |
| client → hub | `ClaimSpectatorName(gameId)` → `string \| null` | The connection's animal key in that game: the same one each time it asks. `null` when the game is not active. |
| client → hub | `SendSpectatorReaction(gameId, reaction)` → `{ accepted, animal }` | Checks the key and the rate. Claims a name if needed. Sends to the others in the group. |
| client → hub | `GetSpectators(gameId)` → `{ version, animals }` | Who watches now, in arrival order. |
| hub → client | `OnSpectatorReaction(gameId, { reaction, animal })` | One reaction. |
| hub → client | `OnSpectatorsChanged(gameId, { version, animals })` | The crowd after an arrival or departure; keep the highest version. |

Every game page (play and spectate) joins `reactions:{gameId}` alongside the achievement
group. A reaction is a few bytes, so the Pi pays nothing for it.

## Backend (dartBackend)

- `Web/SignalR/SpectatorReactionRegistry.cs` (singleton):
  - **Who is who:** spectators per game, `connectionId → { animal, arrival, last 5 send
    times }`, under one lock.
  - **Names:** `Claim` is idempotent per connection and game, and picks a random animal no
    one else in the game has. When all are taken, it reuses one.
  - **Sending:** `TrySend` checks the key, claims a name if needed, and checks the sliding
    window.
  - **Freeing names:** `Leave(gameId, connectionId)` and `RemoveConnection(connectionId)`.
  - **The crowd:** every call that changes it returns a `SpectatorsChange` (game and
    snapshot) for the hub to broadcast. `GetSpectators` reads it.
  - Uses `TimeProvider`, so tests drive the clock.
- `SignalRHub`:
  - New group name `Reactions(gameId)`, and the five methods above.
  - `OnDisconnectedAsync` frees the connection's animals and tells each game's crowd.
  - The game check (`GameService.GetSessionById`) runs only when a connection has no animal
    in that game yet, through `[FromServices]` method injection. The hub constructor stays
    free of `GameService`, so other hub calls build no DbContext.
- `ISignalRClient.OnSpectatorReaction` and `OnSpectatorsChanged`, and the records
  `SpectatorReaction`, `SpectatorReactionResult` and `SpectatorsSnapshot`.
- `Program.cs` registers `TimeProvider.System` and the registry.
- Tests: `Tests/SignalR/SpectatorReactionRegistryTests.cs`.

## Client (dartClient)

- **`src/helpers/spectatorReactions.ts`:**
  - The reactions and animals catalogs and their asset URLs.
  - `ReactionRateLimiter`, the 5-in-5-seconds window that mirrors the server. It also
    tells the picker how far each used reaction is through its wait.
  - An unknown key from a newer server gets no picture: an unknown reaction is ignored, and
    an unknown animal shows its name without a picture.
- **`SignalRService`:**
  - The `OnSpectatorReaction` and `OnSpectatorsChanged` events, and the `reactions(gameId)`
    group.
  - A typed `invokeWithResult` for the three calls that answer.
- **`GameLiveService`:**
  - `subscribeToReactions(gameId, { onReaction, onSpectators }, onJoined)`.
  - `getSpectators`, `claimSpectatorName` and `sendSpectatorReaction`.
  - Every answer is parsed with zod, like the other payloads.
- **`aa-reaction-overlay`:**
  - The floats and the crowd. It owns its own state, so neither a reaction nor an arrival
    re-renders the board.
  - `GamePage` calls `show()` and sets `spectators`.
  - It sits in `.page-content` (the board), not `.page-shell`, so it never covers the
    last-dart strip.
- **`aa-reaction-picker`:**
  - The React button and the tray: who you are and the five allowance dots, then the 10
    reactions.
  - It emits `reaction-pick`, and the spectate page sends.
- **`GamePage`:**
  - `subscribeToAchievementEvents` became `subscribeToGameEvents` and also subscribes to
    reactions.
  - A reactions failure (old backend) is logged and does not touch achievements.
  - It renders the overlay, and offers the hook `onReactionsJoined()` that runs on every
    (re)join.
  - It keeps the newest crowd snapshot (a plain field, not render state) and fetches it again
    on every (re)join.
- **`SpectateGamePage`:**
  - Claims the animal on every (re)join, and renders the picker in its header.
  - On a pick, it shows the float at once and then sends.
  - When the server answers with a different animal (a reconnect race), it shows that one.

## Look and motion

- **Float:** the picture, then a small name pill (animal avatar and name) in the app's style:
  black border, a hard offset shadow and the UI font.
- **Every float is named.** For a while only the first reaction of a burst carried the pill,
  but that read as random ("sometimes the name is there, sometimes not"), so it was dropped.
- **Spacing:** each float starts 30–70 % of the lane (`min(300px, 30vw)`) away from the one
  before. A burst of five named floats then spreads out instead of stacking its pills.
- **Sizing:** pictures are `clamp(44px, 4.5vw, 72px)`, about 44 px on a phone and 72 px on
  the board's TV.
- **The darts calls** are stickers in the same style, with a slight tilt: "180!" on gold, and
  "26" as a small gold tag on the monkey's corner.
- **Motion:**
  - Each float pops in (scale 0.3 → 1.15 → 1, 420 ms).
  - It rises 42–58 % of the board's height over 3.2–4 s, slowing as it goes, sways gently
    from side to side, and fades out at the top.
  - Start position, sway, tilt and speed are random per float, so a burst of fire looks
    like a flock, not a stack.
- **Reduced motion:** no rise, sway or pop. The float fades in, holds, and fades out at a
  random height in the lane.
- **Tray:**
  - A card with the brutal shadow, centred under the React button. It stays open for
    repeated taps.
  - Closes on a tap outside, on Escape, or on the button.
  - Five dots show the allowance: full when ready, refilling over 5 s once used. With none
    left the grid dims.
- **Crowd:** see Round 2 above. In practice it is an eye with up to five 24 px avatars in a
  light pill in the corner. The reacting spectator's avatar hops.

## Raspberry Pi budget

- Animations use only `transform` and `opacity`, so the compositor runs them.
- At most 12 floats on screen. Reactions beyond that are dropped, not queued.
- Reactions that arrive while the tab is hidden are dropped, so no pile-up bursts on return.
- The 8 reaction pictures (24 KB) are preloaded while idle. Animal avatars (1–8 KB each) load
  on first use and are then cached.
- The overlay sits outside the board's render, so a float never re-renders a player row.

## Compatibility

- A new backend with an old client: nothing changes. The old client never joins the group.
- A new client with an old backend: the reactions join fails and is logged. Play,
  achievements and spectating work as before, and reactions start once the backend is
  updated.
- The popover API is supported in Chrome 114+, Safari 17+ and Firefox 125+.

## Verified, round 2 (2026-11-09)

- **Backend:** 448 tests pass, 13 of them for the registry: the sliding window, arrival
  order, versions, and changes on claim, send, leave and disconnect.
- **Client:** typecheck passes and 434 tests pass, including the limiter's window and
  progress, and the crowd parsing.
- **Live hub** (a private backend on port 7217, driven by a Node SignalR script). Every check
  passed:
  - An empty crowd at first, then each arrival in order, with growing versions.
  - `GetSpectators` matches the last change, and claiming again changes nothing.
  - 5 accepted, then rejected; still rejected at 2.5 s, and 5 more after 5 s.
  - A first send broadcasts the crowd before its reaction.
  - Leaving and disconnecting both update the board.
- **Headless Chrome** (the overlay and the picker served by Vite, without a backend):
  - No chip with nobody watching. With three, the label reads "3 watching: Giraffe, Otter,
    and Fox". With eight: the newest five and "+3".
  - The reacting avatar hops, and the floats rise from just above the chip.
  - The dots read "2 of 5 ready" after 3 taps, and "0 of 5" after 6 taps (the 6th refused,
    the grid dimmed). About 5 s later, 3 are back.
  - No page errors.

## Verified, round 1 (2026-11-09)

- **Backend:** 445 tests pass, 10 of them new (`SpectatorReactionRegistryTests`).
- **Client:** typecheck passes and 433 tests pass. New tests cover the catalog, the limiter,
  the live-service parsing, and a check that every key has a shipped SVG.
- **Live hub** (the new backend on the local prod copy, driven by a Node SignalR script):
  - Animals: claiming is stable per connection, and spectators get different animals.
  - Inactive games get `null`.
  - Sending: unknown keys are rejected, a burst stops at 6, the sender gets no echo, and the
    player and the other spectator receive each reaction.
  - Leaving stops delivery, and a send without a claim gets a name.
- **Headless Chrome** (the dev client on a laptop, the board at 1366 × 768 and a phone at
  390 × 844):
  - The tray opens under React, and a tap outside closes it.
  - Floats reach the board, and the grid dims after 5 taps.
  - No console errors.
- **Not done:** a run on the Raspberry Pi itself, and the reduced-motion look (CSS only).

## Smoke test

1. Start a game on the play page (or the Pi).
2. Open `/spectate/{gameId}` in two other browsers, or a phone.
3. Each spectator sees "You're the …" in the tray, with a different animal.
4. Tap reactions:
   - Floats appear at once for the sender, and within a moment on the board and the other
     spectator.
   - Mash one reaction: after 5 the dots are empty and the grid dims, until 5 s after the
     first tap.
   - The board's corner shows the spectators' animals. The reacting one hops.
5. Reload a spectator: it gets a new animal.
6. With reduced motion turned on (OS setting): floats fade in place.

## Follow-ups (not done)

- A per-game cap on the server, if a game ever gets dozens of spectators.
- Sound, off by default.
