import { EstadoAgenda } from '../models/estado-agenda.model';
import { OperacionEnCola } from '../models/operacion-zonificacion.model';
import { VistaZonificacion } from '../models/vista-zonificacion.model';
import { avisoConfirmada, avisoReabierta, decidirConfirmacion, textoReabrir } from './confirmacion-zonificacion.utils';

const rango = (id: number, desde: number, hasta: number) => ({
  id, idServidor: id, codigoZona: 'ALTILLO', nombreZona: 'ALTILLO', tagDesde: desde, tagHasta: hasta,
  referenciaUbicacion: null, cantidad: hasta - desde + 1, pendiente: false, operacionUid: null,
});

const vista = (extra: Partial<VistaZonificacion> = {}): VistaZonificacion => ({
  estado: 'BORRADOR',
  confirmacionPendiente: false,
  reaperturaPendiente: false,
  rangos: [rango(1, 1135, 1140), rango(2, 3000, 3002), rango(3, 6100, 6101)],
  tagsAnulados: [],
  pendientes: [],
  rechazadas: [],
  ...extra,
});

const estado = (fuera = { total: 0, ejemplos: [] as number[] }): EstadoAgenda => ({ tagsFuera: fuera }) as EstadoAgenda;
const pendiente = (): OperacionEnCola => ({ tipo: 'GUARDAR_RANGO', estado: 'PENDIENTE' }) as OperacionEnCola;

describe('decidirConfirmacion', () => {
  it('con todo en orden pide confirmar y cuenta TAG y rangos', () => {
    expect(decidirConfirmacion(vista(), estado())).toEqual({
      tipo: 'CONFIRMAR',
      titulo: 'Confirmar zonificación',
      texto: '11 TAG en 3 rangos. Se validarán los TAG ya utilizados. Después no podrás editar rangos, salvo que la reabras.',
    });
  });

  it('un solo rango se dice en singular', () => {
    const d = decidirConfirmacion(vista({ rangos: [rango(1, 1135, 1140)] }), estado());
    expect(d.tipo === 'CONFIRMAR' && d.texto).toContain('6 TAG en 1 rango.');
  });

  it('con envíos pendientes hay que esperar, y no se pide confirmar', () => {
    expect(decidirConfirmacion(vista({ pendientes: [pendiente(), pendiente()] }), estado())).toEqual({
      tipo: 'BLOQUEO',
      titulo: 'Hay envíos pendientes',
      texto: 'Espera a que se envíen 2 cambios para poder confirmar.',
    });
    const uno = decidirConfirmacion(vista({ pendientes: [pendiente()] }), estado());
    expect(uno.tipo === 'BLOQUEO' && uno.texto).toBe('Espera a que se envíen 1 cambio para poder confirmar.');
  });

  it('sin rangos no hay diálogo: es un aviso', () => {
    expect(decidirConfirmacion(vista({ rangos: [] }), estado())).toEqual({ tipo: 'ERROR', texto: 'Debes registrar al menos un rango antes de confirmar.' });
  });

  it('con rangos pero todos sus TAG anulados, el aviso es otro (como en el SGO)', () => {
    const anulados = Array.from({ length: 3 }, (_, i) => ({ numeroTag: 1135 + i, motivo: 'rota', pendiente: false }));
    const solo = vista({ rangos: [{ ...rango(1, 1135, 1137), cantidad: 0 }], tagsAnulados: anulados });
    expect(decidirConfirmacion(solo, estado())).toEqual({ tipo: 'ERROR', texto: 'La zonificación no contiene TAG válidos.' });
  });

  it('TAG usados sin rango bloquean y se nombran', () => {
    expect(decidirConfirmacion(vista(), estado({ total: 2, ejemplos: [5000, 5001] }))).toEqual({
      tipo: 'BLOQUEO',
      titulo: 'No se puede confirmar',
      texto: 'Hay 2 TAG usados sin rango: 5000, 5001. Agrega rangos que los cubran.',
    });
  });

  it('los pendientes se mencionan antes que los TAG sin rango (primero hay que dejar la cola al día)', () => {
    const d = decidirConfirmacion(vista({ pendientes: [pendiente()] }), estado({ total: 2, ejemplos: [5000] }));
    expect(d.tipo === 'BLOQUEO' && d.titulo).toBe('Hay envíos pendientes');
  });

  it('sin estado descargado igual se puede decidir con lo que hay en la vista', () => {
    expect(decidirConfirmacion(vista(), null).tipo).toBe('CONFIRMAR');
  });
});

describe('avisos', () => {
  it('confirmada: dice cuántos rangos y TAG, y cuántos TAG ya usados se validarán', () => {
    expect(avisoConfirmada(vista(), 0)).toBe('Zonificación confirmada: 3 rangos, 11 TAG instalados. El conteo queda habilitado.');
    expect(avisoConfirmada(vista(), 4)).toBe('Zonificación confirmada: 3 rangos, 11 TAG instalados. Se validarán los 4 TAG ya utilizados en el conteo.');
  });

  it('reabrir: el diálogo y el aviso cambian si el conteo ya tiene TAG usados', () => {
    expect(textoReabrir(0)).toBe('¿Reabrir para modificar sus rangos?');
    expect(textoReabrir(4)).toContain('El conteo ya tiene TAG utilizados');
    expect(avisoReabierta(0)).toBe('La zonificación volvió a borrador.');
    expect(avisoReabierta(4)).toContain('Zonificación reabierta.');
  });
});
