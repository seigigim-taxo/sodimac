import { parsearPreparacion } from './preparacion.parser';

/*
 * Los fixtures reproducen la respuesta completa del endpoint, pero el parser
 * recibe solo su contenido: ApiService.unwrap() ya saca el nivel `data`. Por
 * eso los tests llaman con raw.data y no con raw.
 */
describe('preparacion.parser', () => {
  describe('parsearPreparacion', () => {
    it('devuelve analista null cuando data.analista no existe', () => {
      const raw = {
        data: {
          usuario: {
            login: 'test@test.cl',
            rut: '12345678-9',
            rut_normalizado: '123456789',
            nombre_completo: 'Test User',
            nombres: 'Test',
            apellido_paterno: 'User',
            apellido_materno: null,
            cargo: 'Operador de Inventario',
            tipo_usuario: 'OPERADOR',
            es_usuario_cliente: false,
            autenticado: true,
          },
          tiendas: [
            {
              id_tienda: 1,
              codigo_tienda: 'TI001',
              nombre_tienda: 'Tienda Test',
              zona_operativa: '测试',
            },
          ],
          jornadas: [
            {
              evento: {
                sucursal_id: 1,
                fecha_programada: '2026-01-01',
                estado: 'ABIERTO',
              },
              muestra: null,
              productos: [],
            },
          ],
          zonas_tienda: [],
        },
      };

      const result = parsearPreparacion(raw.data);
      expect(result.analista).toBeNull();
    });

    it('parsea id_agenda desde data.analista.contexto', () => {
      const raw = {
        data: {
          usuario: {
            login: 'analista@test.cl',
            rut: '22222222-2',
            rut_normalizado: '222222222',
            nombre_completo: 'Analista Test',
            nombres: 'Analista',
            apellido_paterno: 'Test',
            apellido_materno: null,
            cargo: 'Analista',
            tipo_usuario: 'ANALISTA_CLIENTE',
            es_usuario_cliente: true,
            autenticado: true,
          },
          tiendas: [
            {
              id_tienda: 1,
              codigo_tienda: 'TI001',
              nombre_tienda: 'Tienda Test',
              zona_operativa: '测试',
            },
          ],
          jornadas: [
            {
              evento: {
                sucursal_id: 1,
                fecha_programada: '2026-01-01',
                estado: 'ABIERTO',
              },
              muestra: null,
              productos: [],
            },
          ],
          zonas_tienda: [],
          analista: {
            contexto: {
              codigo_tienda: 'TI001',
              nombre_tienda: 'Tienda Test',
              id_agenda: 910002,
              numero_agenda: 'AG-20260101-TI001-01',
              codigo_muestra: 'M-20260101-TI001',
              nombre_muestra: 'Muestra Test',
              fecha_jornada: '2026-01-01',
            },
            kpis: {
              diferencias_pendientes: 3,
              valor_diferencias: 150000,
              diferencias_criticas: 1,
              reconteos_realizados: 0,
              diferencias_resueltas: 2,
              persisten_con_diferencia: 1,
              total_productos: 5,
            },
            filas: [],
          },
        },
      };

      const result = parsearPreparacion(raw.data);
      expect(result.analista).not.toBeNull();
      expect(result.analista!.contexto.idAgenda).toBe(910002);
      expect(result.analista!.contexto.numeroAgenda).toBe('AG-20260101-TI001-01');
      expect(result.analista!.contexto.codigoMuestra).toBe('M-20260101-TI001');
    });

    it('parsea id_agenda como null cuando no viene en el contexto', () => {
      const raw = {
        data: {
          usuario: {
            login: 'analista@test.cl',
            rut: '22222222-2',
            rut_normalizado: '222222222',
            nombre_completo: 'Analista Test',
            nombres: 'Analista',
            apellido_paterno: 'Test',
            apellido_materno: null,
            cargo: 'Analista',
            tipo_usuario: 'ANALISTA_CLIENTE',
            es_usuario_cliente: true,
            autenticado: true,
          },
          tiendas: [
            {
              id_tienda: 1,
              codigo_tienda: 'TI001',
              nombre_tienda: 'Tienda Test',
              zona_operativa: '测试',
            },
          ],
          jornadas: [
            {
              evento: {
                sucursal_id: 1,
                fecha_programada: '2026-01-01',
                estado: 'ABIERTO',
              },
              muestra: null,
              productos: [],
            },
          ],
          zonas_tienda: [],
          analista: {
            contexto: {
              codigo_tienda: 'TI001',
              nombre_tienda: 'Tienda Test',
              numero_agenda: 'AG-20260101-TI001-01',
              codigo_muestra: 'M-20260101-TI001',
              nombre_muestra: 'Muestra Test',
              fecha_jornada: '2026-01-01',
            },
            kpis: {
              diferencias_pendientes: 0,
              valor_diferencias: 0,
              diferencias_criticas: 0,
              reconteos_realizados: 0,
              diferencias_resueltas: 0,
              persisten_con_diferencia: 0,
              total_productos: 0,
            },
            filas: [],
          },
        },
      };

      const result = parsearPreparacion(raw.data);
      expect(result.analista).not.toBeNull();
      expect(result.analista!.contexto.idAgenda).toBeNull();
    });

    it('parsea filas y tags del analista correctamente', () => {
      const raw = {
        data: {
          usuario: {
            login: 'analista@test.cl',
            rut: '22222222-2',
            rut_normalizado: '222222222',
            nombre_completo: 'Analista Test',
            nombres: 'Analista',
            apellido_paterno: 'Test',
            apellido_materno: null,
            cargo: 'Analista',
            tipo_usuario: 'ANALISTA_CLIENTE',
            es_usuario_cliente: true,
            autenticado: true,
          },
          tiendas: [
            {
              id_tienda: 1,
              codigo_tienda: 'TI001',
              nombre_tienda: 'Tienda Test',
              zona_operativa: '测试',
            },
          ],
          jornadas: [
            {
              evento: {
                sucursal_id: 1,
                fecha_programada: '2026-01-01',
                estado: 'ABIERTO',
              },
              muestra: null,
              productos: [],
            },
          ],
          zonas_tienda: [],
          analista: {
            contexto: {
              codigo_tienda: 'TI001',
              nombre_tienda: 'Tienda Test',
              id_agenda: 910002,
              numero_agenda: 'AG-20260101-TI001-01',
              codigo_muestra: 'M-20260101-TI001',
              nombre_muestra: 'Muestra Test',
              fecha_jornada: '2026-01-01',
            },
            kpis: {
              diferencias_pendientes: 1,
              valor_diferencias: 50000,
              diferencias_criticas: 0,
              reconteos_realizados: 0,
              diferencias_resueltas: 0,
              persisten_con_diferencia: 1,
              total_productos: 1,
            },
            filas: [
              {
                sku: 'SKU001',
                descripcion: 'Producto Test',
                codigo_barras: '78000000001',
                zona: 'Zona Test',
                tag: 'TAG-001',
                stock_sistema: 10,
                cantidad_contada: 8,
                diferencia_unidades: -2,
                diferencia_valor: 20000,
                precio_unitario: 10000,
                prioridad: 'MEDIA',
                estado: 'PENDIENTE',
                tags: [
                  {
                    tag_codigo: '001',
                    ubicacion_codigo: 'TAG-001',
                    zona_nombre: 'ZONA_TEST',
                    zona_descripcion: 'Zona Test',
                    cantidad_operador: 8,
                  },
                ],
              },
            ],
          },
        },
      };

      const result = parsearPreparacion(raw.data);
      expect(result.analista).not.toBeNull();
      expect(result.analista!.filas.length).toBe(1);
      expect(result.analista!.filas[0].sku).toBe('SKU001');
      expect(result.analista!.filas[0].tags.length).toBe(1);
      expect(result.analista!.filas[0].tags[0].tagCodigo).toBe('001');
      expect(result.analista!.filas[0].tags[0].ubicacionCodigo).toBe('TAG-001');
    });
  });

  /*
   * El contrato de dos jornadas. Se arma con un helper y no con fixtures
   * completos porque lo que se prueba es el armado de jornadas, y 60 lineas de
   * usuario y tienda repetidas cuatro veces solo esconden la diferencia entre
   * un caso y el siguiente.
   */
  describe('jornadas', () => {
    const USUARIO = {
      login: 'test@test.cl',
      rut: '12345678-9',
      rut_normalizado: '123456789',
      nombres: 'Test',
      cargo: 'Operador de Inventario',
      tipo_usuario: 'OPERADOR',
      autenticado: true,
    };

    const TIENDA = {
      id_tienda: 1,
      codigo_tienda: 'TI001',
      nombre_tienda: 'Tienda Test',
      zona_operativa: null,
    };

    const producto = (sku: string) => ({
      sku,
      id_muestra_det: 1,
      descripcion: 'Producto ' + sku,
      stock_sistema: 10,
      codigos: [{ codigo_lectura: sku, tipo_codigo: 'SKU', codigo_barras: null }],
    });

    const jornada = (fecha: string, codigoMuestra: string | null, extra: object = {}) => ({
      evento: { sucursal_id: 1, fecha_programada: fecha, estado: 'ABIERTO', ...extra },
      muestra: codigoMuestra === null ? null : { id_muestra: 1, codigo_muestra: codigoMuestra },
      productos: codigoMuestra === null ? [] : [producto('SKU-' + fecha)],
    });

    const parsear = (jornadas: unknown, tiendas: object[] = [TIENDA]) =>
      parsearPreparacion({ usuario: USUARIO, tiendas, jornadas, zonas_tienda: [] });

    it('parsea las dos jornadas, cada una con su muestra', () => {
      const r = parsear([jornada('2026-08-31', 'M-HOY'), jornada('2026-09-01', 'M-MANANA')]);

      expect(r.jornadas.length).toBe(2);
      expect(r.jornadas[0].muestra?.codigoMuestra).toBe('M-HOY');
      expect(r.jornadas[1].muestra?.codigoMuestra).toBe('M-MANANA');
    });

    // Lo que el contrato viejo no podia expresar: que producto es de que dia.
    it('mantiene cada producto en la jornada a la que pertenece', () => {
      const r = parsear([jornada('2026-08-31', 'M-HOY'), jornada('2026-09-01', 'M-MANANA')]);

      expect(r.jornadas[0].muestra?.detalles[0].sku).toBe('SKU-2026-08-31');
      expect(r.jornadas[1].muestra?.detalles[0].sku).toBe('SKU-2026-09-01');
    });

    it('ordena por fecha aunque lleguen al reves', () => {
      const r = parsear([jornada('2026-09-01', 'M-MANANA'), jornada('2026-08-31', 'M-HOY')]);

      expect(r.jornadas.map((j) => j.evento.fechaProgramada)).toEqual(['2026-08-31', '2026-09-01']);
    });

    // idJornada() ES la fecha, asi que dos con el mismo dia harian ambigua la
    // seleccion. El backend ya deduplica; esto es el cinturon.
    it('se queda con una sola jornada por fecha', () => {
      const r = parsear([jornada('2026-08-31', 'M-PRIMERA'), jornada('2026-08-31', 'M-SEGUNDA')]);

      expect(r.jornadas.length).toBe(1);
      expect(r.jornadas[0].muestra?.codigoMuestra).toBe('M-PRIMERA');
    });

    it('acepta una sola jornada', () => {
      expect(parsear([jornada('2026-08-31', 'M-HOY')]).jornadas.length).toBe(1);
    });

    /*
     * Sin trabajo asignado. NO es un error: antes esta situacion llegaba como
     * un 401 que la app confundia con credenciales invalidas.
     */
    it('acepta la lista vacia', () => {
      expect(parsear([]).jornadas).toEqual([]);
      expect(parsear(null).jornadas).toEqual([]);
      expect(parsear(undefined).jornadas).toEqual([]);
    });

    it('acepta una jornada sin muestra, como la del analista', () => {
      const r = parsear([jornada('2026-08-31', null)]);

      expect(r.jornadas.length).toBe(1);
      expect(r.jornadas[0].muestra).toBeNull();
    });

    describe('jornadas que no se pueden trabajar', () => {
      // Un evento sin dia no se puede ni mostrar ni guardar: sod_evento usa la
      // fecha como parte de su identidad.
      it('descarta la que no trae fecha', () => {
        const sinFecha = { evento: { sucursal_id: 1, estado: 'ABIERTO' }, muestra: null, productos: [] };

        expect(parsear([sinFecha]).jornadas).toEqual([]);
      });

      // Lo importante del caso: que se pierda maniana no puede dejar al
      // operador sin hoy.
      it('descarta solo la mala y conserva la buena', () => {
        const sinFecha = { evento: { sucursal_id: 1, estado: 'ABIERTO' }, muestra: null, productos: [] };
        const r = parsear([jornada('2026-08-31', 'M-HOY'), sinFecha]);

        expect(r.jornadas.length).toBe(1);
        expect(r.jornadas[0].evento.fechaProgramada).toBe('2026-08-31');
      });

      it('descarta la que viene sin evento', () => {
        expect(parsear([{ muestra: null, productos: [] }]).jornadas).toEqual([]);
      });

      // Sin tienda no hay codigo_tienda con que resolver la sucursal en SQLite.
      it('descarta todo si no hay tiendas', () => {
        expect(parsear([jornada('2026-08-31', 'M-HOY')], []).jornadas).toEqual([]);
      });
    });

    /*
     * Un estado inventado si es error, a diferencia de la fecha faltante: la
     * columna no tiene CHECK, asi que entraria a la base y romperia la logica
     * de bloqueo y reconteo. El mensaje tiene que decir en que jornada fue.
     */
    it('falla con un estado desconocido, nombrando la jornada', () => {
      const mala = jornada('2026-09-01', 'M-MANANA', { estado: 'INVENTADO' });

      expect(() => parsear([jornada('2026-08-31', 'M-HOY'), mala]))
        .toThrowMatching((e: Error) => /data\.jornadas\[1\]\.evento\.estado/.test(e.message));
    });

    describe('tienda de la jornada', () => {
      const OTRA = { id_tienda: 7, codigo_tienda: 'TI007', nombre_tienda: 'Otra', zona_operativa: null };

      it('resuelve la tienda cruzando sucursal_id contra el maestro', () => {
        const r = parsear([jornada('2026-08-31', 'M-HOY')]);

        expect(r.jornadas[0].tienda.codigoTienda).toBe('TI001');
      });

      /*
       * El maestro de tiendas hoy llega con una sola —parsearTiendas se queda
       * con la primera—, asi que una agenda de otra sucursal cae en el
       * fallback. Se usa la principal en vez de descartar la jornada: perder
       * trabajo asignado en silencio es peor que mostrarlo con otra tienda.
       */
      it('usa la primera tienda cuando el sucursal_id no esta en el maestro', () => {
        const r = parsear([jornada('2026-08-31', 'M-HOY', { sucursal_id: 999 })], [OTRA]);

        expect(r.jornadas[0].tienda.codigoTienda).toBe('TI007');
      });
    });
  });
});
