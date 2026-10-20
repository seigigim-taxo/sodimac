import { ExclusionDeEscrituras } from './exclusion-de-escrituras';

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('ExclusionDeEscrituras', () => {
  it('ejecuta las operaciones en el orden en que se pidieron', async () => {
    const exclusion = new ExclusionDeEscrituras();
    const orden: string[] = [];

    await Promise.all([
      exclusion.ejecutar(async () => { await pausa(15); orden.push('a'); }),
      exclusion.ejecutar(async () => { await pausa(1);  orden.push('b'); }),
      exclusion.ejecutar(async () => { orden.push('c'); }),
    ]);

    expect(orden).toEqual(['a', 'b', 'c']);
  });

  it('nunca solapa dos operaciones', async () => {
    const exclusion = new ExclusionDeEscrituras();
    let activas = 0;
    let maximo = 0;
    const tarea = async () => {
      activas++;
      maximo = Math.max(maximo, activas);
      await pausa(3);
      activas--;
    };

    await Promise.all([1, 2, 3, 4, 5].map(() => exclusion.ejecutar(tarea)));

    expect(maximo).toBe(1);
  });

  it('entrega el resultado de cada operación', async () => {
    const exclusion = new ExclusionDeEscrituras();

    const [x, y] = await Promise.all([
      exclusion.ejecutar(async () => 'x'),
      exclusion.ejecutar(async () => 42),
    ]);

    expect(x).toBe('x');
    expect(y).toBe(42);
  });

  it('que una operación falle no frena a las siguientes y el error le llega a quien la pidió', async () => {
    const exclusion = new ExclusionDeEscrituras();
    const orden: string[] = [];

    const falla = exclusion.ejecutar(async () => { orden.push('falla'); throw new Error('boom'); });
    const sigue = exclusion.ejecutar(async () => { orden.push('sigue'); return 'ok'; });

    await expectAsync(falla).toBeRejectedWithError('boom');
    expect(await sigue).toBe('ok');
    expect(orden).toEqual(['falla', 'sigue']);
  });

  describe('aviso de espera', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('avisa si una operación lleva demasiado esperando su turno', async () => {
      const aviso = spyOn(console, 'warn');
      const exclusion = new ExclusionDeEscrituras(1000);
      let liberar!: () => void;
      const ocupa = exclusion.ejecutar(() => new Promise<void>((r) => { liberar = r; }), 'transacción');
      const espera = exclusion.ejecutar(async () => undefined, 'run');
      // Deja que `ocupa` empiece (y cancele su propio aviso) antes de mover el reloj.
      await Promise.resolve();
      await Promise.resolve();

      jasmine.clock().tick(1001);

      expect(aviso).toHaveBeenCalledTimes(1);
      const texto = String(aviso.calls.mostRecent().args[0]);
      expect(texto).toContain('"run"');
      // Dice qué tiene el turno, y distingue una transacción larga (normal) de un bloqueo.
      expect(texto).toContain('En curso: "transacción"');
      expect(texto).toContain('Es normal si');

      liberar();
      await ocupa;
      await espera;
    });

    it('no avisa si la espera es corta', async () => {
      const aviso = spyOn(console, 'warn');
      const exclusion = new ExclusionDeEscrituras(1000);

      await exclusion.ejecutar(async () => undefined);
      await exclusion.ejecutar(async () => undefined);
      jasmine.clock().tick(5000);

      expect(aviso).not.toHaveBeenCalled();
    });
  });
});
