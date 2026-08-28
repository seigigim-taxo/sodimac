# AGENTS.md — sodimac-app

Compact repo guide for OpenCode sessions. If a fact is obvious from filenames or default tooling, it is omitted.

## Collaboration rules

- Do not generate an implementation prompt unless the user explicitly asks for one. When the user asks for a prompt, generate it then and only then.

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
| Dev server (mockup) | `npm run start:mockup` (uses `login_mockup.php` + `preparacion_mockup.php`) |
| Production build | `npm run build` |
| Dev build + watch | `npm run watch` |
| Tests (watch mode, Chrome) | `npm test` |
| Tests once (CI) | `npm run test:ci` |
| Lint | `npm run lint` |
| Android USB single terminal | `npm run android` (levanta dev server y corre app; funciona con VPN) |
| Android USB live reload | `npm run android:usb` (requiere `npm run start:usb` en otra terminal; funciona con VPN) |
| Android USB sync only | `npm run android:usb:sync` |
| Android WiFi live reload | `npm run start:external` + `npm run android:external` (PC y celular sin VPN) |
| Build + sync native assets | `npm run build` then `npx cap sync` |

- `angular.json` defines a `ci` configuration for both `build` and `test` that disables progress and, for tests, disables watch and uses `ChromeHeadless`.
- `angular.json` defines a `dev_mockup` configuration that swaps `environment.ts` → `environment.dev-mockup.ts` (login_mockup + preparacion_mockup endpoints).
- Build output directory is `www` (used by Capacitor as `webDir`).
- Component style budgets: `4kb` warning / `8kb` error.

## Architecture

- Entry point: `src/main.ts` bootstraps `AppComponent` via `bootstrapApplication` with `provideHttpClient`, `provideIonicAngular()`, and `PreloadAllModules` routing.
- **DI pattern**: `main.ts` wires all repository injection tokens (`DATABASE_REPOSITORY_TOKEN`, `AUTH_API_REPOSITORY_TOKEN`, `CONTEO_REPOSITORY_TOKEN`, etc.) to their concrete implementations. Domain interfaces live in `domain/`, concrete SQLite/Capacitor/HTTP implementations in `data/`. Never add a new dependency without registering its token here.
- `APP_INITIALIZER` wiring (in `main.ts`):
  1. `DatabaseRepository.initialize()` must complete first.
  2. Then `AuthFacade.init()` and `PdaFacade.init()` run in parallel.
  3. `ThemeFacade.init()` runs in a separate initializer (uses Capacitor Preferences, not SQLite).
  4. Initializer errors are caught deliberately — a rejected initializer blanks the screen with no feedback.
- Routing: `src/app/app.routes.ts` — lazy-loaded pages (`login`, `sync-loading`, `home`, `counting-tag`, `counting`, `tags-resumen`), all guarded by `authGuard` except `login`. `home` also uses `noSesionActivaGuard`. `counting-tag` and `counting` use `eventoSeleccionadoGuard` + `pdaBloqueadaGuard`; `counting` additionally uses `tagEnSesionGuard`. `tags-resumen` intentionally skips `eventoSeleccionadoGuard` and `pdaBloqueadaGuard` (read-only "close store" flow).
- Pages are standalone components generated with `styleext: scss`, `standalone: true`.
- Ionic components imported from `@ionic/angular/standalone`, not from `@ionic/angular`.
- Clean Architecture scaffold:
  - `domain/` — models, repository interfaces, and `shared/errors`.
  - `application/` — use cases (auth, conteo, evento, pda, sincronizacion, sucursal, ubicacion, zona-tipo, zona).
  - `data/` — concrete implementations (auth, database, conteo, evento, muestra, pda, sincronizacion, sucursal, theme, ubicacion, zona).
  - `state/` — Signals-based facades (auth, conteo, evento, pda, sucursal, theme, zona, zona-tipo).
  - `features/` — standalone pages (auth, counting, home, sync-loading).
  - `core/` — cross-cutting infra (http, database, auth/guards, utils).
  - `shared/` — utils, components, static data.

## Counting flow

- `ConteoFacade` (`src/app/state/conteo/`) owns the counting session: open session → load muestra set → upsert/adjust/delete items → finalize. Backed by real SQLite (`sod_conteo`, `sod_conteo_detalle`).
- `counting-tag` (tag/zone selection), `counting` (working screen), and `tags-resumen` (summary) are the three counting pages.
- `WriteQueue` (`src/app/core/utils/`) serializes concurrent SQLite writes from the counting UI.

## Analyst validation flow

