import { etiquetaTag } from './etiqueta-tag';

describe('etiquetaTag', () => {
  describe('un TAG finalizado', () => {
    it('sin envío conocido: pendiente de sincronizar', () => {
      expect(etiquetaTag('FINALIZADO', null)).toEqual({
        texto: 'Pendiente de sincronizar', icono: 'cloud-upload-outline', tono: 'warning',
      });
    });

    // Es el caso que importa: decir "pendiente" invita a volver a contar lo que el servidor pudo guardar.
    it('con el envío en duda: "Sin confirmar", NO "pendiente"', () => {
      const e = etiquetaTag('FINALIZADO', 'EN_DUDA');

      expect(e).toEqual({ texto: 'Sin confirmar', icono: 'help-circle-outline', tono: 'warning' });
      expect(e.texto).not.toContain('Pendiente');
    });

    it('con el envío recibido: "Enviado", en verde', () => {
      expect(etiquetaTag('FINALIZADO', 'ENVIADO')).toEqual({
        texto: 'Enviado', icono: 'cloud-done-outline', tono: 'success',
      });
    });

    // El bloqueo solo trae EN_DUDA o ENVIADO, pero los otros estados no deben cambiar el rótulo.
    it('un envío que no llegó sigue siendo pendiente', () => {
      expect(etiquetaTag('FINALIZADO', 'NO_RECIBIDO').texto).toBe('Pendiente de sincronizar');
      expect(etiquetaTag('FINALIZADO', 'SIN_ENVIO').texto).toBe('Pendiente de sincronizar');
    });
  });

  it('un TAG en curso', () => {
    expect(etiquetaTag('EN_CURSO', null)).toEqual({ texto: 'En curso', icono: 'time-outline', tono: 'warning' });
  });

  it('un TAG en curso ignora el envío', () => {
    expect(etiquetaTag('EN_CURSO', 'EN_DUDA').texto).toBe('En curso');
  });

  it('un TAG sincronizado', () => {
    expect(etiquetaTag('SINCRONIZADO', null)).toEqual({
      texto: 'Sincronizado', icono: 'cloud-done-outline', tono: 'success',
    });
  });

  it('un TAG sincronizado ignora el envío', () => {
    expect(etiquetaTag('SINCRONIZADO', 'EN_DUDA').texto).toBe('Sincronizado');
  });
});
