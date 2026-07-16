import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { IonInput } from '@ionic/angular/standalone';
import { Keyboard } from '@capacitor/keyboard';

import { ScanComponent } from './scan.component';

describe('ScanComponent', () => {
  let component: ScanComponent;
  let fixture: ComponentFixture<ScanComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ScanComponent, IonicModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(ScanComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
