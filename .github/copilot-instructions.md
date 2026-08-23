# Copilot instructions

This repository (`dartClient`) is the **frontend** for the app.

The backend repository for this app is on this machine at:
`C:\Users\Atle\git\dartBackend`

The frontend (`dartClient`) and backend (`dartBackend`) are separate repositories that work together. Some features may require coordinated changes in both repos to work correctly.

## Component conventions

- Keep each component in its own folder with a component file containing its template and logic, plus a separate CSS file for its styles.
- Use the existing CSS design tokens whenever an applicable token exists instead of hardcoding equivalent values.
- Prefer reusing or extending existing components over recreating the same UI or behavior. Design new components to be reusable when the same pattern may be needed elsewhere.

When working in either repository (`dartClient` or `dartBackend`), never commit or push changes. Leave all changes unstaged.
