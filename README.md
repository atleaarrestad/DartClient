# Dart Client

Lit and TypeScript frontend for the Dart application.

## Development

```powershell
pnpm install
pnpm run dev
pnpm run build
```

`pnpm run build` creates the production bundle in `dist`.

## Frontend architecture

```text
src/
  styles/       Global CSS, design tokens, and shared Lit styles
  ui/           Generic reusable UI primitives
  components/   Reusable application and domain components
  components/pages/
                Route-level data loading and orchestration
  services/     Backend and browser integrations
  models/       Shared frontend data types and schemas
```

Styled components use colocated files:

```text
component-name/
  component-name.ts
  component-name.css
```

Lit templates remain in the TypeScript component because they directly use typed state and event handlers. A template section should become a child component when it owns a cohesive interface or is reused.

## UI conventions

- Search `src/ui` and `src/components` before creating page-specific controls.
- Use semantic custom properties from `src/styles/tokens.css`.
- Use `--aa-*` custom properties only for intentional component customization.
- Keep page components focused on data loading, state, and composition.
- Reuse primitives for buttons, cards, badges, statistics, headers, form fields, and empty/error states.
- Import component CSS with `?inline` and attach it through Lit's `unsafeCSS`; only statically imported project CSS is permitted.
- Avoid template-local `<style>` blocks and large inline `css` literals.
