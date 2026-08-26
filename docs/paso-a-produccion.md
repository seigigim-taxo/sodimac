# Qué falta para pasar la APK a producción

Estado al 26/08/2026, rama `feat/ajustes/operador` (27 commits sobre `main`).

Este documento lista **lo que falta**, no lo que está hecho. Cada punto dice de
quién depende, porque varios no son nuestros.

---

## 1. Bloqueantes de nuestro lado

### 1.1 Crear el keystore de release — **sin esto no hay APK instalable**

La configuración de firma ya está en `android/app/build.gradle`, pero lee de
`android/keystore.properties`, que todavía no existe. Sin ese archivo el release
se compila **sin firmar**, y una APK sin firmar no se instala.

```bash
keytool -genkeypair -v -keystore sodimac-release.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias sodimac
```

Después copiar `android/keystore.properties.example` a
`android/keystore.properties` y completarlo. Ambos archivos están en
`.gitignore`.

> **La llave no tiene reemplazo.** Android exige que la firma coincida para
> actualizar una app instalada. Si se pierde, ninguna PDA se puede volver a
> actualizar: habría que desinstalar en cada equipo, y eso borra los conteos que
> no se hayan sincronizado. Guardarla fuera del repositorio, con respaldo, y que
> la conozca más de una persona.

**Responsable:** equipo de desarrollo.

### 1.2 Sacar el repositorio de asignación simulado

`main.ts` registra `AsignacionSimuladaRepository` para
`ASIGNACION_API_REPOSITORY_TOKEN`, **también en producción**. Es la única
implementación que existe: no hay una que hable con el web service.

Eso significa que el botón **«Buscar nuevo conteo»** del Home hoy es una
simulación. No consulta al servidor.

Hay que escribir la implementación real. Depende del punto 2.2.

**Responsable:** equipo de desarrollo, bloqueado por backend.

### 1.3 Probar en la PDA

Ninguno de los 27 commits de la rama está verificado en un equipo físico. La
batería automática está en 206 casos y pasa entera, pero eso ya demostró no ser
suficiente: el 26/08 la app quedó sin poder registrar un solo SKU
(`Already in transaction`) con el build limpio y todo en verde.

La pasada mínima está en la sección 5.

**Responsable:** equipo de desarrollo.

---

## 2. Depende del backend

### 2.1 El SP tiene que aceptar el payload nuevo

Cada detalle de `tag-finalizado.php` ahora lleva un arreglo `lecturas[]`:

```json
"lecturas": [
  { "codigo_lectura": "7801234567890", "medio_captura": "ESCANER", "cantidad": 3 },
  { "codigo_lectura": null,            "medio_captura": "MANUAL",  "cantidad": -1 }
]
```

Tres cosas que el SP tiene que tolerar y **no** estaban en lo acordado
originalmente:

- **`cantidad`** por entrada. Rodrigo la había excluido; se agregó porque sin
  ella no se puede saber cuántas unidades entraron por cada vía.
- **`codigo_lectura` nulo**, para los ajustes con los botones `+` / `−`, que
  mueven unidades sin que el operador lea ningún código.
- **`cantidad` negativa o cero.** Quitar unidades agrega un movimiento negativo
  en vez de borrar la captura anterior.

> **Para el informe:** «¿se escaneó este código?» se responde por la **presencia**
> del par `(código, medio)`, **no** por el signo de `cantidad`. Un código
> escaneado y después retractado suma cero y sigue siendo un código escaneado. Si
> el SP filtra por cantidad positiva, va a concluir lo contrario de lo que pasó.

La suma de `lecturas[].cantidad` **sí** da `cantidad_fisica` de la línea, pero
conviene no validarlo del lado del servidor: si alguna vez deja de cuadrar,
preferimos recibir el dato a rechazar la carga entera.

### 2.2 Endpoint de consulta liviana de eventos nuevos

Acordado en la daily del 26/08: el botón «Buscar nuevo conteo» debe hacer primero
un `count` para ver si hay evento del día, y solo entonces descargar todo.

Sin este endpoint, el punto 1.2 no se puede cerrar.

### 2.3 Confirmar los rangos de TAG en el resto de las tiendas

La app ya no pide elegir la zona: la deriva del número de TAG usando
`sod_zona.tag_desde` / `tag_hasta`, que vienen del WS.

Verificado en el respaldo de una PDA del 26/08 — las 5 zonas traen las dos cotas,
contiguas y sin superposición:

| Zona | Desde | Hasta |
|---|---|---|
| ALTILLO | 1000 | 2999 |
| PUNTO_VENTA | 3000 | 4999 |
| BODEGA | 5000 | 5999 |
| EXHIBICION | 6000 | 6999 |
| OTRO | 7000 | 9999 |

Falta confirmar que **todas** las tiendas vengan igual. Los campos admiten nulo,
y en una tienda sin rangos configurados el operador **no puede iniciar ningún
conteo**.

Se puede revisar así, sobre un respaldo:

