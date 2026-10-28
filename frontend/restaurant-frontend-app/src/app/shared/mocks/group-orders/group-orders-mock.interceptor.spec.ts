import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { groupOrdersMockInterceptor, groupOrdersMockStore } from './group-orders-mock.interceptor';

describe('groupOrdersMockInterceptor', () => {
  let http: HttpClient;

  beforeEach(() => {
    groupOrdersMockStore.reset();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([groupOrdersMockInterceptor]))] });
    http = TestBed.inject(HttpClient);
  });

  it('PATCH …/sessions/{id}/bill-type extracts the session id from a full URL', async () => {
    const snapshot = await new Promise<GroupSessionsResponse>((resolve, reject) =>
      http
        .patch<GroupSessionsResponse>(
          'https://api.example.com/develop/guest/groups/demo-group/sessions/gs-kateryna/bill-type',
          { billType: 'Individual' },
        )
        .subscribe({ next: resolve, error: reject }),
    );
    expect(snapshot.participants.find((p) => p.id === 'gs-kateryna')?.billType).toBe('Individual');
    expect(snapshot.sharedTotal).toBe(26.5);
  });

  it('DELETE …/sessions/{id} extracts the session id from a full URL', async () => {
    const snapshot = await new Promise<GroupSessionsResponse>((resolve, reject) =>
      http
        .delete<GroupSessionsResponse>('https://api.example.com/develop/guest/groups/demo-group/sessions/gs-mariana')
        .subscribe({ next: resolve, error: reject }),
    );
    expect(snapshot.participants.map((p) => p.id)).not.toContain('gs-mariana');
  });
});
