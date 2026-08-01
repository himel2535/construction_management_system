export type UserRole =
  | "owner"
  | "project_manager"
  | "site_engineer"
  | "site_supervisor"
  | "accountant"
  | "procurement_officer"
  | "client"
  | "viewer"
  | "manager";

export interface DemoUser {
  id: string;
  role: UserRole;
  displayName: string;
  email: string;
  clientId?: string;
  tenantId?: string;
  active?: boolean;
}

export interface Project {
  id: string;
  name: string;
  code?: string;
  projectType?: string;
  status: "ongoing" | "completed" | "delayed" | "draft" | "planning" | "closed";
  progressPercent?: number;
  startDate?: string;
  endDate?: string;
  contractValue?: number;
  clientId?: string;
  clientName?: string;
  projectManagerId?: string;
  ownerId?: string;
  workOrderNo?: string;
}

export interface ClientRecord {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  contactPerson?: string;
  address?: string;
  contractRef?: string;
  portalAccessEnabled?: boolean;
}

export interface MaterialRequest {
  id: string;
  projectId: string;
  title: string;
  boqId?: string;
  qty?: number;
  amount?: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "closed";
  requestType?: string;
  deliveryStatus?: "requested" | "ordered" | "delivered" | "partial";
  costCategory?: string;
  createdAt?: number;
  createdBy?: string;
}

export interface PurchaseOrder {
  id: string;
  projectId: string;
  mrId?: string;
  vendorId?: string;
  vendorName?: string;
  amount?: number;
  status: "draft" | "submitted" | "approved" | "rejected" | "closed";
  billNo?: string;
  createdAt?: number;
  createdBy?: string;
  items?: Array<{ productName: string; qty: number; unitPrice: number }>;
}

export interface GoodsReceipt {
  id: string;
  projectId: string;
  poId: string;
  amount?: number;
  receiptDate?: string;
  status?: string;
  centralStockPosted?: boolean;
  receiveLines?: Array<{ productName: string; qty: number; unitPrice?: number }>;
}

export interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
  status?: "active" | "inactive";
  paymentTermsDays?: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  code?: string;
  category?: string;
  unit?: string;
  currentStock?: number;
  reorderLevel?: number;
  unitPrice?: number;
}

export interface ClientInvoice {
  id: string;
  projectId: string;
  projectName?: string;
  clientId: string;
  amount: number;
  paidAmount?: number;
  dueDate?: string;
  billDate?: string;
  status: "draft" | "submitted" | "approved" | "paid" | "overdue" | "cancelled";
  billType?: string;
}

export interface ProjectMilestone {
  id: string;
  projectId: string;
  projectName?: string;
  title: string;
  plannedDate?: string;
  status: "pending" | "completed" | "delayed" | "in_progress";
  ownerId?: string;
}

export interface ApprovalQueueRow {
  id: string;
  entityType: string;
  entityId: string;
  projectId?: string;
  title: string;
  path: string;
  status: "pending" | "approved" | "rejected" | "cleared";
  submittedBy?: string;
  submittedAt?: number;
}
