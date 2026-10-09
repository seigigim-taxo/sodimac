# Laboratorio de envíos

Sirve para probar, **sin tocar producción**, qué hace la app cuando un envío de TAG falla de
formas difíciles de reproducir en terreno. El caso que lo motivó: el servidor recibe y guarda
el TAG, pero la respuesta nunca vuelve a la PDA (el TAG 7001).

## Piezas

| Pieza | Qué es |
|---|---|
| Servidor de prueba | `tag-finalizado.php` y `estado-cargas.php` reales del repo `sodimac-ws`, con un MySQL desechable. |
| `proxy-lab.mjs` | Proxy delante de ese servidor. Estropea la conexión a pedido (ver modos). |
| App de laboratorio | Build `lab` (`environment.lab.ts`): apunta a `http://localhost:8081/api`. |

## A dónde va cada cosa

- `tag-finalizado*.php` y `estado-cargas*.php` → servidor de prueba. **Un envío de laboratorio nunca llega al servidor real.**
- Ingreso, preparación y lo demás → servidor real, de solo lectura. La PDA trae la muestra verdadera del operador. El ingreso lo escribe quien prueba.
- `actualizaciones/*` → 404, para que la app no ofrezca reemplazarse.

## Levantarlo

1. MySQL desechable en el puerto 3399, con la base `sodimac_prueba` (esquema DEDUCIDO del código, no es el DDL real).
2. `php -S 127.0.0.1:8099 -t <repo sodimac-ws>` con la configuración de base apuntando a ese MySQL.
3. `node tools/lab/proxy-lab.mjs` (escucha en `:8081`).
4. Para la PDA: `adb reverse tcp:8081 tcp:8081`, y un APK de la configuración `lab`:

```bash
npx ng build --configuration=lab
npx cap sync android
cd android && ./gradlew.bat assembleDebug
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

> Instalar ese APK **reemplaza** la app instalada (mismo identificador). Con firmas distintas
> Android pide desinstalar primero, y eso borra los datos locales de la PDA.

## Modos del proxy

Se cambian con `POST /__lab/modo/<modo>` (`GET /__lab/log` muestra lo que pasó).

| Modo | Efecto |
|---|---|
| `normal` | Todo pasa. |
| `perder-respuesta` | El servidor guarda el TAG y la respuesta se corta. Las consultas de estado siguen funcionando. |
| `perder-respuesta-una` | Igual, solo la primera vez. |
| `perder-respuesta-y-caer` | El servidor guarda, la respuesta se corta y la conexión queda caída: ni siquiera se puede preguntar después. Es el caso en que la PDA no puede enterarse sola. |
| `cortar-antes` | El pedido no llega al servidor. |
| `rechazar` | Responde 503 sin tocar el servidor. |
| `lento-<ms>` | Responde con demora (más de 30000 hace vencer la app). |
| `caido` | Corta todo, también las consultas. |

## Pruebas

- Servidor + proxy: `python tools/lab/probar-respuesta-perdida.py`
- App real (casos de uso reales, SQLite en memoria, red real hacia el proxy):
  `npx ng test --configuration=ci --include='src/app/lab/*.lab.ts'`.
  No corre con `npm run test:ci`, y se salta sola si el laboratorio no está arriba.
  Redirige `ApiService` al proxy y **aborta si no lo logró**: por defecto apunta a producción.

## Cosas que enseñó el laboratorio

- Chrome y el WebView de Android **reintentan solos un POST** cuando una conexión reutilizada
  se corta. El proxy cierra cada conexión para que el registro muestre lo que la app mandó de
  verdad. El servidor tolera el duplicado porque el identificador es el mismo.
- Un envío que se corta no se da por "no llegó" salvo que el sistema sepa que no hay red:
  la solicitud pudo haber llegado.