- `AnalystDashboardFacade.guardarValidacionAltillosTag()` is the single entry point for saving analyst validations.
- Flow: save local SQLite → sync WS → reload local data.
- `SincronizarValidacionAnalistaUseCase` handles the WS sync via `sincronizaciones/validacion-analista.php`.
- Local persistence: updates `sod_validacion_producto`, `sod_validacion_tag`, `sod_validacion_bloque` in a single transaction.
- Sync queue: `sod_sincronizacion` with `operacion = 'VALIDACION_OPERACIONAL'`, `perfil = 'ANALISTA_CLIENTE'`.
- UI: only Altillos is enabled in A0.10. Punto de Venta remains disabled until A0.11.

## Auth flow

- `AuthFacade` (`src/app/state/auth/`) is the single public API: exposes `session`, `loading`, `error`, `isAuthenticated`, and `wasOfflineLogin` signals.
- `AuthService` (`src/app/data/auth/`) calls the backend via `ApiService.post('auth/login.php', request)`. It expects the server wrapper `{ status, msg, data }` and maps `data.user` fields.
- Offline fallback: if the HTTP request fails with a network error (`status === 0`), `AuthFacade` falls back to the cached operator in SQLite (`sod_user`). The cached operator can log in using the default password (first 6 digits of the RUT body).
- `AuthGuard` checks `AuthFacade.isAuthenticated()`.
- Login password rule: default password = first 6 digits of the RUT body (e.g., RUT `12345678-9` → password `123456`).
- Dev bypass: `AuthFacade.loginBypass()` creates a local operator (`99800120-K`) without calling the backend. The bypass button is visible only in dev mode.

## Backend / API

- Base URL is configured in `src/environments/environment.ts` and `environment.prod.ts` (`apiUrl`).
  - All environments: `http://50.16.13.230/app/ws/sodimac/api`
  - `dev_mockup` config: same base URL but `authEndpoint` → `login_mockup.php` and `preparacionEndpoint` → `preparacion_mockup.php`.
- `ApiService` (`src/app/core/http/api.service.ts`) unwraps `{ status: 'OK' | 'ERROR', msg, data }` and throws on `ERROR` or missing `data`.
- `auth/login.php` is authentication-only. It must not prepare, mix, or return operational data.
- Operational PDA data must be downloaded through `preparacion.php` (or `preparacion_mockup.php` for dev_mockup), which returns a SQLite-ready contract. The endpoint is resolved from `environment.preparacionEndpoint`.
- The WS may use internal queries to resolve user, store, agenda, sample, products, codes, and zones, but must deliver a clean, stable contract to the APK.
- CORS is handled server-side; for local dev/Android the backend must be reachable on the IP used in `environment.ts`.

## Validación Operacional (Analista)

- Endpoint: `sincronizaciones/validacion-analista.php` (POST).
- Implementa Q13 + Q14: crear/obtener Conteo 2 `VALIDACION` y guardar confirmaciones/modificaciones de Altillos/PDV.
- Payload: `{ id_agenda, modo: 'TAG', tipo: 'ALTILLO'|'PDV', id_tag, login, motivo, items: [{ id_producto, decision, cantidad, uuid }] }`.
- Reglas: `CONFIRMAR` = cantidad inventariada actual; `MODIFICAR` = nueva cantidad completa. No es ajuste +/-.
- Backend guarda en transacción, marca versión anterior `SGO_ANALISTA` como `REEMPLAZADO` y crea nueva `VIGENTE`.
- Dispositivo: `APP_ANALISTA`. Origen: `SGO_ANALISTA`.
- Retry reutiliza el mismo `uuid` para idempotencia.
- Cola local: `sod_sincronizacion` con `operacion = 'VALIDACION_OPERACIONAL'`, `perfil = 'ANALISTA_CLIENTE'`.
- Use case: `SincronizarValidacionAnalistaUseCase` (`src/app/application/sincronizacion/`).
- Repo sync: `guardarSyncValidacion()` en `SincronizacionRepository`.
- Repo validación: `guardarValidacionTag()` en `ValidacionRepository` (actualiza `sod_validacion_producto`, `sod_validacion_tag`, `sod_validacion_bloque`).
- Facade: `AnalystDashboardFacade.guardarValidacionAltillosTag()`.
- UI: solo habilitado para Altillos. Punto de Venta queda deshabilitado hasta A0.11.

## PDA preparation contract

