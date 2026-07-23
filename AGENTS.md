# AGENTS.md — sodimac-app

Compact repo guide for OpenCode sessions. If a fact is obvious from filenames or default tooling, it is omitted.

## Project kind

- Ionic Angular **standalone** app (`ionic.config.json` → `"type": "angular-standalone"`).
- Angular 20 + Ionic 8 + Capacitor 8.
- Single app workspace (not a monorepo). Project name in `angular.json` is `app`.
- Tailwind CSS is wired in (`tailwind.config.js`, `postcss.config.js`, `src/global.scss`).
- `@capacitor-community/sqlite` for local SQLite on native platforms.

## Everyday commands

| Task | Command |
|------|---------|
| Dev server | `npm start` (serves the `development` configuration by default) |
| Production build | `npm run build` |
| Dev build + watch | `npm run watch` |
| Tests (watch mode, Chrome) | `npm test` |
| Tests once (CI) | `npx ng test --configuration=ci` |
| Lint | `npm run lint` |
| Build + sync native assets | `npm run build` then `npx cap sync` |

- `angular.json` defines a `ci` configuration for both `build` and `test` that disables progress and, for tests, disables watch.
- Build output directory is `www` (used by Capacitor as `webDir`).
- Component style budgets: `4kb` warning / `8kb` error.

## Architecture

- Entry point: `src/main.ts` bootstraps `AppComponent` via `bootstrapApplication` with `provideHttpClient`, `provideIonicAngular()`, and `PreloadAllModules` routing.
- `APP_INITIALIZER` initializes three facades on startup in this order: `AuthFacade.init()`, `ThemeFacade.init()`, `SqliteDatabaseRepository.initialize()`.
- Routing: `src/app/app.routes.ts` — lazy-loaded pages (`login`, `sync`, `home`, `events`, `zone-select`, `counting`), all guarded by `authGuard` except `login`.
- Pages are standalone components generated with `styleext: scss`, `standalone: true`.
- Ionic components imported from `@ionic/angular/standalone`, not from `@ionic/angular`.
- Clean Architecture scaffold:
  - `domain/` — models and repository interfaces.
  - `data/` — concrete implementations (auth, database, catalogo, conteo, evento, sesion, store, sucursal, sync).
  - `state/` — Signals-based facades (auth, theme, counting, event, store, sync, zone).
  - `features/` — standalone pages.
  - `core/` — cross-cutting infra (http, database, auth/guards).
  - `shared/` — utils, components, static data.

## Auth flow

- `AuthFacade` (`src/app/state/auth/`) is the single public API: exposes `session`, `loading`, `error` signals and `isAuthenticated` computed. Persists session to `@capacitor/preferences` under key `session`.
- `AuthService` (`src/app/data/auth/`) calls the backend via `ApiService.post('auth/login.php', request)`. It expects the server wrapper `{ status, msg, data }` and maps `data.user` fields (`operador_id`, `nombre_completo`, `rut`, `rut_normalizado`, `rol`, `correo`).
- Offline fallback: if the HTTP request fails with a network error (`status === 0`), `AuthFacade` falls back to the cached operator in SQLite (`sod_user`). The cached operator can log in using the default password (first 6 digits of the RUT).
- `AuthGuard` checks `AuthFacade.isAuthenticated()`.
- Login password rule: default password = first 6 digits of the RUT body (e.g., RUT `12345678-9` → password `123456`).

## Backend / API

- Base URL is configured in `src/environments/environment.ts` and `environment.prod.ts` (`apiUrl`).
- The PHP web service lives in the Laragon docroot under `C:\laragon\www\ws\api\`. Because Laragon serves `C:\laragon\www\` as the root, the real endpoint is `http://<host>/ws/api/auth/login.php`, not `http://<host>/api/auth/login.php`.
- `ApiService` (`src/app/core/http/api.service.ts`) unwraps `{ status: 'OK' | 'ERROR', msg, data }` and throws on `ERROR` or missing `data`.
- CORS is handled server-side; for local dev/Android the backend must be reachable on the LAN IP used in `environment.ts`.

## Theme

- `ThemeFacade` supports light/dark toggle, persisted under key `theme` in `@capacitor/preferences`.
- `global.scss` imports `@ionic/angular/css/palettes/dark.always.css`, but `src/theme/variables.scss` defines both `:root` (light) and `:root.dark` tokens. The active theme is driven by the `.dark` class on `<html>`.
- `StatusBar` style/background is updated on native platforms when the theme changes.

## SQLite / offline

- `@capacitor-community/sqlite` is wrapped by `SqliteConnectionService` (`src/app/core/database/`).
- SQLite is only initialized on native platforms (`Capacitor.isNativePlatform()`); on web/Karma it is silently skipped.
- Schema lives in `src/app/core/database/sodimac.schema.ts` (`SODIMAC_DB_NAME = 'sodimac'`, version 3).
- The repository drops old renamed tables (`cat_operador`, `cat_zona`, etc.) on initialize to migrate from earlier schema versions.

## Capacitor / native workflow

- Capacitor config: `capacitor.config.ts`. `appId` is still placeholder `io.ionic.starter`.
- Android project exists under `android/` and is tracked in Git (build artifacts and IDE files are gitignored).
- `capacitor.config.ts` sets `server.androidScheme: 'http'` to avoid mixed-content blocks when the backend is HTTP.
- `AndroidManifest.xml` has `android:usesCleartextTraffic="true"` and references `network_security_config.xml`, which permits cleartext traffic for `192.168.1.9`, `ws.code`, `localhost`, and `127.0.0.1`.
- Always build before syncing: `npm run build; npx cap sync`.
- No iOS platform committed yet. Add with `npx cap add ios` if needed.

## Tests

- Karma + Jasmine, browser `Chrome`, default `singleRun: false`.
- Karma config: `karma.conf.js`; test bootstrap: `src/test.ts`.
- Coverage written to `coverage/app`.
- Run a single spec file: `npx ng test --include='src/app/home/home.page.spec.ts'`.
- Mock `@capacitor/preferences` and other Capacitor plugins in tests (real plugins are unavailable in the browser).

## Code style / lint

- ESLint config in `.eslintrc.json`. Linted patterns: `src/**/*.ts`, `src/**/*.html`.
- Angular selector prefix `app`; component selectors kebab-case elements; directive selectors camelCase attributes.
- Allowed component suffixes: `Page` and `Component`.
- EditorConfig: 2-space indentation, UTF-8, final newline, single quotes for `*.ts`.

## Environment / build

- Environment files in `src/environments/`. Production build replaces `environment.ts` with `environment.prod.ts` via `angular.json` `fileReplacements`.
