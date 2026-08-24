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
          eventos: {
            fecha_programada: '2026-01-01',
            estado: 'ABIERTO',
          },
          muestras: null,
          productos: [],
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
          eventos: {
            fecha_programada: '2026-01-01',
            estado: 'ABIERTO',
          },
          muestras: null,
          productos: [],
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
          eventos: {
            fecha_programada: '2026-01-01',
            estado: 'ABIERTO',
          },
          muestras: null,
          productos: [],
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
          eventos: {
            fecha_programada: '2026-01-01',
            estado: 'ABIERTO',
          },
          muestras: null,
          productos: [],
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
});
