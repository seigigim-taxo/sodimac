import { Injectable } from '@angular/core';

/*
 * Candado en memoria: un envío (carga_uid) a la vez.
 *
 * Sin esto, el reintento automático y el "Finalizar" del operador podían mandar
 * el mismo TAG al mismo tiempo. El servidor lo toleraría —el identificador es el
 * mismo— pero ambos escribirían el resultado en la cola y uno podría pisar la
 * anotación del otro.
 *
 * Vive en memoria a propósito: si la app se cierra a mitad de un envío, el
 * candado desaparece con ella, que es lo correcto. No hay candados huérfanos.
 */
@Injectable({ providedIn: 'root' })
export class EnvioEnCursoService {
  private enCurso = new Set<string>();

  /* true si lo tomó; false si ese envío ya lo tiene otro. */
  tomar(cargaUid: string): boolean {
    if (this.enCurso.has(cargaUid)) return false;
    this.enCurso.add(cargaUid);
    return true;
  }

  soltar(cargaUid: string): void {
    this.enCurso.delete(cargaUid);
  }

  estaEnCurso(cargaUid: string): boolean {
    return this.enCurso.has(cargaUid);
  }
}
