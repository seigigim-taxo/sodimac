# ADR-001: Arquitectura Clean Architecture + Signals

**Fecha:** 2026-07-15
**Estado:** Aceptado

## Contexto

La aplicación Sodimac PDA requiere una arquitectura que soporte:
- Persistencia offline-first (SQLite)
- Estado reactivo en tiempo real
- Facilidad de testing y mantenimiento
- Separación clara entre lógica de negocio e infraestructura

## Decisiones

### 1. Clean Architecture en 5 capas

```
domain/        — Interfaces de modelos y contratos de repositorio (solo types)
data/          — Implementaciones concretas (SQLite, mocks)
application/   — Casos de uso (lógica de negocio pura)
state/         — Facades con signals (orquestación, no lógica de negocio)
features/      — Componentes standalone (presentación)
```

**Consecencia:** Cada capa tiene una responsabilidad única. `state/` no contiene lógica de negocio, solo señales y coordinación de use cases.

### 2. State management con Angular Signals

- `signal()` para estado local de componente
- `computed()` para derivadas reactivas
- `effect()` para side-effects (ej. paginación)
- Facades con signals públicos como única fuente de verdad para la UI

**No se usa:** NgRx, BehaviorSubject, Observables para estado local.

### 3. Componentes Standalone

- `standalone: true` en todos los componentes
- Imports explícitos de Ionic (`@ionic/angular/standalone`)
- Sin NgModules

### 4. APP_INITIALIZER tolerante a fallos

`AuthFacade.init()` y `CountingFacade.init()` se ejecutan en `APP_INITIALIZER` pero están envueltas en `safeInit()` que captura errores y permite que la app arranque igual.

## Consecencias

**Positivas:**
- Estado reactivo sin boilerplate de observables
- Fácil de testear: use cases son funciones puras inyectables
- Persistencia offline transparente para el usuario

**Negativas:**
- Curves de aprendizaje para desarrolladores nuevos en signals
- SQLite requiere plugin nativo (Capsitor); testing en browser necesita mocks

## Notas

- Backend реальный (SOAP) aún no integrado; sync es mock local
- La sesión de auth es un flag booleano persisted, no JWT
