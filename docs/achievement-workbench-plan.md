# Achievement builder: workbench layout

Status: implemented 2026-11-08, unstaged.

## Goal

Replace the two rows of tabs (Browse / Editor, then Details / Parameters / Logic blocks)
with one workbench screen, based on concept 4 from the redesign proposals:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [≡] (tier) Shanghai {n}   Published v1 · 🔒      [Create editable draft] │  ← bar
│ errors after Save/Publish (click → jumps to section)                     │
├────────────┬──────────────────────────────────────────┬──────────────────┤
│ Library    │ Unlock rule                     − 100% + │ ▾ Card           │
│ [search]   │                                          │   name, desc     │
│ [+ New]    │   existing node canvas                   │   category       │
│ SHANGHAI   │   (aa-achievement-logic-editor,          │ ▾ Tier & type    │
│ • Shang {n}│    unchanged)                            │ ▾ Variants (20)  │
│   v2 Draft │                                          │   {n} 1 → 20     │
│   v1 Pub.  │                                          │ ▾ Preview        │
│ VICTORY    │                                          │                  │
└────────────┴──────────────────────────────────────────┴──────────────────┘
                       dialog footer: Close · Save draft · Publish
```

The node builder (`aa-achievement-logic-editor`) is kept as it is. Only the chrome around it changes.

## Decisions

| Area | Decision |
|---|---|
| Browse tab | Removed. `aa-achievement-template-library` becomes a sidebar list: search, New achievement, templates grouped by category in category order, one row per template (shows its draft, else latest version). The selected template expands to list its versions. Unsaved changes show as a dot. A new unsaved draft shows as its own row at the top. |
| Details / Parameters tabs | Removed. Their fields move into a right-hand inspector with four collapsible sections: Card, Tier & type, Variants, Preview. Each collapsed header shows a summary (name, tier icon, count). |
| Category picker | A `<select>` plus Manage, since chips don't fit a 340px column. The category manager opens as an overlay over the canvas, where it has room. |
| Logic canvas | Always visible in the centre. It is remounted (`keyed`) when another template/version is opened, so it re-fits. |
| Errors | Errors carry their section. The error list sits under the bar; each error is a button that opens and scrolls to its section (logic errors focus the canvas). Section headers show an error count. |
| Read-only | Everything is in the fixed-height bar (status badge, lock with the reason as tooltip, "Create editable draft" button), so switching between versions never adds or removes a row. The draft-conflict choice opens as an overlay over the panes. The inspector is `inert`; the logic editor already has `readOnly`. |
| Save / Publish | Stay in the dialog footer (host-owned). They no longer need hiding, because there is no Browse tab. |
| Host event | `achievement-builder-workspace-change` with `{ tab, readOnlyReason }` becomes `achievement-builder-state-change` with `{ readOnlyReason }`; seasons page updated. |
| View-only (user page) | No library, no toggle. Bar, canvas and read-only inspector only. |
| Responsive | Host is a size container. Below 1100px the library is an overlay drawer (closed by default, closes after choosing). Below 760px the canvas and inspector stack and the body scrolls. |
| Persistence | Library open/closed and collapsed sections are remembered in `localStorage` (wrapped in try/catch). |

## Files

- `achievement-builder.ts` – new layout; tabs removed; inspector sections; error → section mapping; state-change event.
- `achievement-builder.css` – workbench grid, bar, inspector, drawer, container queries. Old tab/details/parameters layout CSS removed.
- `achievement-template-library.ts/.css` – rewritten as a sidebar list.
- `achievement-draft.ts` – `BuilderTab` kept as the validation area type (`details | parameters | logic`); tests unchanged.
- `pages/seasons-page/seasons-page.ts` – listens to the new event.

## Smoke test

1. Seasons → Achievement builder: the library lists templates by category, and a new empty draft is selected.
2. Type a name with `{n}`, add a parameter in Variants. The Preview count updates. The library's "new" row shows the name.
3. Click another template with unsaved changes: you're asked to confirm. Cancel keeps the draft.
4. Open a published version: the notice appears in the bar, the inspector is greyed out, and "Create editable draft" unlocks it.
5. Save with an empty description: the error appears under the bar, the Card section opens, and clicking the error scrolls to it.
6. Collapse the library and sections, then close and reopen the dialog: the state is kept.
7. Make the window narrow: the library becomes a drawer, and the inspector stacks under the canvas.
8. User page → open an achievement's template: view-only workbench, no library.
