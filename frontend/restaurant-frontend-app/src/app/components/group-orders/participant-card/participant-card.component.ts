import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Participant } from '@app/models/group-orders/participant.model';

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
  readonly removeClick = output<Participant>();

  readonly title = computed(() => {
    const person = this.participant();
    if (this.isMe()) return 'My Pre-Order';
    return person.type === 'Owner' ? `Owner: ${person.name}` : `Guest: ${person.name}`;
  });

  readonly showRemove = computed(() => this.canRemove() && this.participant().type === 'Guest');

  onRemove(): void {
    this.removeClick.emit(this.participant());
  }
}
