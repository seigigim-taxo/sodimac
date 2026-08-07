import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonApp,
  IonRouterOutlet,
  IonMenu,
  IonMenuToggle,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonButton,
  IonButtons,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, trashOutline } from 'ionicons/icons';
import { AuthFacade } from './state/auth/auth.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { PdaFacade } from './state/pda/pda.facade';
import { EventoFacade } from './state/evento/evento.facade';
import { ZonaFacade } from './state/zona/zona.facade';
import { ConteoFacade } from './state/conteo/conteo.facade';
import { DATABASE_REPOSITORY_TOKEN } from './domain/database/repositories/database.repository';
import { formatRutDisplay } from './shared/utils/rut.utils';
import { BuscadorSkuComponent } from './shared/components/buscador-sku/buscador-sku.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    BuscadorSkuComponent,
    IonApp,
    IonRouterOutlet,
    IonMenu,
    IonMenuToggle,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonButton,
    IonButtons,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
  ],
})
export class AppComponent {
  private auth     = inject(AuthFacade);
  private theme    = inject(ThemeFacade);
  private pda      = inject(PdaFacade);
  private evento   = inject(EventoFacade);
  private zona     = inject(ZonaFacade);
  private conteo   = inject(ConteoFacade);
  private router   = inject(Router);
  private location = inject(Location);
  private alertController = inject(AlertController);
  private database = inject(DATABASE_REPOSITORY_TOKEN);

  session          = this.auth.session;
  isDark           = this.theme.isDark;
  formatRutDisplay = formatRutDisplay;

  constructor() {
    addIcons({ arrowBackOutline, logOutOutline, sunnyOutline, moonOutline, listOutline, homeOutline, trashOutline });
  }

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    this.router.navigate(['/home']);
  }

  goConteos(): void {
    this.router.navigate(['/tags-resumen']);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }

  async toggleTheme(): Promise<void> {
    await this.theme.toggle();
  }

  async confirmResetLocalDatabase(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Reiniciar base local',
      message: 'Esto borrará toda la base de datos local de esta PDA: usuario, tienda, evento, muestra, productos, zonas y conteos. Luego volverás al login. ¿Confirmas?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Reiniciar',
          role: 'destructive',
          handler: () => { void this.resetLocalDatabase(); },
        },
      ],
    });
    await alert.present();
  }

  /*
   * Borrar la base no borra lo que la app tiene en memoria: los ids que quedan
   * en los facades apuntan a filas que ya no existen, y el primer INSERT que los
   * use muere con FOREIGN KEY constraint failed (787).
   *
   * El caso que siempre se daba es la PDA: se registra una única vez en el
   * APP_INITIALIZER, y reiniciar la base no reinicia la app — así que había que
   * volver a registrarla acá. Los demás facades se sueltan por lo mismo, aunque
   * el login posterior vuelva a poblarlos: nada garantiza que lo hagan antes de
   * que alguien navegue con la selección vieja todavía puesta.
   */
  private async resetLocalDatabase(): Promise<void> {
    await this.database.resetLocalDatabase();

    this.conteo.reset();
    this.zona.reset();
    this.evento.reset();

    try {
      await this.pda.init();
    } catch (err) {
      // Mismo criterio que el bootstrap: no dejar al operador atrapado en el
      // menú por esto. El detalle queda en consola y el login sigue adelante.
      console.error('[AppComponent] no se pudo re-registrar la PDA tras reiniciar la base:', err);
    }

    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
