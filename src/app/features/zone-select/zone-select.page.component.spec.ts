import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ZoneSelectPageComponent } from './zone-select.page.component';
import { CountingRepository } from '../../domain/counting/repositories/counting.repository';

const mockCountingRepository = {
  createSession: jasmine.createSpy('createSession').and.returnValue(Promise.resolve()),
  getSessions: jasmine.createSpy('getSessions').and.returnValue(Promise.resolve([])),
  getSession: jasmine.createSpy('getSession').and.returnValue(Promise.resolve(null)),
  updateSession: jasmine.createSpy('updateSession').and.returnValue(Promise.resolve()),
  deleteSession: jasmine.createSpy('deleteSession').and.returnValue(Promise.resolve()),
  markSynced: jasmine.createSpy('markSynced').and.returnValue(Promise.resolve()),
};

describe('ZoneSelectPageComponent', () => {
  let component: ZoneSelectPageComponent;
  let fixture: ComponentFixture<ZoneSelectPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ZoneSelectPageComponent],
      providers: [
        { provide: CountingRepository, useValue: mockCountingRepository },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ZoneSelectPageComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
