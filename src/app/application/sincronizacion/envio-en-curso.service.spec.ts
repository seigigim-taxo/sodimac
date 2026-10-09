import { EnvioEnCursoService } from './envio-en-curso.service';

describe('EnvioEnCursoService', () => {
  let candado: EnvioEnCursoService;

  beforeEach(() => { candado = new EnvioEnCursoService(); });

  it('el primero que pide un envío lo toma', () => {
    expect(candado.tomar('UID-1')).toBeTrue();
    expect(candado.estaEnCurso('UID-1')).toBeTrue();
  });

  it('el segundo que pide el MISMO envío no lo toma', () => {
    candado.tomar('UID-1');

    expect(candado.tomar('UID-1')).toBeFalse();
  });

  it('envíos distintos no se bloquean entre sí', () => {
    candado.tomar('UID-1');

    expect(candado.tomar('UID-2')).toBeTrue();
  });

  it('al soltarlo, se puede volver a tomar', () => {
    candado.tomar('UID-1');
    candado.soltar('UID-1');

    expect(candado.estaEnCurso('UID-1')).toBeFalse();
    expect(candado.tomar('UID-1')).toBeTrue();
  });

  it('soltar uno que nadie tomó no falla ni afecta a otros', () => {
    candado.tomar('UID-2');

    expect(() => candado.soltar('UID-1')).not.toThrow();
    expect(candado.estaEnCurso('UID-2')).toBeTrue();
  });
});
