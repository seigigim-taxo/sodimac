import { DeteccionCapturaTecladoService } from './deteccion-captura-teclado.service';

/*
 * Las marcas se construyen a mano, no se miden en vivo: probar contra el reloj
 * real haría que estos tests dependieran de la carga de la máquina.
 *
 * `marcas(largo, hueco)` simula una lectura de `largo` caracteres separados
 * uniformemente por `hueco` milisegundos.
 */
function marcas(largo: number, hueco: number): number[] {
  return Array.from({ length: largo }, (_, i) => 1000 + i * hueco);
}

describe('DeteccionCapturaTecladoService', () => {
  let servicio: DeteccionCapturaTecladoService;

  beforeEach(() => {
    servicio = new DeteccionCapturaTecladoService();
  });

  it('una ráfaga larga y pareja es la pistola', () => {
    // EAN13 completo llegando en ~5 ms por carácter.
    expect(servicio.clasificar(marcas(13, 5))).toBe('ESCANER');
  });

  it('el ritmo de una persona es manual', () => {
    // 200 ms por tecla es tecleo humano cómodo.
    expect(servicio.clasificar(marcas(13, 200))).toBe('MANUAL');
  });

  /*
   * El caso que hace útil al sesgo: el operador escanea y después corrige un
   * dígito. La pausa de la corrección rompe la ráfaga y la lectura deja de
   * contar como escaneada, que es lo correcto — ese código ya no es el que
   * entregó el lector.
   */
  it('una sola pausa larga en medio de la ráfaga la vuelve manual', () => {
    const conCorreccion = [...marcas(12, 5)];
    conCorreccion.push(conCorreccion[conCorreccion.length - 1] + 1500);

    expect(servicio.clasificar(conCorreccion)).toBe('MANUAL');
  });

  describe('ante la duda, manual', () => {
    it('un código demasiado corto no se clasifica como escaneado', () => {
      // Tres caracteres los tipea cualquiera más rápido que el umbral.
      expect(servicio.clasificar(marcas(3, 1))).toBe('MANUAL');
    });

    it('sin marcas es manual', () => {
      expect(servicio.clasificar([])).toBe('MANUAL');
    });

    it('una sola marca es manual', () => {
      expect(servicio.clasificar([1000])).toBe('MANUAL');
    });
  });

  /*
   * Estos dos fijan el umbral vigente. Si se recalibra contra los tiempos
   * reales de la Meferi, van a fallar — y eso es lo que se busca: que mover el
   * umbral sea una decisión visible y no un cambio silencioso.
   */
  it('40 ms de hueco todavía cuenta como ráfaga', () => {
    expect(servicio.clasificar(marcas(8, 40))).toBe('ESCANER');
  });

  it('41 ms de hueco ya no', () => {
    expect(servicio.clasificar(marcas(8, 41))).toBe('MANUAL');
  });
});
