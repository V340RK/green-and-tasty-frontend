import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BillType, Participant } from '@app/models/group-orders/participant.model';

export interface BillTypeChange {
  participant: Participant;
  billType: BillType;
}

@Component({
  selector: 'app-participant-card',
  imports: [CurrencyPipe],
  templateUrl: './participant-card.component.html',
  styleUrl: './participant-card.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ParticipantCardComponent {
  readonly participant = input.required<Participant>();
  /** true for the owner's own session — the card is titled "My Pre-Order". */
  readonly isMe = input(false);
  /** Show the "Remove Guest" action (owner, group still open, guest card). */
  readonly canRemove = input(false);
  /** Show who pays for this guest's dishes (owner's screen). */
  readonly showBill = input(false);
  /** Let the owner switch between "I pay" and "Guest pays" (group still open). */
  readonly canChangeBill = input(false);
  /** A bill-type request for this card is in flight — the switch is disabled meanwhile. */
  readonly billUpdating = input(false);
  readonly removeClick = output<Participant>();
  readonly billTypeChange = output<BillTypeChange>();

  readonly title = computed(() => {
    const person = this.participant();
    if (this.isMe()) return 'My Pre-Order';
    return person.type === 'Owner' ? `Owner: ${person.name}` : `Guest: ${person.name}`;
  });

  readonly showRemove = computed(() => this.canRemove() && this.participant().type === 'Guest');

  /** Older backends don't send billType — a guest pays for themselves by default. */
  readonly billType = computed<BillType>(() => this.participant().billType ?? 'Individual');
  readonly showBillBlock = computed(() => this.showBill() && this.participant().type === 'Guest');
  readonly billLabel = computed(() => (this.billType() === 'Shared' ? 'On your bill' : 'Pays themselves'));

  onRemove(): void {
    this.removeClick.emit(this.participant());
  }

  setBillType(billType: BillType): void {
    if (this.billUpdating() || this.billType() === billType) return;
    this.billTypeChange.emit({ participant: this.participant(), billType });
  }
}
