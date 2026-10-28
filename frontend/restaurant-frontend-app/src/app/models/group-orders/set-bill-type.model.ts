import { BillType } from './participant.model';

/** PATCH /guest/groups/{groupReservationId}/sessions/{guestSessionId}/bill-type */
export interface SetBillTypeRequest {
  billType: BillType;
}
