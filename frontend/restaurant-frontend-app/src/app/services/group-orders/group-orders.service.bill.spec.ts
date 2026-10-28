// Власна фіча · хто платить — сервіс. Запуск: npm run test:hw
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '@app/shared/config/api-base-url.token';
import { GroupOrdersService } from './group-orders.service';

describe('Фіча · setBillType$', () => {
  it('PATCH /guest/groups/{id}/sessions/{guestSessionId}/bill-type з { billType }', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: 'https://api.test' }],
    });
    const http = TestBed.inject(HttpTestingController);
    let received: unknown;
    TestBed.inject(GroupOrdersService).setBillType$('grp-1', 'gs-2', 'Shared').subscribe((r) => (received = r));

    const req = http.expectOne('https://api.test/guest/groups/grp-1/sessions/gs-2/bill-type');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ billType: 'Shared' });
    req.flush({ participants: [], total: 0, sharedTotal: 0, individualTotal: 0 });
    expect(received).toEqual({ participants: [], total: 0, sharedTotal: 0, individualTotal: 0 });
    http.verify();
  });
});
