# COLLIGATE

The UI is a manual authoring workspace: users create concept and relation banks, then assemble every proposition on the canvas.

COLLIGATE is a client-only React/Vite concept-map application. Students create their own concept and relation banks and assemble every proposition on the canvas; the product must not call AI or external model APIs.

## Run

- Development preview: `npm run dev`
- Production build: `npm run build`
- Engine and source-policy tests: `npm test`
- Browser editing-flow tests: `npm run test:browser`
- Full pre-demo check: `npm run test:all`

The Replit workflow runs `npm run dev` on `0.0.0.0:5000`. Engine fixtures and example maps live in `data/`; the UI does not load them as a course pack.

## Project constraints

- Keep the engine in `src/engine/` pure: no DOM, fetch, storage, or other I/O.
- Preserve the map and pack JSON field names defined in `AGENT_SPEC.md`.
- Structure feedback must remain deterministic and include derivation text for “show your work.”
- There is no backend, database, authentication, sync, or in-product AI.