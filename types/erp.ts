export type TenantId = "tn_default" | "tn_lakeview" | string;

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "accountant" | "site_incharge" | "procurement" | "client";
  tenantId: TenantId;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  type: "government" | "private";
  status: "planning" | "active" | "completed" | "on_hold";
  location: string;
  clientName?: string;
  contractValue: number;
  startDate: string;
  estimatedEndDate: string;
  tenantId: TenantId;
  createdAt: number;
  updatedAt: number;
  boqBudget?: number;
  spentAmount?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  address?: string;
  totalProjects?: number;
  outstandingBalance?: number;
  tenantId: TenantId;
  createdAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  category: string;
  email?: string;
  address?: string;
  outstandingBalance: number;
  tenantId: TenantId;
  createdAt: number;
}

export interface Worker {
  id: string;
  name: string;
  skill: string;
  dailyRate: number;
  phone: string;
  status: "active" | "inactive";
  tenantId: TenantId;
  createdAt: number;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  reorderLevel: number;
  tenantId: TenantId;
  updatedAt: number;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  balance: number;
  parentId?: string;
  tenantId?: TenantId;
}

export interface VoucherLine {
  accountId: string;
  debit: number;
  credit: number;
}

export interface Voucher {
  id: string;
  voucherNo: string;
  date: string;
  type: "payment" | "receipt" | "journal";
  narration: string;
  lines: VoucherLine[];
  refType?: string;
  refId?: string;
  projectId?: string;
  supplierId?: string;
  tenantId: TenantId;
  createdAt: number;
}
