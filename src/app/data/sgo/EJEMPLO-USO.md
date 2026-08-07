# Ejemplo de uso del Mock SGO en la maqueta del reconteo

## Flujo completo de prueba

### 1. Sincronizar conteo finalizado

```typescript
import { Component, inject } from '@angular/core';
import { SgoFacade } from '../../state/sgo/sgo.facade';
import { ConteoListFacade } from '../../state/conteo/conteo-list.facade';

@Component({
  selector: 'app-mi-componente',
  templateUrl: './mi-componente.page.html',
})
export class MiComponentePage {
  private sgoFacade = inject(SgoFacade);
  private conteoList = inject(ConteoListFacade);

  async enviarConteoAlSgo(conteo: ConteoResumen) {
    const exito = await this.sgoFacade.sincronizarConteo(conteo);
    
    if (exito) {
      console.log('Conteo enviado al SGO correctamente');
      // Actualizar estado local
      await this.conteoList.sincronizar(conteo);
    } else {
      console.error('Error:', this.sgoFacade.error());
    }
  }
}
```

### 2. Verificar si hay reconteo

```typescript
async verificarReconteo(eventoId: number, iteracionActual: number) {
  const analisis = await this.sgoFacade.obtenerAnalisisReconteo(eventoId, iteracionActual);
  
  if (!analisis) {
    console.error('Error:', this.sgoFacade.error());
    return;
  }

  if (analisis.requiereReconteo) {
    console.log(`Reconteo solicitado: iteración ${analisis.iteracion}`);
    console.log(`SKUs a recontar: ${analisis.skusARecontar}`);
    
    // Abrir siguiente iteración
    await this.eventoFacade.abrirSiguienteIteracion(analisis.iteracion);
  } else {
    console.log('No se requiere reconteo, ciclo terminado');
  }
}
```

### 3. Flujo completo en Home (ejemplo)

```typescript
async sincronizarYVerificarReconteo() {
  const conteo = this.conteoList.seleccionado();
  if (!conteo || conteo.estado !== 'FINALIZADO') return;

  // 1. Sincronizar conteo con el SGO
  const sincronizado = await this.sgoFacade.sincronizarConteo(conteo);
  if (!sincronizado) return;

  // 2. Actualizar estado local
  await this.conteoList.sincronizar(conteo);

  // 3. Esperar análisis del SGO (simula delay)
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 4. Obtener análisis de reconteo
  const analisis = await this.sgoFacade.obtenerAnalisisReconteo(
    conteo.eventoId,
    this.conteoList.iteracionActiva()
  );

  if (!analisis?.requiereReconteo) {
    // Ciclo terminado
    return;
  }

  // 5. Abrir siguiente iteración
  const resultado = await this.eventoFacade.abrirSiguienteIteracion(analisis.iteracion);
  
  if (resultado) {
    console.log(`Iteración ${resultado.iteracion} abierta con ${resultado.conMuestra ? 'muestra' : 'sin muestra'}`);
  }
}
```

## Template HTML de ejemplo

```html
<ion-button 
  (click)="enviarConteoAlSgo(conteo)"
  [disabled]="sgoFacade.sincronizando()">
  
  <ion-spinner *ngIf="sgoFacade.sincronizando()" name="crescent"></ion-spinner>
  {{ sgoFacade.sincronizando() ? 'Enviando...' : 'Enviar al SGO' }}
</ion-button>

<ion-text color="danger" *ngIf="sgoFacade.error()">
  {{ sgoFacade.error() }}
</ion-text>

<ion-card *ngIf="sgoFacade.analisis() as analisis">
  <ion-card-header>
    <ion-card-title>Análisis del SGO</ion-card-title>
  </ion-card-header>
  <ion-card-content>
    <p>Requiere reconteo: {{ analisis.requiereReconteo ? 'Sí' : 'No' }}</p>
    <p *ngIf="analisis.iteracion">Iteración: {{ analisis.iteracion }}</p>
    <p *ngIf="analisis.skusARecontar">SKUs a recontar: {{ analisis.skusARecontar }}</p>
  </ion-card-content>
</ion-card>
```

## Cambiar entre mock y real

Solo necesitas cambiar `environment.mockSgo`:

```typescript
// Para probar con mock (desarrollo)
mockSgo: true

// Para usar endpoint real (producción)
mockSgo: false
```

No necesitas cambiar nada más en tu código.
