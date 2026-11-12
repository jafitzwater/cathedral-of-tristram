// Starting and Cathedral-tier base items, D1 v1.09. Source: [DEVIL] itemdat.cpp AllItemsList.
export type Slot = 'onehand' | 'twohand' | 'helm' | 'armor' | 'belt';
export interface ItemDef {
  id: string; name: string; slot: Slot; qlvl: number; dur: number;
  dmg?: [number, number]; ac?: [number, number];
  req?: { str?: number; mag?: number; dex?: number };
  value: number; spell?: string; charges?: number;
}

export const ITEMS: Record<string, ItemDef> = {
  short_sword: { id: 'short_sword', name: 'Short Sword', slot: 'onehand', qlvl: 2, dur: 20, dmg: [2, 6], req: { str: 18 }, value: 50 },
  buckler: { id: 'buckler', name: 'Buckler', slot: 'onehand', qlvl: 2, dur: 10, ac: [3, 3], value: 50 },
  club: { id: 'club', name: 'Club', slot: 'onehand', qlvl: 1, dur: 20, dmg: [1, 6], value: 20 },
  short_bow: { id: 'short_bow', name: 'Short Bow', slot: 'twohand', qlvl: 1, dur: 30, dmg: [1, 4], value: 100 },
  // Starting staff: 40 charges is [TEMP] (CreatePlrItems sets charges; not confirmed here).
  short_staff_cbolt: { id: 'short_staff_cbolt', name: 'Short Staff of Charged Bolt', slot: 'twohand', qlvl: 1, dur: 25, dmg: [2, 4], req: { mag: 20 }, value: 520, spell: 'charged_bolt', charges: 40 },
  dagger: { id: 'dagger', name: 'Dagger', slot: 'onehand', qlvl: 1, dur: 16, dmg: [1, 4], value: 60 },
  cap: { id: 'cap', name: 'Cap', slot: 'helm', qlvl: 1, dur: 15, ac: [1, 3], value: 15 },
  rags: { id: 'rags', name: 'Rags', slot: 'armor', qlvl: 1, dur: 6, ac: [2, 6], value: 5 },
  quilted_armor: { id: 'quilted_armor', name: 'Quilted Armor', slot: 'armor', qlvl: 4, dur: 30, ac: [7, 10], value: 200 },
  potion_healing: { id: 'potion_healing', name: 'Potion of Healing', slot: 'belt', qlvl: 0, dur: 0, value: 50 },
  potion_mana: { id: 'potion_mana', name: 'Potion of Mana', slot: 'belt', qlvl: 0, dur: 0, value: 50 },
};
// value = iValue (iMaxValue is the top of the random price range for cap/rags/quilted).
