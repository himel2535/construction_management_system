import { z } from "zod";

// Customer / Client Schema
export const ClientSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  companyName: z.string().optional().default(""),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  contactPerson: z.string().optional().default(""),
  contractRef: z.string().optional().default(""),
  portalAccessEnabled: z.boolean().optional().default(false),
  status: z.enum(["active", "inactive", "lead"]).default("active"),
  clientType: z.string().optional().default("private"),
  totalProjects: z.number().optional().default(0),
  totalBilled: z.number().optional().default(0),
  projectId: z.string().optional().default(""),
  nid: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type Client = z.infer<typeof ClientSchema>;

// Project Schema
export const ProjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Project name is required"),
  code: z.string().optional().default(""),
  projectType: z.string().optional().default("private"),
  clientId: z.string().optional().default(""),
  clientName: z.string().optional().default(""),
  status: z.enum(["planning", "ongoing", "in-progress", "completed", "on-hold", "closed", "archived", "delayed"]).default("planning"),
  progressPercent: z.number().min(0).max(100).default(0),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  contractValue: z.number().or(z.string().transform(v => parseFloat(v) || 0)).default(0),
  projectManagerId: z.string().optional().default(""),
  details: z.any().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type Project = z.infer<typeof ProjectSchema>;

// Purchase Schema
export const PurchaseSchema = z.object({
  id: z.string().optional(),
  supplierId: z.string().optional().default(""),
  supplierName: z.string().min(1, "Supplier name is required"),
  projectId: z.string().optional().default(""),
  projectName: z.string().optional().default(""),
  totalAmount: z.number().default(0),
  status: z.enum(["pending", "approved", "fulfilled", "cancelled"]).default("pending"),
  orderDate: z.string().optional().default(""),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
  })).optional().default([]),
  createdAt: z.number().optional(),
});

export type Purchase = z.infer<typeof PurchaseSchema>;

// Supplier Schema
export const SupplierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Supplier name is required"),
  company: z.string().optional().default(""),
  category: z.string().optional().default("General"),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  rating: z.number().optional().default(5),
  status: z.enum(["active", "inactive"]).default("active"),
  createdAt: z.number().optional(),
});

export type Supplier = z.infer<typeof SupplierSchema>;

// Worker Schema
export const WorkerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Worker name is required"),
  role: z.string().default("Laborer"),
  phone: z.string().optional().default(""),
  dailyRate: z.number().default(0),
  status: z.enum(["active", "inactive", "on-leave"]).default("active"),
  skillLevel: z.string().optional().default("Skilled"),
  createdAt: z.number().optional(),
});

export type Worker = z.infer<typeof WorkerSchema>;

// Inventory Item Schema
export const InventoryItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, "Item name is required"),
  category: z.string().default("Materials"),
  quantity: z.number().default(0),
  unit: z.string().default("pcs"),
  unitPrice: z.number().default(0),
  minStock: z.number().default(10),
  status: z.enum(["in-stock", "low-stock", "out-of-stock"]).default("in-stock"),
  createdAt: z.number().optional(),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;
