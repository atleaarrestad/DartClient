# Phone spectating

Someone in the room scans the QR code in the side column and watches on their phone. On a
phone (`max-width: 700px`) the spectate page has its own layout. The user picked it from five
mockups: design **F**, B's standings list with A's last-dart board, on the "Phone spectating"
canvas artifact.

## Status

Built 2026-11-09 and left unstaged. Nothing changed on the backend.

## Layout (top to bottom)

1. **Bar**: eye + "Spectating", then "Round 6 of 12", then the React button. There is no
   navigation bar and no Join game. While live sync isn't up, the round becomes
   "Connecting…" or "Reconnecting…".
2. **Players list**: in turn order (the page's order). The player in focus is opened up:
   - rank icon, name, rank and MMR, then total and what is left;
   - this round's three darts, big; the dart to come is outlined orange ("Last dart" on the
     third), with the round's sum beside them;
   - the earlier rounds as small cells (they wrap rather than scroll), and the achievements
     unlocked so far.

   Every other player is one row: rank icon, name, "Last round N", total and what is left.
   Tags: Up next (teal), Throwing (orange, only while someone else is in focus), Won.
3. **Last-dart board**: `aa-last-dart-hints` with `compact`. It shows only while the player in
   focus is on a last dart and there is something to aim for (hints, a win or 69):
   - a small board on the left, with no callouts and a view box tight to the board;
   - the best two throws beside it, and "N more throws" to show all four;
   - the rim and miss chips only when they are lit or ringed;
   - no miss third (no room) and no name (the list says who).
4. **Crowd**: `aa-watch-panel` restyled through `::part(panel)` into a flat strip along the
   foot. Reactions rise over the list from just above it.

## Space and scrolling

- The bar, board and crowd keep their size. The list takes what is left
  (`flex: 0 1 auto`) and scrolls inside itself with its scrollbar hidden. A spacer takes
  whatever room the list doesn't need, so the board sits at the bottom.
- The page is exactly the screen: `global.css` hides `aa-navigationbar` and uses `100dvh`
  for `.app-container` when it holds `spectate-game-page` at that width. Nothing else scrolls.
- The list scrolls the player in focus into view, but only when the focus moves to another
  player or the list changes height (the board coming or going). It never does so on every
  dart, so someone scrolling around isn't pulled back.

## Focus

`src/helpers/spectateFocus.ts` (tested in `spectateFocus.test.ts`):

- **Live player**: whoever threw last while their round is under way. Otherwise anyone
  mid-round (someone who just opened the page has seen no dart arrive yet). Between turns,
  the first in turn of those furthest behind in rounds. Players who have won, or who are at
  the round limit, are skipped.
- **Next player**: the next one in turn who still plays.
- **Tapping**: a row puts that player in focus. Tapping the thrower's row (tagged Throwing),
  or that player coming up to throw, follows the game again.
- `GamePage.getCurrentThrow` (spectators) now uses the same live player. So hints also show
  for a last dart that is already up when someone opens the page; before, they waited for
  the next dart to arrive.

## Code

- `spectate-game-page.ts/.css`:
  - `isPhone` follows the media query;
  - `renderReadyState` → `renderPhone`;
  - `pinnedPlayerId`, plus the list's resize observer for keeping the focus in view.
- `game-page.ts`: these are now protected: `renderReadyState`, `getTierRewards` and
  `spectators`. New: `getLivePlayerId`, `getLastDartHintsState`.
- `aa-last-dart-hints`: the `compact` property and `showingAll` state; `renderBoard`'s view
  extent; `renderOffBoard(onlyLit)`. The CSS section is "Compact"; its board size is the
  `--hints-board-size` variable, by default a third of the width.
- `aa-watch-panel`: `part="panel"`.

The tablet and desktop widths (over 700px) are unchanged, Join game included.
