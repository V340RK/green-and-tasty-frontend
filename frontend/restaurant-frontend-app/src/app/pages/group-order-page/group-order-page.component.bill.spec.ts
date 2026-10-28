// Власна фіча · хто платить — сторінка. Сервіс підмінено шпигуном. Запуск: npm run test:hw
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupOrderPageComponent } from './group-order-page.component';

const caesar = { id: 'dish1', name: 'Caesar Salad', price: 180 };
const tomYum = { id: 'dish2', name: 'Tom Yum', price: 220 };

const SESSIONS: GroupSessionsResponse = {
  participants: [
    { id: 'owner', type: 'Owner', name: 'Yevhenii', isSubmitted: true, total: 180, billType: 'Shared', items: [{ dish: caesar, quantity: 1 }] },
    { id: 'andrii', type: 'Guest', name: 'Andrii', isSubmitted: true, total: 360, billType: 'Individual', items: [{ dish: caesar, quantity: 2 }] },
    { id: 'olena', type: 'Guest', name: 'Olena', isSubmitted: true, total: 220, billType: 'Shared', items: [{ dish: tomYum, quantity: 1 }] },
    { id: 'iryna', type: 'Guest', name: 'Iryna', isSubmitted: false, total: 220, billType: 'Individual', items: [{ dish: tomYum, quantity: 1 }] },
  ],
  total: 980,
  sharedTotal: 400,
  individualTotal: 580,
};
const INVITE = {
  GroupReservationId: 'grp-1',
  LocationAddress: 'Rustaveli Avenue 48',
  MaxGuestCount: 5,
  StartTime: '2026-10-21T16:00:00Z',
  EndTime: '2026-10-21T17:30:00Z',
} as GuestInvite;

describe('Фіча · хто платить (сторінка)', () => {
  let service: jasmine.SpyObj<GroupOrdersService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    service = jasmine.createSpyObj<GroupOrdersService>('GroupOrdersService', [
      'getGroupInvite$', 'getSessions$', 'getOwnerSessionId$', 'getStatus$', 'submit$', 'removeSession$', 'setBillType$',
    ]);
    service.getGroupInvite$.and.returnValue(of(INVITE));
    service.getSessions$.and.returnValue(of(SESSIONS));
    service.getOwnerSessionId$.and.returnValue(of('owner'));
    service.getStatus$.and.returnValue(of({ currentParticipants: 4, maxCapacity: 5, status: 'Open' }));
    toast = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);
  });

  function create() {
    TestBed.configureTestingModule({
      imports: [GroupOrderPageComponent],
      providers: [
        { provide: GroupOrdersService, useValue: service },
        { provide: ToastService, useValue: toast },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ reservationId: 'res-1' }) } } },
      ],
    });
    const fixture = TestBed.createComponent(GroupOrderPageComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const segmentsFor = (root: ParentNode, name: string) =>
    [...root.querySelectorAll<HTMLButtonElement>(`[aria-label="Who pays for ${name}"] .segment`)];

  it('рахує розбивку лише з підтверджених кошиків: your bill = owner + Shared-гості', () => {
    const { fixture, element } = create();
    expect(fixture.componentInstance.billSplit()).toEqual({ shared: 400, sharedGuests: 1, individual: 360, individualGuests: 1 });
    const split = element.querySelector('.bill-split')?.textContent ?? '';
    expect(split).toContain('Your bill (you + 1 guest)');
    expect(split).toContain('$400.00');
    expect(split).toContain('Guests paying for themselves (1)');
    expect(split).toContain('$360.00');
  });

  it('перемикач є у гостей і відсутній у власника, поки група відкрита', () => {
    const { element } = create();
    expect(segmentsFor(element, 'Andrii').length).toBe(2);
    expect(element.querySelector('[aria-label="Who pays for Yevhenii"]')).toBeNull();
  });

  it('клік «I pay» → PATCH через сервіс, снапшот із відповіді застосовано, toast', () => {
    const updated: GroupSessionsResponse = {
      ...SESSIONS,
      participants: SESSIONS.participants.map((p) => (p.id === 'andrii' ? { ...p, billType: 'Shared' as const } : p)),
    };
    service.setBillType$.and.returnValue(of(updated));
    const { fixture, element } = create();

    segmentsFor(element, 'Andrii')[0].click();
    fixture.detectChanges();

    expect(service.setBillType$).toHaveBeenCalledWith('grp-1', 'andrii', 'Shared');
    expect(fixture.componentInstance.billSplit().shared).toBe(760);
    expect(fixture.componentInstance.billUpdatingId()).toBe('');
    expect(toast.success).toHaveBeenCalledWith("Andrii's dishes are on your bill");
  });

  it('поки запит триває, перемикач цього гостя вимкнений; після помилки — знову активний', () => {
    const pending = new Subject<GroupSessionsResponse>();
    service.setBillType$.and.returnValue(pending.asObservable());
    const { fixture, element } = create();

    segmentsFor(element, 'Andrii')[0].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.billUpdatingId()).toBe('andrii');
    expect(segmentsFor(element, 'Andrii').every((b) => b.disabled)).toBeTrue();
    expect(segmentsFor(element, 'Olena').every((b) => !b.disabled)).toBeTrue();

    pending.error(new Error('500'));
    fixture.detectChanges();
    expect(fixture.componentInstance.billUpdatingId()).toBe('');
    expect(segmentsFor(element, 'Andrii').every((b) => !b.disabled)).toBeTrue();
  });

  it('після відправки перемикачів немає, лише чипи', () => {
    service.getStatus$.and.returnValue(of({ currentParticipants: 4, maxCapacity: 5, status: 'Submitted' }));
    const { element } = create();
    expect(element.querySelector('.segment')).toBeNull();
    expect(element.textContent).toContain('On your bill');
    expect(element.textContent).toContain('Pays themselves');
  });

  it('не викликає сервіс, якщо тип уже такий самий', () => {
    service.setBillType$.and.returnValue(throwError(() => new Error('should not be called')));
    const { fixture } = create();
    const andrii = SESSIONS.participants[1];
    fixture.componentInstance.changeBillType({ participant: andrii, billType: 'Individual' });
    expect(service.setBillType$).not.toHaveBeenCalled();
  });
});
