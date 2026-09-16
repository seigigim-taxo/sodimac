/*
 * Motor aritmético de la calculadora del menú. Puro y sin Angular: solo toma
 * un estado y devuelve el siguiente, para poder testearlo sin DOM ni TestBed.
 *
 * Comportamiento de calculadora de bolsillo estándar:
 *  - Encadena operaciones sin pasar por "=" (2 + 3 + 4 = da 9, no pide "=" en
 *    el medio).
 *  - Cambiar de operador antes de tipear el segundo número reemplaza el
 *    operador pendiente en vez de operar con lo que ya había.
 *  - Dividir por cero es un ESTADO DE ERROR explícito, no Infinity/NaN
 *    filtrándose a la pantalla.
 */

export type Operacion = '+' | '-' | '×' | '÷';

export interface EstadoCalculadora {
  pantalla: string;
  acumulado: number | null;
  operacionPendiente: Operacion | null;
  /* true justo después de elegir un operador o de "=": el próximo dígito empieza un número nuevo. */
  esperandoSiguiente: boolean;
  error: boolean;
}

/* Tope de dígitos en pantalla — una calculadora de bolsillo también lo tiene. */
const MAX_DIGITOS = 12;

export function estadoInicial(): EstadoCalculadora {
  return { pantalla: '0', acumulado: null, operacionPendiente: null, esperandoSiguiente: false, error: false };
}

export function limpiar(): EstadoCalculadora {
  return estadoInicial();
}

export function presionarDigito(estado: EstadoCalculadora, digito: string): EstadoCalculadora {
  if (estado.error) return estado;

  if (estado.esperandoSiguiente) {
    return { ...estado, pantalla: digito, esperandoSiguiente: false };
  }

  if (estado.pantalla === '0') {
    return { ...estado, pantalla: digito };
  }

  if (estado.pantalla.replace('-', '').replace('.', '').length >= MAX_DIGITOS) {
    return estado;
  }

  return { ...estado, pantalla: estado.pantalla + digito };
}

export function presionarPunto(estado: EstadoCalculadora): EstadoCalculadora {
  if (estado.error) return estado;

  if (estado.esperandoSiguiente) {
    return { ...estado, pantalla: '0.', esperandoSiguiente: false };
  }

  if (estado.pantalla.includes('.')) return estado;

  return { ...estado, pantalla: estado.pantalla + '.' };
}

export function presionarOperacion(estado: EstadoCalculadora, operacion: Operacion): EstadoCalculadora {
  if (estado.error) return estado;

  /*
   * Sin número nuevo tipeado desde el último operador o el último "=": el
   * operador nuevo reemplaza al pendiente, no hay nada que aplicar todavía.
   * (Si esperandoSiguiente es true, acumulado ya está definido — lo dejan así
   * presionarOperacion y presionarIgual, las dos únicas formas de llegar acá.)
   */
  if (estado.esperandoSiguiente) {
    return { ...estado, operacionPendiente: operacion };
  }

  const actual = Number(estado.pantalla);

  if (estado.acumulado === null || estado.operacionPendiente === null) {
    return { ...estado, acumulado: actual, operacionPendiente: operacion, esperandoSiguiente: true };
  }

  return resolverPendiente(estado, estado.acumulado, estado.operacionPendiente, operacion);
}

export function presionarIgual(estado: EstadoCalculadora): EstadoCalculadora {
  if (estado.error) return estado;
  if (estado.operacionPendiente === null || estado.acumulado === null) return estado;

  return resolverPendiente(estado, estado.acumulado, estado.operacionPendiente, null);
}

/*
 * Aplica la operación pendiente sobre `acumulado` y la pantalla actual, y
 * arma el estado resultante. Compartido por presionarOperacion (que deja
 * armado el operador siguiente) y presionarIgual (que lo deja en null) —
 * eran casi idénticas salvo por ese único valor.
 */
function resolverPendiente(
  estado: EstadoCalculadora,
  acumulado: number,
  operacionPendiente: Operacion,
  siguienteOperacion: Operacion | null
): EstadoCalculadora {
  const actual = Number(estado.pantalla);
  const resultado = aplicar(acumulado, actual, operacionPendiente);
  if (resultado === null) {
    return { ...estado, pantalla: 'Error', error: true };
  }

  return {
    ...estado,
    pantalla: formatear(resultado),
    acumulado: resultado,
    operacionPendiente: siguienteOperacion,
    esperandoSiguiente: true,
  };
}

/* null significa "no se pudo" (división por cero) — el llamador lo traduce a estado de error. */
function aplicar(a: number, b: number, operacion: Operacion): number | null {
  switch (operacion) {
    case '+': return redondear(a + b);
    case '-': return redondear(a - b);
    case '×': return redondear(a * b);
    case '÷': return b === 0 ? null : redondear(a / b);
  }
}

/*
 * El punto flotante de JS deja basura (0.1 + 0.2 = 0.30000000000000004).
 * Redondear a 10 decimales la limpia sin recortar precisión real.
 */
function redondear(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

function formatear(n: number): string {
  const texto = String(n);
  return /e/i.test(texto) ? sinNotacionCientifica(texto) : texto;
}

/*
 * JS pasa a notación exponencial fuera de [1e-6, 1e21) — un umbral propio del
 * motor, no algo que una calculadora de bolsillo muestre. 1 ÷ 10000000 daba
 * "1e-7" en pantalla en vez de "0.0000001". Se expande la mantisa al punto
 * decimal real que indica el exponente.
 */
function sinNotacionCientifica(texto: string): string {
  const [mantisa, exponenteTexto] = texto.split(/e/i);
  const exponente = Number(exponenteTexto);
  const negativo = mantisa.startsWith('-');
  const mantisaAbs = negativo ? mantisa.slice(1) : mantisa;
  const [parteEntera, parteDecimal = ''] = mantisaAbs.split('.');
  const digitos = parteEntera + parteDecimal;
  const puntoNuevo = parteEntera.length + exponente;

  let resultado: string;
  if (puntoNuevo <= 0) {
    resultado = '0.' + '0'.repeat(-puntoNuevo) + digitos;
  } else if (puntoNuevo >= digitos.length) {
    resultado = digitos + '0'.repeat(puntoNuevo - digitos.length);
  } else {
    resultado = `${digitos.slice(0, puntoNuevo)}.${digitos.slice(puntoNuevo)}`;
  }

  if (resultado.includes('.')) {
    resultado = resultado.replace(/0+$/, '').replace(/\.$/, '');
  }

  return negativo ? `-${resultado}` : resultado;
}
