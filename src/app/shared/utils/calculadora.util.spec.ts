import {
  estadoInicial, limpiar, presionarDigito, presionarPunto, presionarOperacion, presionarIgual,
  EstadoCalculadora,
} from './calculadora.util';

/* Encadena teclas sobre el estado inicial para no repetir el armado en cada test. */
function tipear(...teclas: string[]): EstadoCalculadora {
  let estado = estadoInicial();
  for (const tecla of teclas) {
    if (tecla === '.') estado = presionarPunto(estado);
    else if (tecla === '=') estado = presionarIgual(estado);
    else if (['+', '-', '×', '÷'].includes(tecla)) estado = presionarOperacion(estado, tecla as never);
    else estado = presionarDigito(estado, tecla);
  }
  return estado;
}

describe('calculadora.util', () => {
  it('arranca en 0', () => {
    expect(estadoInicial().pantalla).toBe('0');
  });

  it('escribe un número dígito a dígito', () => {
    expect(tipear('1', '2', '3').pantalla).toBe('123');
  });

  it('el primer dígito reemplaza el 0 inicial, no se le pega al lado', () => {
    expect(tipear('5').pantalla).toBe('5');
  });

  it('el punto no se duplica', () => {
    expect(tipear('1', '.', '.', '5').pantalla).toBe('1.5');
  });

  describe('las 4 operaciones básicas', () => {
    it('suma', () => {
      expect(tipear('2', '+', '3', '=').pantalla).toBe('5');
    });

    it('resta', () => {
      expect(tipear('9', '-', '4', '=').pantalla).toBe('5');
    });

    it('multiplica', () => {
      expect(tipear('6', '×', '7', '=').pantalla).toBe('42');
    });

    it('divide', () => {
      expect(tipear('8', '÷', '2', '=').pantalla).toBe('4');
    });
  });

  it('encadena operaciones sin pasar por "="', () => {
    expect(tipear('2', '+', '3', '+', '4', '=').pantalla).toBe('9');
  });

  it('cambiar de operador antes del segundo número reemplaza el operador, no opera', () => {
    // 5 [+] [×] 2 [=] tiene que dar 10 (5×2), no comportarse como si hubiera sumado algo.
    expect(tipear('5', '+', '×', '2', '=').pantalla).toBe('10');
  });

  it('"=" repetido sin nada pendiente no rompe nada', () => {
    const estado = tipear('7', '=');
    expect(presionarIgual(estado).pantalla).toBe('7');
  });

  it('sigue operando sobre el resultado después de "="', () => {
    // 2+3=5, después +4= tiene que dar 9.
    expect(tipear('2', '+', '3', '=', '+', '4', '=').pantalla).toBe('9');
  });

  it('dividir por cero da un estado de error, no Infinity ni NaN', () => {
    const estado = tipear('5', '÷', '0', '=');
    expect(estado.error).toBeTrue();
    expect(estado.pantalla).toBe('Error');
  });

  it('en error, los dígitos no hacen nada hasta limpiar', () => {
    const error = tipear('5', '÷', '0', '=');
    expect(presionarDigito(error, '3')).toEqual(error);
    expect(limpiar()).toEqual(estadoInicial());
  });

  it('limpia el punto flotante: 0.1 + 0.2 da 0.3, no 0.30000000000000004', () => {
    expect(tipear('0', '.', '1', '+', '0', '.', '2', '=').pantalla).toBe('0.3');
  });

  it('un dígito nuevo después de "=" empieza un número limpio', () => {
    expect(tipear('2', '+', '3', '=', '9').pantalla).toBe('9');
  });
});
