export interface InventoryEvent {
  id: number;
  folio: string;
  scheduledDate: string;
  executionDate: string | null;
  category: string;
  status: string;
  storeCode: string;
  storeName: string;
  coordinatorName: string;
  analystName: string;
}
