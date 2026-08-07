# Mock de Sincronización con SGO

## Propósito

Simula la sincronización con el Sistema de Gestión de Operaciones (SGO) para probar la maqueta del reconteo mientras no existe el endpoint real.

## Estructura

```
src/app/
├── domain/sgo/
│   └── repositories/
│       └── sgo-sync.repository.ts          # Interfaz y token de inyección
├── data/sgo/
│   ├── mock/
│   │   └── mock-sgo-sync.repository.ts     # Implementación mock (simulada)
│   └── http-sgo-sync.repository.ts         # Implementación HTTP (endpoint real)
└── application/sgo/
    ├── sincronizar-conteo-con-sgo.use-case.ts
    └── obtener-analisis-reconteo.use-case.ts
```

## Configuración

El mock se activa/desactiva con `environment.mockSgo`:

```typescript
// environment.ts (desarrollo)
export const environment = {
  production: false,
  apiUrl: 'http://50.16.13.230/app/ws/sodimac/api',
  mockSgo: true  // ← Activa el mock
};

// environment.prod.ts (producción)
export const environment = {
  production: true,
  apiUrl: 'http://50.16.13.230/app/ws/sodimac/api',
  mockSgo: false  // ← Usa el endpoint real
};
```

## Uso

### Sincronizar conteo con el SGO

```typescript
import { SincronizarConteoConSgoUseCase } from '../../application/sgo/sincronizar-conteo-con-sgo.use-case';

class MiComponente {
  private sincronizarUC = inject(SincronizarConteoConSgoUseCase);

  async enviarConteo(conteo: ConteoResumen) {
    await this.sincronizarUC.execute(conteo);
  }
}
```

### Obtener análisis de reconteo

```typescript
import { ObtenerAnalisisReconteoUseCase } from '../../application/sgo/obtener-analisis-reconteo.use-case';

class MiComponente {
  private analisisUC = inject(ObtenerAnalisisReconteoUseCase);

  async verificarReconteo(eventoId: number, iteracionActual: number) {
    const resultado = await this.analisisUC.execute(eventoId, iteracionActual);
    
    if (resultado.requiereReconteo) {
      console.log(`Iteración ${resultado.iteracion}: ${resultado.skusARecontar} SKUs a recontar`);
    }
  }
}
```

## Reemplazar mock por endpoint real

Cuando el endpoint del SGO esté disponible:

1. **Implementar los endpoints en el backend:**
   - `POST /sgo/sincronizar-conteo.php` - Recibe datos del conteo
   - `POST /sgo/analisis-reconteo.php` - Devuelve análisis de reconteo

2. **Ajustar `HttpSgoSyncRepository`** si la estructura de respuesta del backend es diferente:

```typescript
// src/app/data/sgo/http-sgo-sync.repository.ts
async sincronizarConteo(eventoId: number, datosConteo: unknown): Promise<SgoSyncResult> {
  const response = await this.api.post<SgoSyncResult>('sgo/sincronizar-conteo.php', {
    eventoId,
    datos: datosConteo,
  });
  
  // Adaptar respuesta del backend si es necesario
  return {
    success: response.status === 'OK',
    mensaje: response.msg,
    datosEnviados: response.data?.registros,
  };
}
```

3. **Cambiar `mockSgo: false`** en `environment.prod.ts` (ya está configurado así).

## Delays simulados

El mock incluye delays para simular latencia de red:

- `sincronizarConteo`: 2 segundos
- `obtenerAnalisisReconteo`: 1.5 segundos

Ajustar en `mock-sgo-sync.repository.ts` si se necesitan valores diferentes.

## Testing

Para tests unitarios, mockear el token:

```typescript
import { SGO_SYNC_REPOSITORY_TOKEN } from '../../domain/sgo/repositories/sgo-sync.repository';

describe('MiTest', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SGO_SYNC_REPOSITORY_TOKEN,
          useValue: {
            sincronizarConteo: jasmine.createSpy().and.resolveTo({ success: true }),
            obtenerAnalisisReconteo: jasmine.createSpy().and.resolveTo({ requiereReconteo: true }),
          },
        },
      ],
    });
  });
});
```

## Notas

- El mock está aislado y no afecta la lógica de negocio
- Cambiar entre mock y real es solo cuestión de configuración
- La interfaz `SgoSyncRepository` garantiza compatibilidad entre implementaciones
- Los use cases son agnósticos a la implementación (mock o HTTP)
