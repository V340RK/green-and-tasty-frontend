import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, exhaustMap, forkJoin, map, of, Subscription, timer } from 'rxjs';
import { BillTypeChange, ParticipantCardComponent } from '@app/components/group-orders/participant-card/participant-card.component';
import { GroupSessionsResponse } from '@app/models/group-orders/group-sessions-response.model';
import { GroupReservationStatus } from '@app/models/group-orders/group-status.model';
import { Participant } from '@app/models/group-orders/participant.model';
import { GuestInvite } from '@app/models/reservations/guest-invite.model';
import { GroupOrdersService } from '@app/services/group-orders/group-orders.service';
import { ToastService } from '@app/services/toast/toast.service';
import { ModalComponent } from '@app/shared/custom-components/modal/modal.component';
import { consolidatePreOrder } from '@app/shared/helpers/consolidate-pre-order';

export const GROUP_ORDER_SYNC_INTERVAL_MS = 15_000;

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** How the Grand Total splits between the owner's bill and guests who pay for themselves (submitted carts only). */
export interface BillSplit {
  /** Owner's own dishes + guests on the owner's bill. */
  shared: number;
  sharedGuests: number;
  /** Guests who pay for their own dishes. */
  individual: number;
  individualGuests: number;
}

@Component({
  selector: 'app-group-order-page',
  imports: [ParticipantCardComponent, ModalComponent, CurrencyPipe, DatePipe],
  templateUrl: './group-order-page.component.html',
  styleUrl: './group-order-page.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class GroupOrderPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly groupOrders = inject(GroupOrdersService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reservationId = this.route.snapshot.paramMap.get('reservationId') ?? '';

  // ----- state -----
  readonly loadState = signal<LoadState>('loading');
  readonly invite = signal<GuestInvite | null>(null);
  readonly groupId = signal('');
  readonly ownerSessionId = signal('');
  readonly participants = signal<Participant[]>([]);
  readonly status = signal<GroupReservationStatus>('Open');

  readonly submitDialogOpen = signal(false);
  readonly submitting = signal(false);

  readonly removeTarget = signal<Participant | null>(null);
  readonly removing = signal(false);

  /** id of the guest whose bill type is being changed right now ('' when idle). */
  readonly billUpdatingId = signal('');

  readonly updatedAt = signal<Date | null>(null);
  readonly refreshFailed = signal(false);
  readonly refreshing = signal(false);

  // ----- derived -----
  readonly consolidated = computed(() => consolidatePreOrder(this.participants()));
  readonly grandTotal = computed(() => this.consolidated().total);
  readonly pendingCount = computed(() => this.participants().filter((person) => !person.isSubmitted).length);
  readonly isEmpty = computed(() => this.participants().every((person) => person.items.length === 0));
  readonly isSubmitted = computed(() => this.status() !== 'Open');
  readonly canSubmit = computed(() => !this.isSubmitted() && !this.submitting() && this.consolidated().items.length > 0);
  readonly statusLabel = computed(() => (this.status() === 'Open' ? 'Collecting pre-orders' : 'Sent to Restaurant'));
  readonly guestsLabel = computed(() => {
    const max = this.invite()?.MaxGuestCount ?? 0;
    return `${this.participants().length} of ${max} guests`;
  });
  readonly hasGuests = computed(() => this.participants().some((person) => person.type === 'Guest'));
  readonly billSplit = computed<BillSplit>(() => {
    const split: BillSplit = { shared: 0, sharedGuests: 0, individual: 0, individualGuests: 0 };
    for (const person of this.participants().filter((candidate) => candidate.isSubmitted)) {
      const onOwnersBill = person.type === 'Owner' || person.billType === 'Shared';
      if (onOwnersBill) {
        split.shared += person.total;
        if (person.type === 'Guest') split.sharedGuests += 1;
      } else {
        split.individual += person.total;
        split.individualGuests += 1;
      }
    }
    return split;
  });

  private syncSubscription: Subscription | null = null;

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.stopSync();
  }

  load(): void {
    this.loadState.set('loading');
    this.stopSync();

    this.groupOrders
      .getGroupInvite$(this.reservationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invite) => {
          this.invite.set(invite);
          this.groupId.set(invite.GroupReservationId);
          this.loadGroupData(invite.GroupReservationId);
        },
        error: (error: unknown) => this.loadState.set(this.isNotFound(error) ? 'not-found' : 'error'),
      });
  }

  private loadGroupData(groupId: string): void {
    forkJoin({
      sessions: this.groupOrders.getSessions$(groupId),
      ownerSessionId: this.groupOrders.getOwnerSessionId$(this.reservationId),
      status: this.groupOrders.getStatus$(groupId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ sessions, ownerSessionId, status }) => {
          this.applySessions(sessions);
          this.ownerSessionId.set(ownerSessionId);
          this.status.set(status.status);
          this.loadState.set('ready');
          this.startSync();
        },
        error: (error: unknown) => this.loadState.set(this.isNotFound(error) ? 'not-found' : 'error'),
      });
  }

  // ----- background sync (level 3) -----
  private startSync(): void {
    this.stopSync();
    if (this.isSubmitted()) return;

    this.syncSubscription = timer(GROUP_ORDER_SYNC_INTERVAL_MS, GROUP_ORDER_SYNC_INTERVAL_MS)
      .pipe(exhaustMap(() => this.refresh$()))
      .subscribe();
  }

  private stopSync(): void {
    this.syncSubscription?.unsubscribe();
    this.syncSubscription = null;
  }

  refresh(): void {
    if (this.refreshing()) return;
    this.refresh$().subscribe();
  }

  private refresh$() {
    const groupId = this.groupId();
    this.refreshing.set(true);
    return forkJoin({
      sessions: this.groupOrders.getSessions$(groupId, { silent: true }),
      status: this.groupOrders.getStatus$(groupId, { silent: true }),
    }).pipe(
      map(({ sessions, status }) => {
        this.applySessions(sessions);
        this.status.set(status.status);
        this.refreshFailed.set(false);
        if (this.isSubmitted()) this.stopSync();
        return true;
      }),
      catchError(() => {
        this.refreshFailed.set(true);
        return of(false);
      }),
      map((result) => {
        this.refreshing.set(false);
        return result;
      }),
    );
  }

  private applySessions(sessions: GroupSessionsResponse): void {
    this.participants.set(sessions.participants);
    this.updatedAt.set(new Date());
  }

  // ----- submit (level 2) -----
  openSubmitDialog(): void {
    if (this.canSubmit()) this.submitDialogOpen.set(true);
  }

  closeSubmitDialog(): void {
    if (!this.submitting()) this.submitDialogOpen.set(false);
  }

  confirmSubmit(): void {
    if (this.submitting() || this.isSubmitted()) return;
    this.submitting.set(true);

    this.groupOrders
      .submit$(this.groupId(), this.reservationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.submitDialogOpen.set(false);
          this.status.set('Submitted');
          this.stopSync();
          this.toast.success('Pre-order sent to the restaurant');
        },
        // the toast is already shown by tokenInterceptor — just make the button usable again
        error: () => {
          this.submitting.set(false);
          this.submitDialogOpen.set(false);
        },
      });
  }

  // ----- remove guest (level 3 bonus) -----
  askRemove(participant: Participant): void {
    if (!this.isSubmitted()) this.removeTarget.set(participant);
  }

  cancelRemove(): void {
    if (!this.removing()) this.removeTarget.set(null);
  }

  confirmRemove(): void {
    const target = this.removeTarget();
    if (!target || this.removing()) return;
    this.removing.set(true);

    this.groupOrders
      .removeSession$(this.groupId(), target.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sessions) => {
          this.applySessions(sessions);
          this.removing.set(false);
          this.removeTarget.set(null);
          this.toast.success(`${target.name} removed from the reservation`);
        },
        error: () => {
          this.removing.set(false);
          this.removeTarget.set(null);
        },
      });
  }

  // ----- who pays for a guest (own feature) -----
  changeBillType({ participant, billType }: BillTypeChange): void {
    if (this.isSubmitted() || this.billUpdatingId() || participant.type !== 'Guest') return;
    if ((participant.billType ?? 'Individual') === billType) return;
    this.billUpdatingId.set(participant.id);

    this.groupOrders
      .setBillType$(this.groupId(), participant.id, billType)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sessions) => {
          this.applySessions(sessions);
          this.billUpdatingId.set('');
          this.toast.success(
            billType === 'Shared'
              ? `${participant.name}'s dishes are on your bill`
              : `${participant.name} will pay for their own dishes`,
          );
        },
        error: () => this.billUpdatingId.set(''),
      });
  }

  private isNotFound(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 404;
  }
}
