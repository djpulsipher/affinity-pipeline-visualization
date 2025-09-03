# Repository Guidelines

## Project Structure & Module Organization
- Source: `public/` contains the browser app (`index.html`, `app.js`, `styles.css`).
- API: `api/` exposes serverless endpoints (e.g., `api/lists.js`, `api/pipeline-data.js`, `api/test-fields/[listId].js`).
- Config: `.env` for secrets (see `env.example`), `vercel.json` for local dev, Docker files for containerization.
- Docs: `README.md`, `SETUP.md`, `DEPLOYMENT.md`.

## Build, Test, and Development Commands
- Install: `npm install` — install dependencies.
- Dev server: `npm run dev` or `npm start` — runs `vercel dev` serving `public/` and `api/` at `http://localhost:3000`.
- Quick start: `./quick-start.sh` — guided local setup (if needed).
- Docker (optional): `docker build -t affinity-pipeline .` then `docker run -p 3000:3000 -e AFFINITY_API_KEY=... affinity-pipeline`.

## Coding Style & Naming Conventions
- Language: Node.js CommonJS for API, vanilla JS/HTML/CSS for frontend.
- Indentation: 2 spaces; include semicolons; prefer single quotes.
- API routes: one handler per file exporting `(req, res) => {...}`; use clear names like `lists.js`, `field-values.js`.
- Files: lowercase with hyphens (e.g., `pipeline-data.js`). Dynamic routes use bracket folders (e.g., `test-fields/[listId].js`).

## Testing Guidelines
- Frameworks are not yet configured. Prefer incremental tests:
  - API: add Jest tests under `api/__tests__/*.spec.js`.
  - UI smoke: manual checks in browser (pipeline loads, filters work, timeline updates).
- Run locally with `vercel dev`; verify key endpoints: `/api/lists`, `/api/pipeline-data?listId=...`.

## Commit & Pull Request Guidelines
- Commits: concise, imperative summaries (e.g., "Refine funnel stage labels", "Fix start date handling").
- PRs: include purpose, scope, and screenshots/GIFs for UI changes; list test steps and affected endpoints; link issues if applicable.
- Keep changes focused; avoid mixing refactors with feature work.

## Security & Configuration Tips
- Secrets: set `AFFINITY_API_KEY` in `.env` (never commit). `.gitignore` already excludes env files.
- Network calls: use `api/affinityClient.js` and pass params explicitly; handle 401/403/404 gracefully as in `pipeline-data.js`.
- Review `DEPLOYMENT.md` for production notes; prefer Docker or Vercel with environment variables.

