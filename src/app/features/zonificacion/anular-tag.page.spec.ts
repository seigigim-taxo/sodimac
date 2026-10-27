import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { AgendaRef, ResultadoAccion } from '../../application/zonificacion/resultado-accion';
import { ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearRespuestaEstado } from '../../data/zonificacion/zonificacion.parser';
import { CATALOGO_V1 } from '../../domain/zonificacion/utils/reglas-zonificacion.fixtures';
import { aplicarPendientes } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';
import { ZonificacionAnularTagPage } from './anular-tag.page';

const AGENDA: AgendaRef = { idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' };
const evento = (value: string): Event => new CustomEvent('ionInput', { detail: { value } });

describe('ZonificacionAnularTagPage', () => {
  let fixture: ComponentFixture<ZonificacionAnularTagPage>;
  let page: ZonificacionAnularTagPage;
  let navigate: jasmine.Spy;
  let anularTag: jasmine.Spy;
  let estado: ReturnType<typeof signal<EstadoCargado | null>>;
  let catalogo: ReturnType<typeof signal<CatalogoCargado | null>>;
  let idEnRuta: string;
  let alerta: { create: jasmine.Spy; creada: { present: jasmine.Spy; message: string } };

  beforeEach(async () => {
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    anularTag = jasmine.createSpy('anularTag').and.resolveTo({ ok: true } as ResultadoAccion);
    const e = parsearRespuestaEstado(ESTADO_V1_DATA);
    estado = signal<EstadoCargado | null>({ estado: e, vista: aplicarPendientes(e, []), origen: 'SERVIDOR', fechaDescarga: null, error: null });
    catalogo = signal<CatalogoCargado | null>({ catalogo: CATALOGO_V1, origen: 'SERVIDOR', fechaDescarga: null });
    idEnRuta = '2092';
    alerta = { creada: { present: jasmine.createSpy('present').and.resolveTo(), message: '' }, create: jasmine.createSpy('create') };
    alerta.create.and.callFake(async () => alerta.creada);

    await TestBed.configureTestingModule({ imports: [ZonificacionAnularTagPage] })
      .overrideComponent(ZonificacionAnularTagPage, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .overrideProvider(Router, { useValue: { navigate } })
      .overrideProvider(ActivatedRoute, { useValue: { snapshot: { paramMap: { get: () => idEnRuta } } } })
      .overrideProvider(NetworkService, { useValue: { isOnline: signal(true) } })
      .overrideProvider(AlertController, { useValue: alerta })
      .overrideProvider(ZonificacionFacade, { useValue: { agenda: signal(AGENDA), estado, catalogo, anularTag } })
      .compileComponents();

    fixture = TestBed.createComponent(ZonificacionAnularTagPage);
    page = fixture.componentInstance;
    page.ionViewWillEnter();
  });

  const pintar = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const texto = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const el = (d: HTMLElement, id: string) => d.querySelector(`[data-testid="${id}"]`);

  it('sin la agenda abierta vuelve a la lista', () => {
    navigate.calls.reset();
    idEnRuta = '999';
    page.ionViewWillEnter();
    expect(navigate).toHaveBeenCalledOnceWith(['/zonificacion'], { replaceUrl: true });
  });

  it('parte vacío y sin poder anular', () => {
    const d = pintar();

    expect(page.puedeAnular()).toBeFalse();
    expect(el(d, 'rango')).toBeNull();
    expect(texto(el(d, 'contador'))).toBe('0 caracteres · mínimo 10');
  });

  it('con un TAG de un rango dice en cuál está y cuánto baja', () => {
    page.onNumero(evento('1129'));

    const d = pintar();

    expect(texto(el(d, 'rango'))).toContain('ALTILLO');
    expect(texto(el(d, 'rango'))).toContain('Rango 1128–1131 · baja de 4 a 3 TAG');
  });

  it('cuenta los caracteres del motivo', () => {
    page.onMotivo(evento('No se encontró en la tienda'));
    expect(texto(el(pintar(), 'contador'))).toBe('27 caracteres · mínimo 10');
  });

  it('un TAG que no está en ningún rango se avisa', () => {
    page.onNumero(evento('2500'));
    page.onMotivo(evento('No se encontró en la tienda'));

    expect(texto(el(pintar(), 'error-numero'))).toBe('El TAG 2500 no pertenece a ningún rango de esta agenda.');
    expect(page.puedeAnular()).toBeFalse();
  });

  it('un motivo corto avisa en rojo y no deja anular', () => {
    page.onNumero(evento('1129'));
    page.onMotivo(evento('rota'));

    pintar();

    expect(page.evaluacion()?.errorMotivo).toBe('El motivo debe tener al menos 10 caracteres.');
    expect(page.puedeAnular()).toBeFalse();
  });

  it('sin catálogo no deja anular (no se sabe el mínimo del motivo)', () => {
    catalogo.set({ catalogo: null, origen: 'NINGUNO', fechaDescarga: null });
    page.onNumero(evento('1129'));
    page.onMotivo(evento('No se encontró en la tienda'));

    expect(el(pintar(), 'sin-catalogo')).not.toBeNull();
    expect(page.puedeAnular()).toBeFalse();
  });

  describe('anular', () => {
    beforeEach(() => {
      page.onNumero(evento('1129'));
      page.onMotivo(evento('No se encontró en la tienda'));
    });

    /* Abre el modal y escribe el número en él, como lo haría el operador. */
    const confirmar = async (numeroEscrito: string): Promise<boolean | void> => {
      await page.anular();
      const botones = alerta.create.calls.mostRecent().args[0].buttons;
      return botones[1].handler({ numero: numeroEscrito });
    };
    const esperar = async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    };

    describe('el modal de confirmación', () => {
      it('al tocar "Anular TAG" NO anula todavía: abre un modal que pide escribir el número', async () => {
        await page.anular();

        expect(anularTag).not.toHaveBeenCalled();
        const opciones = alerta.create.calls.mostRecent().args[0];
        expect(opciones.header).toBe('Confirmar anulación');
        expect(opciones.message).toContain('no se puede deshacer');
        expect(opciones.inputs.length).toBe(1);
        expect(opciones.buttons.map((b: { text: string }) => b.text)).toEqual(['Cancelar', 'Anular TAG']);
        expect(alerta.creada.present).toHaveBeenCalled();
      });

      it('el modal no revela el número: el operador tiene que escribirlo', async () => {
        await page.anular();
        expect(alerta.create.calls.mostRecent().args[0].message).not.toContain('1129');
      });

      it('con el número correcto anula y vuelve al resumen', async () => {
        const cierra = await confirmar('1129');
        await esperar();

        expect(cierra).toBeTrue();
        expect(anularTag).toHaveBeenCalledOnceWith(AGENDA, 1129, 'No se encontró en la tienda');
        expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092], { replaceUrl: true });
      });

      it('acepta el número con espacios de más (lo que entrega el escáner)', async () => {
        await confirmar('  1129 ');
        await esperar();
        expect(anularTag).toHaveBeenCalledTimes(1);
      });

      it('con otro número no anula, el modal sigue abierto y lo explica', async () => {
        const cierra = await confirmar('1130');
        await esperar();

        expect(cierra).toBeFalse();
        expect(anularTag).not.toHaveBeenCalled();
        expect(alerta.creada.message).toBe('El número no coincide con el TAG que vas a anular. Revísalo e intenta de nuevo.');
      });

      it('vacío tampoco anula', async () => {
        expect(await confirmar('')).toBeFalse();
        expect(anularTag).not.toHaveBeenCalled();
      });

      it('"Cancelar" no anula nada', async () => {
        await page.anular();
        const cancelar = alerta.create.calls.mostRecent().args[0].buttons[0];

        expect(cancelar.role).toBe('cancel');
        expect(anularTag).not.toHaveBeenCalled();
      });

      it('si el formulario no es válido ni siquiera abre el modal', async () => {
        page.onMotivo(evento('rota'));
        await page.anular();
        expect(alerta.create).not.toHaveBeenCalled();
      });
    });

    it('si el servidor la rechaza después de confirmar, se queda y explica por qué', async () => {
      anularTag.and.resolveTo({ ok: false, codigo: 'TAG_YA_ANULADO', data: { numero_tag: 1129 } });

      await confirmar('1129');
      await esperar();

      expect(navigate).not.toHaveBeenCalled();
      expect(texto(el(pintar(), 'error-anular'))).toBe('Ese TAG ya está anulado.');
    });

    it('no anula dos veces si se confirma de nuevo mientras se envía', async () => {
      let liberar!: (r: ResultadoAccion) => void;
      anularTag.and.returnValue(new Promise<ResultadoAccion>((ok) => (liberar = ok)));

      await confirmar('1129');
      await esperar();
      await page.anular(); // un segundo toque mientras la primera sigue en curso: no abre otro modal
      liberar({ ok: true });
      await esperar();

      expect(anularTag).toHaveBeenCalledTimes(1);
      expect(alerta.create).toHaveBeenCalledTimes(1);
    });

    it('Cancelar vuelve sin anular', async () => {
      await page.volver();
      expect(anularTag).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092], { replaceUrl: true });
    });
  });
});