- The operator flow must always be: `login → preparacion → tienda principal → evento local → muestra → productos`.
- `auth/login.php` handles only authentication. No operational data is returned on login.
- `preparacion.php` is the single endpoint responsible for preparing **all** operational data the APK needs after login.
- The APK/PDA must never receive, build, or know server-side SQL queries. It only consumes a simple API contract and persists the result into local SQLite.
- The web service layer must clean, adapt, and flatten backend agendas/queries before returning data to the APK.
- Backend complexity (joins, agendas, legacy table names, query-specific structures) must stay server-side. The API response must expose stable, domain-level payloads ready for SQLite insertion.
- The APK's operational focus is **samples** (`muestra`), not agendas.
- The active event is determined by calendar date.
- Do **not** create a `sod_agenda` table. Only store `id_agenda` as a minimal metadata field if needed for traceability or sync.
- The WS must support multiple codes per product. The app models this via `sod_producto_detalle`.
- Any future sync/download work must preserve this separation: backend complexity stays in the WS; the APK works only with the prepared contract.

## Theme

- `ThemeFacade` supports light/dark toggle, persisted under key `theme` in `@capacitor/preferences`.
- `src/global.scss` imports `@ionic/angular/css/palettes/dark.class.css` (class-based dark mode).
- `src/theme/variables.scss` defines both light and `:root.dark` tokens. The active theme is driven by the `.dark` class on `<html>`.
- `StatusBar` style/background is updated on native platforms when the theme changes.

## SQLite / offline

- `@capacitor-community/sqlite` is wrapped by `SqliteConnectionService` (`src/app/core/database/`).
- SQLite is only initialized on native platforms (`Capacitor.isNativePlatform()`); on web/Karma it is silently skipped.
- Schema lives in `src/app/core/database/sodimac.schema.ts` (`SODIMAC_DB_NAME = 'sodimac'`).
- The schema is the local operational base for the APK and may be expanded as app flows evolve; add fields/tables when they support offline operation, traceability, or sync analysis instead of forcing everything into existing tables.
- The repository drops tables only when the schema version changes; old renamed/legacy tables (`cat_operador`, `cat_zona`, etc.) are also dropped during a version bump.
- To force a clean database in development, bump `SODIMAC_DB_VERSION` in `sodimac.schema.ts`.
- Dev data seeding (`SqliteDevSeederRepository`) inserts sample stores, zones, events, products, and sample assignments after login.
- Key tables: `sod_conteo` (round session, states: ABIERTO/FINALIZADO/SINCRONIZADO), `sod_conteo_detalle` (individual counts, states: EN_CURSO/FINALIZADO/SINCRONIZADO), `sod_muestra`/`sod_muestra_detalle` (sample assignments), `sod_producto_detalle` (multiple barcodes per product).

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
- No CI workflows are currently committed under `.github/workflows/`.

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

- Environment files in `src/environments/`:
  - `environment.ts` (development, uses `login_dev.php` + `preparacion_dev.php`)
  - `environment.prod.ts` (production, uses `login.php` + `preparacion.php`)
  - `environment.dev-mockup.ts` (mockup analista/operador, uses `login_mockup.php` + `preparacion_mockup.php`)
- Production build replaces `environment.ts` with `environment.prod.ts` via `angular.json` `fileReplacements`.
- `dev_mockup` build replaces `environment.ts` with `environment.dev-mockup.ts`.

## Configurations

| Configuration | Build Command | Serve Command | Login | Preparación |
|---|---|---|---|---|
| `production` | `ng build` | — | `login.php` | `preparacion.php` |
| `development` | `ng build --configuration=development` | `ng serve` | `login_dev.php` | `preparacion_dev.php` |
| `dev_mockup` | `ng build --configuration=dev_mockup` | `npm run start:mockup` | `login_mockup.php` | `preparacion_mockup.php` |
| `ci` | `ng build --configuration=ci` | — | — | — |

## Mockup analista / operador

Para probar el flujo mockup usar:

```bash
npm run start:mockup
```

Este environment apunta a:

- `auth/login_mockup.php`
- `sincronizaciones/preparacion_mockup.php`

La redirección post-sync depende de `usuario.tipo_usuario` devuelto por `preparacion_mockup.php`:

- `OPERADOR` → `/home`
- `ANALISTA_CLIENTE` → `/analyst-dashboard`

Usuarios mockup disponibles en `sodimac-ws/api/sincronizaciones/preparacion_mockup.php`:

| Perfil | Correo | RUT | Password |
|--------|--------|-----|----------|
| OPERADOR | rodrigo.rodriguez@sodimac.cl | 17534077-7 | 175340 |
| OPERADOR | operador@taxo.cl | 11111111-1 | 111111 |
| OPERADOR | seigi.gim@taxo.cl | 99800002-5 | 998000 |
| ANALISTA_CLIENTE | analista@taxo.cl | 22222222-2 | 222222 |

La password por defecto son los primeros 6 dígitos del cuerpo del RUT.
