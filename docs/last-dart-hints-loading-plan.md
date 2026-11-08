# Last-Dart Hints: Separate, Cancellable Loading

## Status (2026-11-08)

Implemented and unstaged in both repos. The backend must be restarted to serve the new
endpoint. Still to do: a smoke test on the Raspberry Pi over the real connection.

Supersedes the "hints in game state" part (phase 2) of [last-dart-hints-plan.md](last-dart-hints-plan.md).

## The problem

Hints were worked out as part of saving a throw:

- `UpdateDartThrow` ran the prediction search while holding the game's `MutationGate`, so
  every save waited for it, on a slow connection and a slow machine.
- The result went to every device in the SignalR delta: up to 100 hints, each a full
  achievement response plus hit objects. Spectators got it too.
- Once sent, nothing could stop it. A player who had already typed the third dart still
  waited for, and downloaded, hints for a dart that was gone.

## Design

### Backend (dartBackend)

- **Saving a throw** only updates the live projection. Hints are no longer in
  `GameTracker`, the delta or the snapshot.
- **`GET games/sessions/{gameId}/player/{playerId}/last-dart-hints`** in `GameController`:
  - It copies the player's rounds under `SyncRoot` and never takes the `MutationGate`, so it
    never holds up a save.
  - It caches per player, keyed by the rounds (`GameTracker.LastDartHintCache`). Each dart is
    worked out once, however many devices ask.
  - It passes `HttpContext.RequestAborted` down to `PredictionWorkBudget`, which checks it on
    every evaluation. When the client cancels, the search stops and nothing is cached.
  - If evaluation fails, it logs the error and returns 204. Throws are unaffected.
  - It returns 204 when the last dart isn't up or nothing is in reach.
- **Slim payload.** Each hint carries only `id`, `name`, `tier` and its winning `hits` in dart
  notation (`S20`, `D16`, `T19`, `25`, `Bull`, `Rim`, `Miss`). The notation is written by
  `DartNotation.Format`, which matches the client's `formatHit`.

### Client (dartClient)

- **`LastDartHintsLoader`** (`src/components/pages/game-page/last-dart-hints-loader.ts`) is a
  ReactiveController on the game page.
  - The page passes it a target on every update, from `willUpdate`, so this adds no render.
  - The target is only ever the dart being thrown now (`getCurrentThrow`), and only when it is
    a last dart: the third dart of the round whose first two are down (`isLastDartUp`).
    - On the play page that dart is the selected cell.
    - Spectators follow whoever threw last.
    - There is no fallback to another player, so moving to another player or another dart
      drops the hints at once.
  - Players with a throw still saving are skipped. Saves are counted per player, so two
    overlapping saves can't release the player early.
  - The target's key is game, player, round and the darts in that round. A correction to the
    second dart is a new key.
  - It waits **150 ms** before sending, so a player who types the third dart quickly sends
    nothing at all.
  - When the target changes or goes away, it aborts the request. That cancels the fetch, and
    the server stops working.
  - It drops answers for a cancelled request, or for a different round than asked. A failed
    request shows as no hints.
- **`DataService`**:
  - Requests take an optional `signal`, combined with the timeout through `AbortSignal.any`.
  - If the caller cancels, the request rejects with an `AbortError` rather than a reported
    failure.
  - `getLastDartHints` reads both 204 and 404 as "no hints".

### Waiting, without distracting

The strip (`aa-last-dart-hints`) keeps its fixed size throughout.

- The board stays unlit while waiting. Hints for an earlier dart are never shown.
- The player's name appears in the "Last dart" box right away.
- For the first **400 ms**, nothing else changes, so a quick answer goes straight from rest to
  lit with no flicker.
- Between last darts the side is empty, keeping its space. The old resting text ("Throws that
  unlock an achievement light up here…") was removed as noise.
- After 400 ms, *"Looking for throws…"* appears on the side. It is italic, low contrast and
  breathes slowly. On narrow screens, where the side is hidden, a small dot above the T/D/S
  letters gives the same cue. Only one cue shows at a time.
- With reduced motion, the note appears at the same moment but without fading or breathing.
- When the answer is "nothing in reach", the side says *"Nothing to unlock with this dart."*,
  so the player can tell it's done.
- `aria-busy` is set on the strip while waiting.

This change also fixed the best-throw star, which showed as `°5`. A bad escape had replaced
`★`, and it is now `'\2605'`.

## Compatibility during deploy

- **New client, old backend:** the GET returns 404, so no hints are shown. The schema strips
  the hints an old backend still puts in deltas.
- **Old client, new backend:** no hints are shown (the delta field defaults to empty).

## Verification

- **Backend:** 434 tests pass. New tests:
  - `LastDartHints_AreServedOnlyWhileTheLastDartIsUp`
  - `LastDartHints_AreWorkedOutOncePerDart`
  - `LastDartHints_WhenTheyFail_AreNoContentAndThrowsAreUnaffected`
  - `LastDartHints_StopWhenCancelled`
  - `DartNotation_WritesHitsLikeTheClient`
- **Client:** 416 tests pass, both typechecks are clean, and lint shows 0 errors.
  - New loader tests cover the delay, cancelling when the darts change or the dart passes,
    late answers, failures, wrong-round answers and disconnecting.
  - Other new tests cover `parseHit`, `getLastDartRoundIndex`, the data-service request and
    cancel, and the slim schema.

### Smoke test

1. Restart the backend, then start a game.
2. After the second dart, the strip lights up within a moment.
3. Type the third dart straight after the second. In DevTools → Network, the hints request is
   either never sent or shows as *(canceled)*. The throw saves as normal.
4. Throttle to "Slow 3G". After the second dart, *"Looking for throws…"* appears after about
   half a second, then the board lights.
5. Correct the second dart. The strip goes back to waiting and lights for the new dart.
