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
| Android USB single terminal | `npm run android` (levanta dev server y corre app; funciona con VPN) |
| Android USB live reload | `npm run android:usb` (requiere `npm run start:usb` en otra terminal; funciona con VPN) |
| Android USB sync only | `npm run android:usb:sync` |
| Android WiFi live reload | `npm run start:external` + `npm run android:external` (PC y celular sin VPN) |

- `angular.json` defines a `ci` configuration for both `build` and `test` that disables progress and, for tests, disables watch.
- Build output directory is `www` (used by Capacitor as `webDir`).
- Component style budgets: `4kb` warning / `8kb` error (raised from defaults to avoid noisy warnings on richer per-page styles).

## Architecture

- Entry point: `src/main.ts` bootstraps `AppComponent` via `bootstrapApplication` with `provideHttpClient`, `provideIonicAngular()`, and `PreloadAllModules` routing.
- `APP_INITIALIZER` calls `AuthFacade.init()` on startup to restore session from `@capacitor/preferences`.
- Routing: `src/app/app.routes.ts` — lazy-loaded pages (`LoginPage`, `HomePage`), auth guard on `/home`.
- Pages are standalone components generated with `styleext: scss`, `standalone: true`.
- Ionic components imported from `@ionic/angular/standalone`, not from `@ionic/angular`.
- Clean Architecture scaffold (most layers are empty — see below):
  - `domain/` — models (interfaces only) and planned repository interfaces (empty).
  - `data/` — concrete implementations. Only `auth/` exists (mock `AuthService`).
  - `application/` — use cases (empty).
  - `state/` — Signals-based facades. Only `auth/` exists (`AuthFacade`).
  - `features/` — standalone pages. Only `auth/login` and `home` exist.
  - `core/` — cross-cutting infra. Only `auth/guards` has code; `soap/`, `sync/`, `database/` are empty.
  - `shared/` — only `utils/` has files; `components/`, `directives/`, `pipes/` are empty.
- **The app is early stage**: only the auth flow (login → home) is built. Branch, Event, SOAP client, SQLite repositories, and sync layer are scaffold directories with no code.

## Auth flow

- `AuthFacade` (`src/app/state/auth/`) is the single public API: exposes `session`, `loading`, `error` signals and `isAuthenticated` computed. Persists session to `@capacitor/preferences` under key `session`.
- `AuthService` (`src/app/data/auth/`) is a **mock** — validates RUT via modulo-11 (`validateRut`), compares password to first 6 digits of cleaned RUT (`getFirstSixDigits`), returns fake token after 300ms delay.
- `AuthGuard` (`src/app/core/auth/guards/`) checks `AuthFacade.isAuthenticated()`.
- Login password rule: default password = first 6 digits of the RUT body (e.g., RUT `12345678-9` → password `123456`).

## RUT utilities

RUT handling lives in `src/app/shared/utils/rut.utils.ts`:
- `cleanRut(rut)` — strip dots, dashes, keep only `[0-9kK]`.
- `formatRut(rut)` — format as `12345678-9`.
- `validateRut(rut)` — modulo-11 algorithm.
- `getFirstSixDigits(rut)` — first 6 digits of RUT body (used as default password).
- `rut-formatter.ts` exists but is empty.

## Tests

- Karma + Jasmine, browser `Chrome`, default `singleRun: false`.
- Karma config: `karma.conf.js`; test bootstrap: `src/test.ts`.
- Coverage written to `coverage/app`.
- Run a single spec file: `npx ng test --include='src/app/home/home.page.spec.ts'`.
- Mock `@capacitor/preferences` in tests (real Capacitor plugins unavailable in browser).

## Code style / lint

- ESLint config in `.eslintrc.json`. Linted patterns: `src/**/*.ts`, `src/**/*.html`.
- Angular selector prefix `app`; component selectors kebab-case elements; directive selectors camelCase attributes.
- Allowed component suffixes: `Page` and `Component`.
- EditorConfig: 2-space indentation, UTF-8, final newline, single quotes for `*.ts`.

## Capacitor / native workflow

- Capacitor config: `capacitor.config.ts`. `appId` is still placeholder `io.ionic.starter`.
- Live reload por USB se activa con la variable de entorno `CAPACITOR_LIVE_RELOAD=true`; apunta a `http://localhost:8100` y requiere `adb reverse tcp:8100 tcp:8100`.
- Always build before syncing: `npm run build; npx cap sync`.
- No `android`/`ios` platforms committed yet. Add with `npx cap add android` / `npx cap add ios`.
- Native project dirs and `www` are gitignored.

## Environment / build

- Environment files in `src/environments/`. Production build replaces `environment.ts` with `environment.prod.ts` via `angular.json` `fileReplacements`.
- Only `production: boolean` is defined; no `useMockSoap` toggle exists yet.

## Theming / UI

- Design system documented in `docs/ui-theme.md` (dark glassmorphism, large 64px touch targets, indigo-violet-pink accents).
- CSS custom properties and Ionic overrides in `src/theme/variables.scss`.
- Reusable utility classes defined in `variables.scss`: `.glass-card`, `.app-button`, `.app-input`, `.error-pill`, `.page-title`, `.page-subtitle`.
- `src/global.scss` imports `dark.always.css` — app is always dark, no theme toggle.
