# Project Guidelines

## Project Overview
LyriCast is a cross-platform desktop application for presenting lyrics, Bible verses, and free slides to a projector. It uses an Angular front-end running inside an Electron shell, with GPU-accelerated rendering (PixiJS) for rich, performant text/graphics composition. Background services/workers handle parsing and data preparation for songs, Bible, and free slides.

Key goals:
- Fast, smooth stage/projector rendering with animations and precise text layout.
- An editor-like UX for arranging text blocks, images, and shapes.
- Packaged desktop builds for Windows (primary) and Linux.

## Tech Stack
- Monorepo: Nx
- UI: Angular 18, Angular Material
- Rendering: PixiJS 8
- State: NgRx (including ComponentStore)
- Desktop: Electron (electron-builder for packaging)
- Tooling: PNPM, TypeScript, Jest (Nx), Docker (optional for Linux build)

## Repository Layout (high level)
- apps/
  - browser/ — Angular application (runs in Electron, also serves in dev on http://localhost:4200)
  - electron/ — Electron main process app and packaging config/targets
  - ...services — Worker/service projects (e.g., songs-service, bible-service, free-slide-service)
- libs/ — Shared libraries (UI, domain, utilities)
- tools/ — Build and packaging scripts (zip, electron-builder config, etc.)
- llm-docs/ — Notes for LLM/context
- .junie/ — This file and other Junie automation hints

Note: Concrete projects can be listed via Nx (nx show projects) if needed.

## Getting Started (Windows)
Prerequisites:
- Node.js 22.19 via NVM for Windows
- PNPM installed globally

Setup:
- pnpm install

Development:
- npm run start
  - Serves Angular at http://localhost:4200 and launches Electron; worker builds watch in parallel.

Build (Windows):
- npm run build-win
  - Builds Angular, workers, and packages Electron (32-bit NSIS configured).

Build (Linux, experimental):
- See README for Docker-based or WSL flow; electron-builder is used under the hood.

## Testing
- Nx/Jest is configured; run with Nx on a per-project basis, e.g.: nx test <project>
- If a root test script is added later, prefer that. Currently, prioritize project-level targets.

## Code Style and Conventions
- TypeScript strictness per tsconfig.base.json; prefer explicit types on public APIs.
- Use Angular and RxJS best practices (avoid subscriptions without teardown; prefer async pipes or takeUntil patterns).
- Keep rendering code (PixiJS) isolated from Angular templates; interact via services/stores.
- Follow Nx module boundaries; place shared logic in libs/.
- Use PNPM workspaces; do not commit node_modules. Build artifacts go to dist/.

## CI/CD and Packaging
- electron-builder drives packaging. Windows target uses NSIS (ia32). Zipping of dist is automated via tools scripts.
- Postinstall handles electron dependencies (install-app-deps and optional rebuilds).

## Notes for Junie
- Prefer minimal, targeted changes.
- When adding features impacting runtime, verify via npm run start.
- For build-related changes, verify npm run build-win locally where possible. 
