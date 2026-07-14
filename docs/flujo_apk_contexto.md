# Flujo de la app de inventario (PDA) — contexto técnico

Este documento describe el flujo funcional de la app móvil usada por el
Operador de Inventario para ejecutar el conteo en tienda. Está pensado
como contexto para modelos de IA (por ejemplo, para generar código,
diseñar arquitectura o validar reglas de negocio).

## Nota sobre integración con backend

La comunicación con el backend se implementa mediante **SOAP**. Las
operaciones funcionales descritas a continuación se mapean a métodos SOAP
correspondientes. Durante el desarrollo y las pruebas se usa el modo mock
(`environment.useMockSoap: true`), que simula las respuestas SOAP sin
realizar llamadas de red.

| Recurso funcional | Método SOAP (ejemplo) |
|-------------------|-----------------------|
| Login | `Login` |
| Tienda asignada | `ObtenerTiendaAsignada` |
| Eventos asignados | `ObtenerEventosAsignados` |
| Descarga de muestra | `DescargarMuestra` |
| Zonas asignadas | `ObtenerZonasAsignadas` |
| Registro de sincronización | `RegistrarSincronizacion` |
| Carga de conteos | `CargarConteos` |

## 1. Autenticación

- Al iniciar la app, se verifica si el usuario ya tiene una sesión activa
  (flag local).
- Si **no está autenticado**: se muestra la pantalla de login, donde el
  usuario ingresa RUT y contraseña. Esto dispara una llamada de login
  (SOAP).
  - Si la respuesta es un error, se vuelve a mostrar el formulario de
    login para reintentar.
  - Si la respuesta es **200 OK**, se marca la sesión como activa.
- Si **ya está autenticado**, se salta directo a marcar la sesión activa.
- **No se usa token ni refresh token.** La sesión se maneja como un flag
  local de "autenticado", sin un identificador de sesión persistente
  emitido por el backend.

### Por qué no hay token (diseño offline-first)

La app está diseñada para conectarse a internet **solo en dos momentos**:

1. **Al inicio**, para autenticar y descargar los datos necesarios para
   trabajar (muestra, zonas asignadas).
2. **Al cierre**, para subir el trabajo realizado (conteos) mediante la
   sincronización.

Entre esos dos momentos, la app **trabaja completamente offline** — no
hay llamadas intermedias al backend que requieran validar una sesión
activa. Por eso no es necesario un token: no existe ningún request de
por medio que el servidor deba autenticar mientras el operador cuenta
productos. La única responsabilidad del login es confirmar que las
credenciales son válidas (200 OK) antes de permitir el uso offline de
la app.

**Implicancia para la arquitectura:** el estado de "autenticado" es
puramente local (en el dispositivo) y solo tiene efecto hasta el
próximo login o cierre de sesión manual. No hay expiración de sesión
por token, así que cualquier lógica de "cerrar sesión" o "forzar
reautenticación" debe implementarse como una decisión de producto (por
ejemplo, expirar el flag localmente tras N días), no como una
consecuencia técnica de un token venciendo.

## 2. Tienda asignada

- La tienda **no se selecciona**: llega asignada al usuario y la app
  solo la muestra.

## 3. Selección de evento

- Se evalúa si el usuario tiene **más de un evento de inventario
  asignado**.
  - Si tiene **un único evento**, se muestra directo, sin selección.
  - Si tiene **más de un evento**, la app muestra el listado de eventos
    asignados y el usuario debe seleccionar uno.

## 4. Descarga de la muestra (sincronización inicial)

- Se verifica si la muestra del evento seleccionado ya está descargada
  localmente en el dispositivo.
  - Si **no está descargada**: se ejecuta el método SOAP
    `DescargarMuestra(evento_id)`, se guarda localmente, y se registra la
    sincronización con `RegistrarSincronizacion` (tipo `DESCARGA_A_PDA`).
  - Si **ya está descargada**, se continúa sin volver a pedirla.

## 5. Zonas del operador

- Se listan las zonas asignadas al operador mediante el método SOAP
  `ObtenerZonasAsignadas`, y se muestran en pantalla.

## 6. Escaneo de TAG

- Antes de elegir una zona, el operador debe **escanear un TAG físico**.
- Este escaneo **genera una sesión de escaneo**, bajo la cual quedarán
  agrupados los conteos que se registren a continuación.
- **Importante:** el TAG escaneado **no está vinculado ni restringe**
  la zona que se seleccione después — son dos pasos independientes.

## 7. Selección de zona

- Tras escanear el TAG, el operador selecciona libremente una zona del
  listado de zonas asignadas (paso 5). No hay filtrado ni preselección
  automática basada en el TAG.

## 8. Conteo de productos

Este es el ciclo repetible del conteo, y **aplica igual para cualquier
zona** (no hay un caso especial para altillos ni ningún otro tipo de
zona):

1. **Escanear SKU o ingresar manualmente** el código del producto.
2. **Ingresar la cantidad física** contada.
3. **Confirmar la ubicación** del producto.
4. **Guardar el conteo localmente** (persistencia offline en el
   dispositivo, antes de sincronizar).
5. Se pregunta si hay **más productos** por contar en la zona:
   - Si **sí**, se vuelve al paso de escaneo de SKU (loop).
   - Si **no**, se pasa al cierre.

## 9. Cierre y sincronización de salida

- Se ejecuta `CargarConteos` con los conteos guardados localmente.
- Se registra la sincronización de salida con
  `RegistrarSincronizacion` (tipo `CARGA_DESDE_PDA`).
- Fin del flujo de conteo.

---

## Notas para el modelo de IA

- **Todos los conteos generados en una sesión de escaneo (TAG) pueden
  corresponder a distintas zonas**, ya que el TAG y la zona son
  selecciones independientes.
- **No existe distinción funcional entre tipos de zona** (venta,
  altillo, bodega, etc.) al momento de contar: el flujo de captura
  (escanear/ingresar SKU → cantidad → confirmar ubicación → guardar) es
  siempre el mismo.
- El flujo está diseñado **offline-first**: el conteo se guarda
  localmente en cada iteración del loop, y la sincronización hacia el
  backend ocurre en dos momentos puntuales: (1) al inicio, para
  autenticar y descargar la muestra, y (2) al cierre, para subir los
  conteos. Esto es lo que justifica no usar token/refresh token: no hay
  llamadas intermedias al backend que requieran validar sesión.
- Los eventos de sincronización (`DESCARGA_A_PDA` y `CARGA_DESDE_PDA`)
  son explícitos y quedan registrados como llamadas propias al método SOAP
  `RegistrarSincronizacion`, separadas de la operación de datos en sí
  (`DescargarMuestra`, `CargarConteos`).
- **Pendiente de definir** (no resuelto en este flujo): si la tienda
  asignada también podría tener más de una opción para el usuario,
  similar a la lógica ya aplicada a los eventos.
