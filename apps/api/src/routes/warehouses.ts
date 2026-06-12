import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';

export const warehousesRouter = Router();
warehousesRouter.use(requireAuth);

const warehouseInput = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

warehousesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { name: 'asc' },
    });
    res.json(warehouses);
  }),
);

// GET /api/warehouses/:id — warehouse + computed metrics, stock, recent movements
warehousesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: req.params.id, companyId },
    });
    if (!warehouse) throw notFound('Warehouse not found');

    const [stockLevels, openPoCount, recentMovements] = await Promise.all([
      prisma.stockLevel.findMany({
        where: { warehouseId: warehouse.id },
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true, unitCost: true } },
        },
        orderBy: { quantity: 'desc' },
      }),
      prisma.purchaseOrder.count({
        where: {
          companyId,
          warehouseId: warehouse.id,
          status: { in: ['AWAITING_CONFIRMATION', 'ORDERED', 'PARTIALLY_RECEIVED'] },
        },
      }),
      prisma.stockMovement.findMany({
        where: { warehouseId: warehouse.id, product: { companyId } },
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { sku: true, name: true } },
          user: { select: { name: true } },
        },
      }),
    ]);

    const unitsOnHand = stockLevels.reduce((s, l) => s + l.quantity, 0);
    const inventoryValue = stockLevels.reduce((s, l) => s + l.quantity * l.product.unitCost, 0);
    const skuCount = stockLevels.filter((l) => l.quantity !== 0).length;

    res.json({
      ...warehouse,
      metrics: { skuCount, unitsOnHand, inventoryValue, openPoCount },
      stock: stockLevels.map((l) => ({
        productId: l.productId,
        sku: l.product.sku,
        name: l.product.name,
        unit: l.product.unit,
        quantity: l.quantity,
      })),
      recentMovements,
    });
  }),
);

warehousesRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const data = parse(warehouseInput, req.body);
    const warehouse = await prisma.warehouse.create({
      data: { ...data, companyId: req.user!.companyId },
    });
    res.status(201).json(warehouse);
  }),
);

warehousesRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.warehouse.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true },
    });
    if (!existing) throw notFound('Warehouse not found');
    const data = parse(warehouseInput.partial(), req.body);
    const warehouse = await prisma.warehouse.update({ where: { id: req.params.id }, data });
    res.json(warehouse);
  }),
);
