// Власна фіча · хто платить за гостя (картка учасника). Запуск: npm run test:hw
import { TestBed } from '@angular/core/testing';
import { Participant } from '@app/models/group-orders/participant.model';
import { BillTypeChange, ParticipantCardComponent } from './participant-card.component';

const GUEST: Participant = {
  id: 'kateryna',
  type: 'Guest',
  name: 'Kateryna',
  isSubmitted: true,
  total: 24,
  billType: 'Individual',
  items: [{ dish: { id: 'spring', name: 'Spring Salad', price: 12 }, quantity: 2 }],
};
const OWNER: Participant = { id: 'owner', type: 'Owner', name: 'Yevhenii', isSubmitted: true, total: 0, billType: 'Shared', items: [] };

function render(participant: Participant, inputs: Record<string, unknown> = {}) {
  const fixture = TestBed.createComponent(ParticipantCardComponent);
  fixture.componentRef.setInput('participant', participant);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

const pressed = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLButtonElement>('.segment')].map((b) => `${b.textContent?.trim()}:${b.getAttribute('aria-pressed')}`);

describe('Фіча · хто платить (картка)', () => {
  it('без showBill блок «Who pays» не показується', () => {
    expect(render(GUEST).element.textContent).not.toContain('Who pays');
  });

  it('у власника блоку немає навіть із showBill', () => {
    expect(render(OWNER, { showBill: true }).element.textContent).not.toContain('Who pays');
  });

  it('гість, група відкрита: перемикач «I pay» / «Guest pays», активний — поточний billType', () => {
    const { element } = render(GUEST, { showBill: true, canChangeBill: true });
    expect(pressed(element)).toEqual(['I pay:false', 'Guest pays:true']);
    expect(element.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Who pays for Kateryna');
  });

  it('без billType від бекенду гість платить сам', () => {
    const { element } = render({ ...GUEST, billType: undefined }, { showBill: true, canChangeBill: true });
    expect(pressed(element)).toEqual(['I pay:false', 'Guest pays:true']);
  });

  it('клік по іншому варіанту емітить billTypeChange, клік по поточному — ні', () => {
    const { fixture, element } = render(GUEST, { showBill: true, canChangeBill: true });
    const emitted: BillTypeChange[] = [];
    fixture.componentInstance.billTypeChange.subscribe((change) => emitted.push(change));

    const [iPay, guestPays] = [...element.querySelectorAll<HTMLButtonElement>('.segment')];
    guestPays.click();
    expect(emitted.length).toBe(0);
    iPay.click();
    expect(emitted).toEqual([{ participant: GUEST, billType: 'Shared' }]);
  });

  it('поки запит триває (billUpdating) кнопки вимкнені', () => {
    const { element } = render(GUEST, { showBill: true, canChangeBill: true, billUpdating: true });
    expect([...element.querySelectorAll<HTMLButtonElement>('.segment')].every((b) => b.disabled)).toBeTrue();
  });

  it('після відправки (canChangeBill=false) — лише текстовий чип', () => {
    const shared = render({ ...GUEST, billType: 'Shared' }, { showBill: true }).element;
    expect(shared.querySelector('.segment')).toBeNull();
    expect(shared.textContent).toContain('On your bill');
    expect(render(GUEST, { showBill: true }).element.textContent).toContain('Pays themselves');
  });
});
