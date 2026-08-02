import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MODEL_MAP: Record<string, string> = {
  projects: 'project',
  clients: 'clientRecord',
  clientRecords: 'clientRecord',
  milestones: 'projectMilestone',
  projectMilestones: 'projectMilestone',
  materialRequests: 'materialRequest',
  purchaseOrders: 'purchaseOrder',
  goodsReceipts: 'goodsReceipt',
  suppliers: 'supplier',
  inventoryItems: 'inventoryItem',
  clientInvoices: 'clientInvoice',
  approvalQueue: 'approvalQueueRow',
  approvalQueueRows: 'approvalQueueRow',
  siteInCharges: 'siteInCharge',
  assignments: 'assignment',
  materialLogs: 'materialLog',
  siteMaterialLogs: 'materialLog',
  siteSettlements: 'siteSettlement',
  siteDiaries: 'siteDiary',
  workers: 'worker',
  payrollEntries: 'payrollEntry',
  companyProfile: 'companyProfile',
  users: 'user',
};

@Injectable()
export class ApiService {
  constructor(private prisma: PrismaService) {}

  private getModel(collection: string) {
    const modelName = MODEL_MAP[collection] || collection;
    const model = (this.prisma as any)[modelName];
    if (!model) {
      throw new BadRequestException(`Unknown collection: ${collection}`);
    }
    return model;
  }

  async getList(collection: string, filter: any = {}) {
    const model = this.getModel(collection);
    return model.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(collection: string, id: string) {
    const model = this.getModel(collection);
    const item = await model.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Item ${id} not found in ${collection}`);
    }
    return item;
  }

  async create(collection: string, data: any) {
    const model = this.getModel(collection);
    const cleanData = { ...data };
    delete cleanData.id;
    delete cleanData.createdAt;
    delete cleanData.updatedAt;
    return model.create({ data: cleanData });
  }

  async update(collection: string, id: string, data: any) {
    const model = this.getModel(collection);
    const cleanData = { ...data };
    delete cleanData.id;
    delete cleanData.createdAt;
    delete cleanData.updatedAt;
    return model.update({
      where: { id },
      data: cleanData,
    });
  }

  async remove(collection: string, id: string) {
    const model = this.getModel(collection);
    return model.delete({ where: { id } });
  }
}