```sql
SELECT nombre, tag_desde, tag_hasta FROM sod_zona;
```

---

## 3. Depende del cliente

### 3.1 Decimales: ¿truncar o redondear?

Quedó como duda en la daily del 26/08. Carlos pidió «redondear la cantidad», pero
hoy la app **trunca** (`Math.floor`): 2.6 queda en 2, no en 3.

La columna `cantidad_fisica` es `REAL`, así que la base sí admite decimales. Hay
que definir cuál de los dos comportamientos quieren.

### 3.2 Capacidad de al menos 1000 SKUs por ubicación de TAG

Requerimiento del correo de Carlos, sin validar. La lista pagina de a 5, pero los
cálculos recorren el arreglo completo en cada cambio. Con 1000 ítems en una
Meferi hay que **medirlo**, no suponerlo.

---

## 4. Riesgos conocidos, no bloqueantes

### 4.1 Las PDA actuales no se van a actualizar solas

El `applicationId` cambió de `io.ionic.starter` a `cl.taxo.sodimac.inventario`.
La APK nueva **no se instala encima** de la que tienen hoy: entra como una app
distinta, al lado.

**Antes de instalar la nueva en un equipo con datos, hay que sincronizar todo lo
pendiente.** Después se desinstala la vieja.

Es por única vez. De acá en adelante el id no cambia y las actualizaciones son
limpias.

### 4.2 La detección escáner/manual está sin calibrar

El umbral que separa un disparo de pistola de un tecleo humano está en 40 ms,
elegido por teoría. En el respaldo del 26/08 las 32 lecturas quedaron todas como
`MANUAL`, ninguna como `ESCANER` — puede ser que solo se probó tipeando, o que el
umbral no sirve para la Meferi.

En modo desarrollo cada lectura loguea `[DeteccionCaptura]` con el hueco real
medido. Hay que hacer unas decenas de lecturas con la pistola y ajustar.

Los dos tests que fijan el umbral van a fallar si se cambia. Es a propósito: que
mover ese número sea una decisión visible.

### 4.3 `delete()` y `deleteSesion()` no son atómicos

Hacen dos escrituras sin transacción: primero borran las lecturas, después el
detalle. Si la segunda falla, la línea queda sin su historial de capturas y nadie
se entera. La ventana es angosta y no hay evidencia de que haya ocurrido, pero es
el mismo tipo de error que ya se corrigió en `upsert`.

### 4.4 La actualización desde la app todavía no existe

El plan está definido —manifiesto en el servidor, descarga con verificación de
hash, plugin nativo para lanzar el instalador— pero no está construido. Hasta que
esté, las APK se distribuyen a mano.

Ver el documento del plan de actualización.

---

## 5. Pasada de prueba en la PDA

Antes de dar por buena una APK. Cada punto cubre algo que se tocó esta semana.

**Conteo**

1. Ingresar un TAG y que aparezca la zona automática, sin pedir elegirla.
2. Un TAG fuera de todo rango: mensaje claro, no pantalla muerta.
3. Escanear un SKU. *(Valida el arreglo de la transacción anidada.)*
4. Escanear el mismo SKU dos veces: tiene que acumular.
5. Usar `+` y `−` en la fila del producto.
6. Declarar cantidad 0 sobre un SKU ya contado.
7. Modo «por cantidad» con el switch.
8. Una cantidad ≥ 2000: tiene que avisar sin bloquear.
9. Un SKU tipeado en minúscula: se ve en mayúscula mientras se escribe.

**Sincronización**

10. Finalizar TAG y sincronizar. Revisar en el servidor que llegue `lecturas[]`.
11. Con TAGs sin sincronizar, intentar finalizar el conteo del evento: debe
    bloquear.
12. Usar «Sincronizar los N pendientes» y que suban todos.

**Sesión y datos**

13. Dejar la PDA con sesión abierta, cambiarle la fecha al equipo y volver a la
    app: debe avisar de pendientes y cerrar sesión.
14. Volver a entrar: debe forzar la descarga de datos.
15. Instalar una APK nueva sobre una con datos y confirmar que **los conteos
    siguen ahí**. *(Solo aplica una vez que el `applicationId` ya no cambie.)*

---

## Resumen

| # | Qué falta | Depende de |
|---|---|---|
| 1.1 | Crear el keystore de release | Desarrollo |
| 1.2 | Reemplazar el repositorio de asignación simulado | Desarrollo / Backend |
| 1.3 | Probar en la PDA | Desarrollo |
| 2.1 | SP que acepte `lecturas[]` | Backend |
| 2.2 | Endpoint de consulta liviana | Backend |
| 2.3 | Confirmar rangos de TAG en todas las tiendas | Backend |
| 3.1 | Definir truncar vs redondear | Cliente |
| 3.2 | Validar 1000 SKUs por TAG | Desarrollo |

Los puntos **1.1**, **1.2** y **2.1** son los que impiden una entrega a
producción. El resto se puede cerrar en paralelo.
