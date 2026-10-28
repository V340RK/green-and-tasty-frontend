export type ParticipantType = 'Owner' | 'Guest';

/** Who pays for the participant's dishes: the guest themselves (Individual) or the reservation owner (Shared). */
export type BillType = 'Individual' | 'Shared';

export interface DishShort {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
  weight?: string;
}

export interface ParticipantItem {
  dish: DishShort;
  quantity: number;
}

export interface Participant {
  id: string;
  type: ParticipantType;
  name: string;
  items: ParticipantItem[];
  total: number;
  isSubmitted: boolean;
  /** Missing on older backends — treated as 'Individual'. The owner's own session is always 'Shared'. */
  billType?: BillType;
}
