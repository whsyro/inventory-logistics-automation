import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { applyStockChange } from '../lib/inventory.js';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

/** Verify a product belongs to the company. */
async function assertProduct(productId: string, companyId: string) {
  const p = await prisma.product.findFirst({ where: { id: productId, companyId }, select: { id: true } });
  if (!p) throw badRequest('Unknown product');
}
/** Verify a warehouse belongs to the company. */
async function assertWarehouse(warehouseId: string, companyId: string) {
  const w = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true } });
  if (!w) throw badRequest('Unknown warehouse');
}

// GET /api/inventory  — flattened stock levels (scoped to company via product)
inventoryRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const warehouseId =
      typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;

    const levels = await prisma.stockLevel.findMany({
      where: { product: { companyId }, ...(warehouseId ? { warehouseId } : {}) },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            reorderPoint: true,
            supplier: { select: { id: true, name: true } },
          },
        },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ product: { name: 'asc' } }],
    });
    res.json(levels);
  }),
);

const adjustSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  delta: z.coerce.number().int().refine((n) => n !== 0, 'delta cannot be zero'),
  reason: z.string().optional().nullable(),
});

// POST /api/inventory/adjust
inventoryRouter.post(
  '/adjust',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const { productId, warehouseId, delta, reason } = parse(adjustSchema, req.body);
    await assertProduct(productId, companyId);
    await assertWarehouse(warehouseId, companyId);

    const level = await prisma.$transaction((tx) =>
      applyStockChange(tx, {
        productId,
        warehouseId,
        delta,
        type: 'ADJUSTMENT',
        reason,
        userId: req.user?.id,
      }),
    );
    res.status(201).json(level);
  }),
);

const transferSchema = z.object({
  productId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  reason: z.string().optional().nullable(),
});

// POST /api/inventory/transfer  (ADMIN, MANAGER)
inventoryRouter.post(
  '/transfer',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const { productId, fromWarehouseId, toWarehouseId, quantity, reason } = parse(
      transferSchema,
      req.body,
    );
    await assertProduct(productId, companyId);
    await assertWarehouse(fromWarehouseId, companyId);
    await assertWarehouse(toWarehouseId, companyId);

    await prisma.$transaction(async (tx) => {
      await applyStockChange(tx, {
        productId,
        warehouseId: fromWarehouseId,
        delta: -quantity,
        type: 'TRANSFER_OUT',
        reason,
        userId: req.user?.id,
      });
      await applyStockChange(tx, {
        productId,
        warehouseId: toWarehouseId,
        delta: quantity,
        type: 'TRANSFER_IN',
        reason,
        userId: req.user?.id,
      });
    });
    res.status(201).json({ ok: true });
  }),
);

// GET /api/inventory/movements?productId=&warehouseId=&limit=
inventoryRouter.get(
  '/movements',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const warehouseId =
      typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const movements = await prisma.stockMovement.findMany({
      where: { product: { companyId }, productId, warehouseId },
      include: {
        product: { select: { sku: true, name: true } },
        warehouse: { select: { code: true, name: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(movements);
  }),
);
