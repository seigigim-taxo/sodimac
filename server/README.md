# Archivos del servidor para la autoactualización

Lo que hay que subir a `50.16.13.230` para que las PDA puedan actualizarse
solas. Vive en este repositorio y no en el del web service a propósito: el
contenido cambia con **cada release de la app**, así que tiene que moverse
junto con el APK que describe, no por su cuenta.

## Dónde va cada cosa

```
server/api/app/version.json   →   /app/ws/sodimac/api/app/version.json
(el APK compilado)            →   /app/ws/sodimac/apk/sodimac-<version>.apk
```

El `version.json` **tiene que quedar colgando de `api/`**. Ahí el `.htaccess`
del web service ya pone los headers de CORS, y Apache los aplica también a los
archivos estáticos. Fuera de esa carpeta, el WebView de Android rechaza la
respuesta.

Por el mismo motivo, si algún día esto pasa a ser un PHP: que **no** setee
headers de CORS por su cuenta. Duplicados —uno de Apache y otro del PHP— el
WebView los rechaza. Ya nos costó tiempo una vez.

## Por qué un JSON y no un PHP

Porque no hay nada que calcular. Un archivo estático no tiene base de datos que
se caiga ni lógica que se rompa, y se edita a mano en los diez segundos que
toma subir un APK. Si más adelante se quiere servir por versión de PDA o por
tienda, se reemplaza por un PHP con la misma forma de respuesta y la app no se
entera.

## La carpeta del APK

No necesita CORS. La descarga la hace Capacitor de forma nativa, fuera del
WebView, así que las reglas de origen no aplican.

Lo que sí hace falta es que Apache no bloquee la extensión. Si la bloquea, el
MIME es `application/vnd.android.package-archive`.

## Qué significa cada campo

| Campo | Para qué |
|---|---|
| `version_code` | **Lo único que decide si hay que actualizar.** Es el entero que Android compara internamente; la app lee el suyo con `App.getInfo()` y ofrece actualizar si el del servidor es mayor. |
| `version_name` | Solo para mostrarle al operador. No sirve para comparar: `"1.10.0"` es menor que `"1.9.0"` en orden alfabético. |
| `url` | De dónde bajar el APK. Absoluta, porque la descarga nativa no resuelve rutas relativas. |
| `sha256` | Se verifica antes de instalar. Sin esto, una descarga cortada por mala señal le llega al instalador de Android como archivo corrupto y el operador ve un error sin contexto. |
| `obligatoria` | Si es `true`, la app no deja seguir contando hasta actualizar. |
| `notas` | Se le muestra al operador como "qué trae esta versión". |

## Al publicar una versión nueva

1. Subir `versionCode` y `versionName` en `android/app/build.gradle`, y
   `APP_VERSION` en `src/app/core/version.ts` — hoy son tres lugares que se
   pueden desincronizar.
2. `npm run build && npx cap sync android && cd android && ./gradlew assembleRelease`
3. Verificar que quedó firmada, que si falta `keystore.properties` sale sin
   firmar **en silencio**:
   `apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk`
4. Renombrar a `sodimac-<version>.apk` y sacarle el hash: `sha256sum`
5. Subir el APK a `/app/ws/sodimac/apk/`
6. Recién ahí actualizar `version.json`. **En ese orden**: si el manifiesto
   apunta a un archivo que todavía no está, las PDA que consulten en el medio
   fallan la descarga.
