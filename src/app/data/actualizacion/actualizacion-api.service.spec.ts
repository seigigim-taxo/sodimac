import { parsearVersion } from './actualizacion-api.service';

const SHA = 'f91f3fabb8ca8086edc76d68c4228ff657f839ac712a5630b732bb91174f9cd6';

/*
 * El manifiesto lo edita una persona a mano al subir cada APK — es un JSON
 * estático en el servidor, no algo que genere un programa. O sea que los
 * errores de tipeo son el caso esperado, no el excepcional.
 *
 * La regla es que un manifiesto que no se entiende se trata como "no hay
 * actualización". Aceptarlo a medias sería peor: llevaría al operador hasta el
 * instalador de Android con un archivo que nadie pudo verificar.
 */
describe('parsearVersion', () => {
  it('lee el manifiesto acordado', () => {
    expect(parsearVersion({
      version_code: 4,
      version_name: '1.0.2',
      url: 'http://servidor/apk/sodimac-1.0.2.apk',
      sha256: SHA,
      obligatoria: false,
    })).toEqual({
      versionCode: 4,
      versionName: '1.0.2',
      url: 'http://servidor/apk/sodimac-1.0.2.apk',
      sha256: SHA,
      obligatoria: false,
    });
  });

  it('acepta version_code como texto, que es lo que suele mandar PHP', () => {
    expect(parsearVersion({ version_code: '4', url: 'http://x/a.apk', sha256: SHA })?.versionCode).toBe(4);
  });

  it('normaliza el hash a minúsculas para poder compararlo', () => {
    expect(parsearVersion({
      version_code: 4, url: 'http://x/a.apk', sha256: SHA.toUpperCase(),
    })?.sha256).toBe(SHA);
  });

  /*
   * Los tres campos sin los cuales no se puede hacer nada: sin versionCode no
   * se compara, sin url no se baja, sin sha256 no se verifica.
   */
  describe('rechaza manifiestos que no sirven', () => {
    it('sin version_code', () => {
      expect(parsearVersion({ url: 'http://x/a.apk', sha256: SHA })).toBeNull();
    });

    it('con version_code en cero', () => {
      expect(parsearVersion({ version_code: 0, url: 'http://x/a.apk', sha256: SHA })).toBeNull();
    });

    it('sin url', () => {
      expect(parsearVersion({ version_code: 4, sha256: SHA })).toBeNull();
    });

    it('sin sha256', () => {
      expect(parsearVersion({ version_code: 4, url: 'http://x/a.apk' })).toBeNull();
    });

    // Un hash truncado al copiar y pegar: el error más fácil de cometer
    // editando el JSON a mano, y el que dejaría pasar un archivo sin verificar.
    it('con un sha256 de largo equivocado', () => {
      expect(parsearVersion({ version_code: 4, url: 'http://x/a.apk', sha256: SHA.slice(0, 40) })).toBeNull();
    });

    it('con un sha256 que no es hexadecimal', () => {
      expect(parsearVersion({ version_code: 4, url: 'http://x/a.apk', sha256: 'z'.repeat(64) })).toBeNull();
    });

    it('con null, un arreglo o un objeto vacío', () => {
      expect(parsearVersion(null)).toBeNull();
      expect(parsearVersion([{ version_code: 4 }])).toBeNull();
      expect(parsearVersion({})).toBeNull();
    });
  });

  /*
   * Bloquear el trabajo del operador es la consecuencia más cara de este
   * archivo, así que sólo ocurre si dice exactamente true. Un "true" con
   * comillas, un 1, o el campo ausente dejan la actualización como opcional.
   */
  describe('obligatoria', () => {
    const base = { version_code: 4, url: 'http://x/a.apk', sha256: SHA };

    it('sólo con true real', () => {
      expect(parsearVersion({ ...base, obligatoria: true })?.obligatoria).toBeTrue();
    });

    it('el texto "true" no alcanza', () => {
      expect(parsearVersion({ ...base, obligatoria: 'true' })?.obligatoria).toBeFalse();
    });

    it('ausente es opcional', () => {
      expect(parsearVersion(base)?.obligatoria).toBeFalse();
    });
  });

  it('sin nombre de versión, muestra el número', () => {
    expect(parsearVersion({ version_code: 4, url: 'http://x/a.apk', sha256: SHA })?.versionName).toBe('4');
  });
});
