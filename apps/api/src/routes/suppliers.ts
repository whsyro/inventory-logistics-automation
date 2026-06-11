import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

const supplierInput = z.object({
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  productIds: z.array(z.string()).optional(),
});

/**
 * Make the supplier's product set exactly `productIds` (within this company):
 * link the listed products, unlink ones removed. Only ever touches this
 * company's products.
 */
async function syncSupplierProducts(
  tx: Prisma.TransactionClient,
  supplierId: string,
  companyId: string,
  productIds: string[],
) {
  await tx.product.updateMany({
    where: { supplierId, companyId, id: { notIn: productIds } },
    data: { supplierId: null },
  });
  if (productIds.length) {
    await tx.product.updateMany({
      where: { id: { in: productIds }, companyId },
      data: { supplierId },
    });
  }
}

suppliersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { products: true, purchaseOrders: true } },
        products: {
          where: { isActive: true },
          select: { id: true, sku: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    res.json(suppliers);
  }),
);

suppliersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: { products: { select: { id: true, sku: true, name: true } } },
    });
    if (!supplier) throw notFound('Supplier not found');
    res.json(supplier);
  }),
);

suppliersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const { productIds, ...data } = parse(supplierInput, req.body);
    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({ data: { ...data, companyId } });
      if (productIds) await syncSupplierProducts(tx, created.id, companyId, productIds);
      return created;
    });
    res.status(201).json(supplier);
  }),
);

suppliersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const existing = await prisma.supplier.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true },
    });
    if (!existing) throw notFound('Supplier not found');

    const { productIds, ...data } = parse(supplierInput.partial(), req.body);
    const supplier = await prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({ where: { id: req.params.id }, data });
      if (productIds) await syncSupplierProducts(tx, req.params.id, companyId, productIds);
      return updated;
    });
    res.json(supplier);
  }),
);
