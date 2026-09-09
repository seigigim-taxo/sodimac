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

## Firmar con linaje (rotación debug → Taxo)

`gradlew assembleRelease` firma **solo** con la llave que declara
`keystore.properties` — hoy la de Taxo. Eso alcanza para un equipo que ya
tiene una APK firmada con Taxo instalada (1.0.4 en adelante). No alcanza para
un equipo que todavía tiene la 1.0.1, firmada con la llave de **debug**: para
esos, Android rechaza la actualización con
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` porque la firma no coincide, aunque el
`applicationId` sea el mismo.

El linaje V3 (`apksigner rotate`) es la prueba criptográfica de que la llave
de debug autorizó la rotación a la de Taxo. Con esa prueba embebida en el
APK, un solo archivo actualiza in-place tanto los equipos en debug como los
que ya están en Taxo.

**Se necesitan las dos llaves**, no solo la de Taxo. Viven en
`C:\Users\seigi.gim\Desktop\LLAVES-FIRMA-SODIMAC\` (ver el `LEEME.txt` de esa
carpeta): `debug.keystore` es la copia de la llave que generó Gradle en la
máquina de Seigi y con la que salió la 1.0.1, alias `androiddebugkey`,
contraseña `android` (la estándar de Android, no es secreta). La de Taxo es
la de siempre, en `android/keystore.properties`.

**Antes de firmar nada, verificar que el equipo de destino realmente esté en
una de esas dos llaves.** Ya pasó que un equipo de prueba tenía instalada una
build firmada con una llave distinta a ambas —ni debug ni Taxo, un keystore
suelto que nadie tenía documentado—, y ningún linaje la iba a cubrir por más
correcto que estuviera. Comprobarlo por ADB antes de asumir nada:

```bash
adb shell pm path cl.taxo.sodimac.inventario
adb pull <ruta que devuelva el comando anterior> instalada.apk
apksigner verify --print-certs instalada.apk
```

Si la huella no es ni `bc4eeb9f...7b61` (debug) ni `f709151d...81722d`
(Taxo), no hay atajo: hay que desinstalar en ese equipo puntual (con pérdida
de lo que no se haya sincronizado) o encontrar esa llave.

### 1. Generar el linaje

Solo hace falta una vez por rotación —no en cada release—, pero como no vive
en el repositorio (es sensible, como el `.jks`), conviene tener el comando a
mano por si se pierde el archivo:

```bash
apksigner rotate \
  --out sodimac.lineage \
  --old-signer --ks "C:\Users\seigi.gim\Desktop\LLAVES-FIRMA-SODIMAC\debug.keystore" \
    --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android \
  --new-signer --ks "<storeFile de keystore.properties>" \
    --ks-pass pass:<storePassword> --ks-key-alias <keyAlias> --key-pass pass:<keyPassword>
```

Se puede releer el linaje ya embebido en cualquier APK que lo lleve (por
ejemplo para confirmar que dos builds tienen exactamente el mismo, como se
hizo para comparar la 1.0.9 contra la 1.0.6):

```bash
apksigner lineage --in sodimac-1.0.6-vc10-lineage.apk --print-certs --verbose
```

### 2. Firmar con el linaje

```bash
apksigner sign \
  --ks "C:\Users\seigi.gim\Desktop\LLAVES-FIRMA-SODIMAC\debug.keystore" \
  --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android \
  --next-signer \
  --ks "<storeFile de keystore.properties>" \
  --ks-pass pass:<storePassword> --ks-key-alias <keyAlias> --key-pass pass:<keyPassword> \
  --lineage sodimac.lineage \
  --v1-signing-enabled false \
  --v2-signing-enabled false \
  --v3-signing-enabled true \
  --min-sdk-version 28 \
  --out sodimac-<versionName>-vc<versionCode>-lineage.apk \
  app/build/outputs/apk/release/app-release.apk
```

Por qué el primer `--ks` es la llave de debug (la vieja) y no la de Taxo: el
`apksigner` de las build-tools actuales (probado en 35.0.0, 36.1.0 y 37.0.0)
exige que la firma cubra **todo** el rango de SDK del `minSdkVersion` del
manifiesto (24 en este proyecto), y con un solo firmante más `--lineage`
rechaza el build (`the provided targeted signer configs do not cover the SDK
range`). Dando las dos llaves con `--next-signer`, `apksigner` reparte el
rango automáticamente: la de debug queda cubriendo API 24-32, la de Taxo
API 33 en adelante — el linaje embebido es el mismo y ambos casos (equipo en
debug, equipo en Taxo) actualizan igual, la partición por SDK solo decide
cuál cert es el "activo" para ese rango.

`--v1-signing-enabled false` y `--v2-signing-enabled false` porque **toda la
flota está en Android 9+** (las Meferi ME40K corren Android 15): no hace
falta firmar para versiones que no existen en terreno, y habilitarlas
obliga a usar la llave vieja también ahí, lo que complica sin necesidad.

Nota histórica: la 1.0.6 quedó firmada con un único firmante V3 sin partir
por rango de SDK —algo que estas build-tools ya no permiten reproducir tal
cual—, pero el linaje que lleva adentro (confirmado con `apksigner lineage
--in`) es exactamente debug → Taxo, el mismo que este procedimiento genera.
La diferencia es de estructura del bloque de firma, no de contenido, y no
afecta qué equipos pueden actualizar.

### 3. Verificar

```bash
apksigner verify --print-certs --verbose sodimac-<versionName>-vc<versionCode>-lineage.apk
```

Tiene que mostrar los dos certificados (debug y Taxo) con sus huellas
oficiales — comparar contra las de este documento. Si solo aparece uno, algo
en el paso 2 se saltó al otro firmante.

### 4. Probar contra equipos reales antes de subir

La prueba automática más confiable es simular ambos orígenes con ADB, sin
arriesgar un equipo real:

```bash
adb uninstall cl.taxo.sodimac.inventario
adb install sodimac-1.0.5-vc9-DEBUGKEY.apk   # simula un equipo con la 1.0.1 de terreno
adb install -r sodimac-<versionName>-vc<versionCode>-lineage.apk
adb shell dumpsys package cl.taxo.sodimac.inventario | grep -E "versionName|signatures"
```

Repetir cambiando `sodimac-1.0.5-vc9-DEBUGKEY.apk` por `sodimac-1.0.5-vc9.apk`
(la firmada solo con Taxo) para cubrir el otro origen. Un `Success` en el
segundo `adb install -r` y `signatures` con `version:3` y `past signatures`
con las dos huellas es la confirmación de que el linaje quedó bien armado —
no alcanza con que `apksigner verify` diga que la APK es válida, porque eso
no prueba que Android vaya a aceptarla como actualización de la que ya está
instalada.
