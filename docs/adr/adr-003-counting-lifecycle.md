# ADR-003: Ciclo de vida de sesiones de conteo

**Fecha:** 2026-07-15
**Estado:** Aceptado

## Context

Cada sesión de conteo passa por multiple estados con reglas de negocio específicas. Es necesario documentar el ciclo de vida para que developers y testers tengan claridad sobre qué acciones están permitidas en cada estado.

## Estados

```
[in-progress] --> [finalized] --> [synced]
     ^                |
     |                v
     +------- [reopened] --------+
```

### 1. `in-progress`

**Descripción:** Sesión recién creada, el usuario está contando SKUs.

**Permitido:**
- Agregar/editar/eliminar items
- Editar tag y zona
- Guardar (persist automático en cada scan)
- Finalizar
- Eliminar

**Bloqueado:**
- Sincronizar (use case lanza `Error`)
- Reabrir (ya está abierta)

### 2. `finalized`

**Descripción:** El usuario confirmó la finalización. No se pueden agregar más SKUs.

**Permitido:**
- Ver detalle
- Editar metadata (tag/zona) — si `edited = false`
- Reabrir (vuelve a `in-progress`, marca `edited = true`)
- Sincronizar
- Eliminar

**Bloqueado:**
- Editar si `synced = true` (use case lanza `Error`)
- Agregar items (el counting page redirige a detail)

### 3. `synced`

**Descripción:** Sesión enviada al servidor. Solo lectura.

**Permitido:**
- Ver detalle
- Eliminar (¿? — por confirmar con negocio; actualmente permitido en UI)

**Bloqueado:**
- Reabrir (use case lanza `Error`)
- Editar metadata (use case lanza `Error`)
- Sincronizar de nuevo
- Eliminar items

### 4. `reopened` (sub-estado de `finalized`)

**Descripción:** Sesión была finalized y el usuario la reopenió. La sesión vuelve a `in-progress` pero mantiene `edited = true`.

**Efecto:** `edited = true` en DB. UI muestra badge "Editado".

**Regla:** Una sesión solo puede reabrirse una vez? (Por definir — actualmente no hay guard técnico contra múltiples re-openings.)

## Bouncer Functions (Use Cases)

| Use Case | Valida | Lanza error si |
|----------|--------|----------------|
| `CreateCountingSessionUseCase` | — | — |
| `SaveCountingSessionUseCase` | Session existe | `Error('Session not found')` |
| `FinalizeCountingSessionUseCase` | Items > 0, status = in-progress | `Error('No items')`, `Error('Already finalized')` |
| `ReopenCountingSessionUseCase` | Status = finalized, synced = false | `Error('Cannot reopen synced session')` |
| `UpdateCountingMetadataUseCase` | Synced = false | `Error('Cannot edit synced session')` |
| `SyncCountingSessionUseCase` | Status = finalized, synced = false | `Error('Already synced')` |
| `DeleteCountingSessionUseCase` | Session existe | `Error('Session not found')` |

## Flags en DB

- `status`: `'in-progress' | 'finalized'`
- `edited`: `0 | 1` — indica si la sesión fue reopenida después de finalize
- `synced`: `0 | 1` — indica si foi sincronizada com o servidor

## UI Rules

| Situación | Editar | Reabrir | Sync | Eliminar |
|-----------|--------|---------|------|----------|
| in-progress | ✅ | ❌ | ❌ | ✅ |
| finalized | ✅ | ✅ | ✅ | ✅ |
| finalized + edited | ✅ | ✅ | ✅ | ✅ |
| synced | ❌ | ❌ | ❌ | ❌ |

## Notas

- No hay protección contra editar una sesión `finalized` que aún no ha sido sincronizada (más de una vez) — `edited` se setea en true en la primera reedición y no cambia
- El badge "Editado" en la UI indica que la sesión fue reopenida, no que fue editada post-finalize
- `edited` flag podría renombrarse a `reopened` para mayor claridad
