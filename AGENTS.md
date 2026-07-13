# AGENTS.md — sodimac-app

Compact repo guide for OpenCode sessions. If a fact is obvious from filenames or default tooling, it is omitted.

## Project kind

- Ionic Angular **standalone** app (`ionic.config.json` → `"type": "angular-standalone"`).
- Angular 20 + Ionic 8 + Capacitor 8.
- Single app workspace (not a monorepo). Project name in `angular.json` is `app`.

## Everyday commands

| Task | Command |
|------|---------|
| Dev server | `npm start` (serves the `development` configuration by default) |
| Production build | `npm run build` |
| Dev build + watch | `npm run watch` |
| Tests (watch mode, Chrome) | `npm test` |
| Tests once (CI) | `npx ng test --configuration=ci` |
| Lint | `npm run lint` |

- `angular.json` defines a `ci` configuration for both `build` and `test` that disables progress and, for tests, disables watch.
- Build output directory is `www` (used by Capacitor as `webDir`).
- `angular.json` component style budgets were raised to `4kb` warning / `8kb` error (from `2kb`/`4kb`) to allow richer per-page styles without noisy warnings.

## Architecture

- Entry point: `src/main.ts` bootstraps `AppComponent` using `bootstrapApplication`.
- Routing: `src/app/app.routes.ts`. Uses `provideRouter` with `PreloadAllModules` and `IonicRouteStrategy`.
- Pages are standalone components. New page schematics default to `styleext: scss`, `standalone: true`.
- Current only route: `/home` → `src/app/home/home.page.ts`.
- Ionic components must be imported from `@ionic/angular/standalone`, not from `@ionic/angular`.

## Tests

- Karma + Jasmine, browser `Chrome`, default `singleRun: false`.
- Karma config: `karma.conf.js`; test bootstrap: `src/test.ts`.
- Coverage is written to `coverage/app`.
- Run a single spec file: `npx ng test --include='src/app/home/home.page.spec.ts'`.

## Code style / lint

- ESLint config in `.eslintrc.json`. Linted patterns: `src/**/*.ts`, `src/**/*.html`.
- Angular selector prefix is `app`; component selectors must be kebab-case elements; directive selectors must be camelCase attributes.
- Allowed component suffixes: `Page` and `Component`.
- EditorConfig: 2-space indentation, UTF-8, final newline, single quotes for `*.ts`.

## Capacitor / native workflow

- Capacitor config: `capacitor.config.ts`. `appId` is still the starter placeholder `io.ionic.starter`.
- Always build before syncing native platforms: `npm run build && npx cap sync`.
- No `android`/`ios` platforms are committed yet. Add with `npx cap add android` or `npx cap add ios`.
- Open native IDEs: `npx cap open android` / `npx cap open ios`.
- Native project dirs and `www` are gitignored.

## Environment / build

- Environment files are in `src/environments/`.
- Production build replaces `environment.ts` with `environment.prod.ts` via `angular.json` `fileReplacements`.

## Notes

- No `README`, CI workflows, `opencode.json`, or existing agent instruction files were found in the repo.
- `@capacitor-community/sqlite` is installed; unit tests will likely need to mock it.
