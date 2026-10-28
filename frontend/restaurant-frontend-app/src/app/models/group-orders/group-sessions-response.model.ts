import { Participant } from './participant.model';

/** GET /guest/groups/{groupReservationId}/sessions */
export interface GroupSessionsResponse {
  participants: Participant[];
  /** Сума ВСІХ учасників, включно з тими, хто ще не підтвердив кошик. */
  total: number;
  /** Частина `total`, яку платить власник (його сесія + гості з billType 'Shared'). */
  sharedTotal?: number;
  /** Частина `total`, яку гості платять самі (billType 'Individual'). */
  individualTotal?: number;
}
