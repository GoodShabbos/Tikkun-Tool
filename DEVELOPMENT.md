# Development Notes

## Branching & Deployment

- **`dev`** is the active development branch. All new work should be committed here.
- **`production`** is the live/deployed branch.

> **Important:** Only commit and merge to `production` once `dev` is stable. Do not push work-in-progress to `production`.

## Workflow

1. Make changes on `dev`.
2. Verify locally (`npm run dev`, `npm test`, `npm run checks`).
3. Only when `dev` is stable and verified, merge to `production` for deployment.