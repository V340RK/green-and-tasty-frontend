import { DEMO_RESERVATION_ID, GroupOrdersMockStore, MockHttpError } from './group-orders.mock-store';

describe('GroupOrdersMockStore', () => {
  let store: GroupOrdersMockStore;
  beforeEach(() => (store = new GroupOrdersMockStore()));

  it('returns totals per participant and for the whole group', () => {
    const snapshot = store.snapshot();
    expect(snapshot.participants.map((p) => p.total)).toEqual([26.5, 24, 24, 0]);
    expect(snapshot.total).toBe(74.5);
  });

  it('submits only submitted sessions, merged by dishId', () => {
    expect(store.submit(DEMO_RESERVATION_ID)).toEqual([
      { dishId: 'dish-spring-salad', quantity: 3 },
      { dishId: 'dish-avocado-bowl', quantity: 1 },
    ]);
    expect(store.groupStatus().status).toBe('Submitted');
  });

  it('rejects a second submit with 400', () => {
    store.submit(DEMO_RESERVATION_ID);
    expect(() => store.submit(DEMO_RESERVATION_ID)).toThrow(new MockHttpError(400, 'Group reservation was submitted.'));
  });

  it('removes a guest and returns an updated snapshot', () => {
    const snapshot = store.remove('gs-mariia');
    expect(snapshot.participants.length).toBe(3);
    expect(snapshot.total).toBe(50.5);
  });

  it('returns 404 for an unknown session', () => {
    expect(() => store.remove('nope')).toThrowMatching((e) => e instanceof MockHttpError && e.status === 404);
  });

  it('splits the total into the owner bill and guests paying for themselves', () => {
    const snapshot = store.snapshot();
    expect(snapshot.sharedTotal).toBe(50.5);
    expect(snapshot.individualTotal).toBe(24);
  });

  it('moves a guest between bills and recalculates the split', () => {
    const snapshot = store.setBillType('gs-mariia', 'Shared');
    expect(snapshot.participants.find((p) => p.id === 'gs-mariia')?.billType).toBe('Shared');
    expect(snapshot.sharedTotal).toBe(74.5);
    expect(snapshot.individualTotal).toBe(0);
  });

  it('rejects bill changes for the owner (400) and after submit (409)', () => {
    expect(() => store.setBillType('gs-owner', 'Individual')).toThrowMatching((e) => e instanceof MockHttpError && e.status === 400);
    store.submit(DEMO_RESERVATION_ID);
    expect(() => store.setBillType('gs-kateryna', 'Individual')).toThrowMatching((e) => e instanceof MockHttpError && e.status === 409);
  });
});
