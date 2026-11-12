# Development and deployment

Run commands from the monorepo root. The app depends on the workspace shared UI package, so keep `packages/` and the workspace configuration when building it.

## Local work

1. Install Node.js 20+ and pnpm 10.
2. Run `pnpm install` from the root.
3. Copy `apps/rushrider/.env.example` to `apps/rushrider/.env` and supply your own GoldRush key.
4. Run `pnpm --filter rushrider dev`.
5. Before publishing changes, run `pnpm --filter rushrider test` and `pnpm --filter rushrider build`.

Live market features need a valid key and network access. The source's API integration and provider support can change independently of this snapshot.

## Deployment

The app includes `apps/rushrider/vercel.json`, which describes its monorepo build. Inspect that file and the workspace dependency graph when configuring a Vercel project. Add the required environment variable in the deployment settings, never in committed source. Do not assume that a `VITE_` variable is server-secret: it is embedded in client assets.

## Verification status

This import preserves source code without changes. Tests, dependency installation, live API behavior and a production deployment have not been run as part of preparing the copy. Documentation commands are taken from the source package scripts, not a claim that every check currently passes.
