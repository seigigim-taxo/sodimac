# ADR-004: Escrituras a SQLite serializadas

**Fecha:** 2026-10-20
**Estado:** Aceptado

## Contexto

`@capacitor-community/sqlite` comparte UNA conexión y tiene dos reglas que, juntas, producen una carrera:

1. `run`, `execute` y `executeSet` abren una transacción propia por defecto (`transaction = true`).
2. Cada una termina con `finally { if (_db.inTransaction()) rollbackTransaction(); }` (`Database.java`). Si su `begin` falla porque YA había una transacción abierta —la de otra operación—, ese `finally` ve la ajena y la REVIERTE.

En terreno, mientras la descarga inicial guardaba la muestra dentro de su transacción, una escritura cualquiera (la cola de reportes, marcar un envío) la deshacía. La descarga seguía escribiendo sobre lo que quedaba y fallaba de tres maneras distintas, según el momento del cruce:

- `Run: FOREIGN KEY constraint failed (code 787)`
- `CommitTransaction: Cannot perform this operation because there is no current transaction.`
- `No se pudo resolver producto para SKU …`

Afectó a operadores de varias tiendas, sobre todo con muestras grandes (hasta 20.336 productos), porque el guardado dura más y la ventana de choque crece.

## Decisión

Ninguna escritura corre mientras otra está en curso, y una transacción ocupa el turno entero.

- `ExclusionDeEscrituras` (`core/database/exclusion-de-escrituras.ts`): cola de un turno a la vez por base. Que una operación falle no frena a las siguientes.
- `SqliteConnectionService.getConnection()` entrega la conexión **serializada**: sus `run`, `execute` y `executeSet` esperan turno, y las lecturas (`query`) pasan directo (la base está en WAL).
- Un `run` sin tercer argumento pasa a `transaction = false`: es un statement suelto y SQLite ya lo ejecuta de forma atómica. `execute` y `executeSet` conservan su default, porque un script de varias sentencias sí depende de él.
- `enTransaccion()` toma el turno completo. Su callback recibe una conexión **sin cola y sin transacciones propias por defecto**, así que olvidar el `false` ya no revierte la transacción en curso.
- Si algo espera más de 15 s por su turno, se avisa en el log con el comienzo de su SQL y qué tiene el turno.

### Regla para quien escriba un callback de `enTransaccion`

Usa SOLO la conexión que recibe. Pedir una escritura por `getConnection()` desde adentro es esperar el turno que la propia transacción tiene tomado: se cuelga.

## Alternativas descartadas

- **Solo pasar `transaction = false` a todos los `run` sueltos.** La escritura ajena se ejecuta entonces DENTRO de la transacción de otro: si esa transacción se revierte, se pierde también (por ejemplo, el `marcarEnviado` de un TAG).
- **Un mutex solo en `enTransaccion()`.** No cubre a quien escribe sin pasar por ahí, que es justo el escritor ajeno.
- **Una transacción por escritura, sin cola.** Es el comportamiento que causa el problema.

## Consecuencias

**Positivas:**
- La descarga inicial ya no puede ser revertida por una escritura ajena.
- Las escrituras que llegan durante una transacción esperan y se aplican después, tanto si la transacción termina bien como si falla.
- Los `run` sueltos son más baratos: ya no abren y cierran una transacción cada uno.

**Negativas / a tener presente:**
- Mientras dura una transacción larga (hasta ~28 s al guardar una muestra de 20 mil productos) las demás escrituras esperan.
- El respaldo de la base (`exportarSql`) usa una transacción de lectura y también ocupa el turno: bloquea las escrituras mientras dura.
- Una escritura pedida por la conexión normal desde dentro de un callback se cuelga; el aviso de 15 s ayuda a detectarlo.

## Cómo se verificó

- El doble de pruebas (`src/testing/sqlite-en-memoria.ts`) reproduce la regla del plugin, incluido el `finally` que revierte la transacción ajena. Con él, los tests reproducen los tres errores sin la cola y pasan con ella.
- Guardado de una muestra grande con una escritura ajena en cinco momentos distintos: termina completo en todos. El control sin cola falla.
- En una PDA real (Meferi ME40K), con el mismo operador y la misma muestra de producción:
  - la 1.0.15 publicada falló al primer intento con `No se pudo resolver producto para SKU …`;
  - la versión con esta decisión entró a la primera en 2 de 2 intentos, con 20.336 detalles, 20.336 productos y 69.232 códigos íntegros, sin claves foráneas rotas, y se vio una escritura ajena esperando su turno en vez de revertir la descarga.
- La muestra es chica y la carrera es intermitente: esto no prueba que nunca vuelva a fallar. Se confirma mirando en terreno que no lleguen reportes `Descarga inicial (GUARDANDO)`.
