import { Component } from '@angular/core';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonBackButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-counting-detail',
  templateUrl: './counting-detail.page.component.html',
  standalone: true,
  imports: [IonButtons, IonContent, IonHeader, IonBackButton, IonTitle, IonToolbar],
})
export class CountingDetailPageComponent {}
