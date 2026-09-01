# Archivos del servidor para la autoactualización

Lo que hay que subir a `50.16.13.230` para que las PDA puedan actualizarse
solas. Vive en este repositorio y no en el del web service a propósito: el
contenido cambia con **cada release de la app**, así que tiene que moverse
junto con el APK que describe, no por su cuenta.

## Dónde va cada cosa

Rutas absolutas en el servidor. `/var/www/html/` es la raíz web, o sea que
`/var/www/html/app/...` se sirve como `http://50.16.13.230/app/...`.

```
server/api/actualizaciones/version.json
  → /var/www/html/app/ws/sodimac/api/actualizaciones/version.json

server/api/actualizaciones/version_test.json
  → /var/www/html/app/ws/sodimac/api/actualizaciones/version_test.json

app/build/outputs/apk/release/app-release.apk
  → /var/www/html/app/ws/sodimac/apk/sodimac-<version>.apk
```

Las dos carpetas hay que crearlas: hoy sólo existen `api/auth` y
`api/sincronizaciones`.

Permisos: `755` en las carpetas y `644` en los archivos. Se suben como
`ec2-user`, pero quien los sirve es Apache con otro usuario — si el archivo
queda en `600`, la PDA recibe un 403 y el error no dice por qué.

## Dos manifiestos: producción y prueba

`version.json` es el que leen las PDAs en terreno. `version_test.json` lo lee
sólo la build de desarrollo (`environment.ts`).

Existen separados porque desarrollo y producción comparten `apiUrl`. Mientras
los dos leían el mismo archivo, no había forma de probar la oferta de
actualización sin ofrecérsela también a las PDAs reales: subir un
`version_code` de prueba se lo mostraba a todo el mundo.

Para probar la franja de actualización se toca `version_test.json` y nada más.
`version.json` no se mueve, y los operadores no ven nada.

Si `version_test.json` no existe, la consulta falla y la app de desarrollo
simplemente no ofrece nada. No se rompe.

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
| `notas` | **No se muestra en la app.** Es para quien mantiene este archivo: sirve para saber qué APK es cada una. Se probó mostrárselo al operador y sale en lenguaje de desarrollo —"UID por producto"—, que no le dice nada y le tapa lo único que necesita leer: que no pierde su trabajo. |

## Al publicar una versión nueva

1. Subir `versionCode` y `versionName` en `android/app/build.gradle`, y
   `APP_VERSION` en `src/app/core/version.ts` — son tres lugares que se
   desincronizan solos. Ya pasó tras un merge: gradle en 1.0.1 y version.ts en
   1.0.3.

   El `versionCode` tiene que ser **estrictamente mayor** al instalado, aunque
   el `versionName` se repita. Android compara el código, no el nombre: dos
   APK distintas con el mismo código no se pueden actualizar entre sí.

2. `npm run build && npx cap sync android && cd android && ./gradlew assembleRelease`

   Revisar el diff de `AndroidManifest.xml` antes de seguir: `cap sync` lo
   reescribe y ya borró `REQUEST_INSTALL_PACKAGES` una vez. Sin ese permiso la
   autoactualización deja de funcionar y no hay ningún error que lo delate.

3. Verificar la firma **contra la huella oficial** (ver abajo). No es opcional:
   sin `keystore.properties`, Gradle compila igual y la APK sale sin firmar
   **en silencio**.
   `apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk`

4. Renombrar a `sodimac-<versionName>-vc<versionCode>.apk` y sacarle el hash.

   El `versionCode` va en el nombre a propósito: circularon dos APK distintas
   llamadas `sodimac-1.0.2.apk`, y sin el código no hay forma de saber cuál
   tiene instalada un equipo.

   `sha256sum` en Git Bash antepone una barra al hash. Conviene:
   `python -c "import hashlib;print(hashlib.sha256(open(r'RUTA','rb').read()).hexdigest())"`

5. Subir el APK a `/var/www/html/app/ws/sodimac/apk/`, con **exactamente** el
   nombre que va a declarar el manifiesto.

   En WinSCP: modo **Binario** —en modo Texto se corrompe el APK y el hash no
   coincide—, permisos **0644** —en 600 Apache devuelve 403— y subida a archivo
   temporal activada, para que una transferencia cortada no quede servida bajo
   el nombre real.

6. Recién ahí actualizar `version.json`. **En ese orden**: si el manifiesto
   apunta a un archivo que todavía no está, las PDA que consulten en el medio
   fallan la descarga.

7. **Verificar lo publicado, no lo local.** Es el paso que se saltea y el que
   atrapa los errores que los anteriores no ven — un nombre mal escrito, una
   subida a medias, permisos que devuelven 403:

   ```bash
   curl -s http://50.16.13.230/app/ws/sodimac/api/actualizaciones/version.json
   curl -s -o bajada.apk http://50.16.13.230/app/ws/sodimac/apk/<nombre>.apk
   ```

   El hash de `bajada.apk` tiene que ser igual al del manifiesto. Si no
   coincide —o si el APK pesa 196 bytes, que es el tamaño de la página de error
   404— la actualización está rota aunque los archivos "se hayan subido bien".

   Este paso existe porque ya pasó: el manifiesto quedó apuntando a
   `sodimac-1.0.2-vc6.apk` y el archivo se subió como `sodimac-1.0.2.apk`. Todo
   parecía correcto y la app habría reportado "la descarga falló", que apunta a
   la red y no al nombre del archivo.

## La llave de firma

Android exige que la firma coincida para actualizar una app instalada. Dos
llaves distintas producen **dos apps incompatibles con el mismo nombre**: un
equipo firmado con una no puede recibir la otra, hay que desinstalar, y eso
borra los conteos que no se hayan sincronizado.

Ya pasó una vez en desarrollo — se firmó desde dos máquinas con llaves
distintas —, y por eso esta huella está escrita acá.

**Huella oficial del certificado:**

```
SHA-256: f709151ddec5b2c02f2f405b55cf3d407f34886e1b85f7eb0ebd5c4dd381722d
DN:      CN=Taxo, OU=Desarrollo, O=Taxo, L=Santiago, ST=Metropolitana, C=CL
```

No es un secreto: es la identidad pública de la llave. El secreto es el `.jks`
y su contraseña, que viven fuera del repositorio.

Después de cada `assembleRelease`, la salida de `apksigner verify
--print-certs` tiene que mostrar ESA huella. **Si muestra otra, esa APK no se
sube**: se instalaría bien y recién fallaría al intentar actualizarla, cuando
los equipos ya están en terreno.

La causa de raíz de que esto pueda pasar es que `keystore.properties` está en
`.gitignore` —correctamente—, así que cada máquina firma con lo que tenga y
nada avisa. Comparar contra esta huella es lo único que lo detecta a tiempo.
