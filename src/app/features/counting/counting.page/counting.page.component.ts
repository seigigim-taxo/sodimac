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
  selector: 'app-counting-page',
  templateUrl: './counting.page.component.html',
  standalone: true,
  imports: [IonButtons, IonContent, IonHeader, IonBackButton, IonTitle, IonToolbar],
})
export class CountingPageComponent {}
