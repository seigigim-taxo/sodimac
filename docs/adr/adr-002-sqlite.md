# ADR-002: Persistencia offline con SQLite

**Fecha:** 2026-07-15
**Estado:** Aceptado

## Contexto

La app Sodimac PDA funciona en entornos sin conectividad permanente (centros de distribución). Se necesita persistencia local robusta que sobreviva al cierre de la app y que permita sincronizar cuando haya conexión.

## Decisión

Usar `@capacitor-community/sqlite` como motor de persistencia local.

### Implementación

- `CountingStorageService` es el único punto de acceso a SQLite
- Patrón Singleton: una sola instancia de `SQLiteConnection` compartida
- `checkConnectionsConsistency()` se llama en `init()` para verificar estado de conexiones
- Si `init()` falla, la app muestra error pero no crashea (gracias a `safeInit()` en `APP_INITIALIZER`)
- Flag `initialized` previene re-inicialización accidental

### Schema

Tabla `counting_sessions`:
```sql
CREATE TABLE IF NOT EXISTS counting_sessions (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL,
  zone TEXT NOT NULL,
  status TEXT NOT NULL,
  edited INTEGER DEFAULT 0,
  synced INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  items TEXT NOT NULL  -- JSON stringified array
);
```

## Consecencias

**Positivas:**
- Offline-first: el usuario puede contar sin red
- Datos survive al cierre de la app
- Una sola fuente de verdad para sesiones

**Negativas:**
- Plugin nativo: requiere testing con mocks en browser
- Sin conflict resolution (último写入 gana)
- SQLite no es colaborativo: si se-edita en otro dispositivo antes de sync, se pierde

## Conflictos

No hay resolution strategy implementada. Para Beta, se asume un seul appareil par utilisateur.

## Notas

- `environment.useMockSoap` flag pendiente de implementar para poder togglear entre mock y real SOAP client
- La sincronización es un write local + marca `synced=1`; no hay API de sync real todavía
