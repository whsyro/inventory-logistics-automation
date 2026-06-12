import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { applyStockChange } from '../lib/inventory.js';

export const shipmentsRouter = Router();
shipmentsRouter.use(requireAuth);

type Tx = Prisma.TransactionClient | PrismaClient;

/** Next sequential shipment number within a company, e.g. SH-0007. */
async function nextShipmentNumber(tx: Tx, companyId: string): Promise<string> {
  const last = await tx.shipment.findFirst({
    where: { companyId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const n = last ? parseInt(last.number.replace(/\D/g, ''), 10) + 1 : 1;
  return `SH-${String(n).padStart(4, '0')}`;
}

/** Verify the warehouse, carrier + products belong to the company. */
async function assertRefs(
  companyId: string,
  warehouseId: string | undefined,
  carrierId: string | null | undefined,
  productIds: string[],
) {
  if (warehouseId) {
    const wh = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true } });
    if (!wh) throw badRequest('Unknown warehouse');
  }
  if (carrierId) {
    const c = await prisma.carrier.findFirst({ where: { id: carrierId, companyId }, select: { id: true } });
    if (!c) throw badRequest('Unknown carrier');
  }
  const unique = [...new Set(productIds)];
  if (unique.length) {
    const ok = await prisma.product.count({ where: { id: { in: unique }, companyId } });
    if (ok !== unique.length) throw badRequest('One or more products are invalid');
  }
}

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
});

const createSchema = z.object({
  warehouseId: z.string().min(1),
  customerName: z.string().min(1),
  address: z.string().optional().nullable(),
  carrierId: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  freightCost: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  items: z.array(lineSchema).min(1, 'A shipment needs at least one line item'),
});

const updateSchema = z.object({
  warehouseId: z.string().min(1).optional(),
  customerName: z.string().min(1).optional(),
  address: z.string().optional().nullable(),
  carrierId: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  freightCost: z.coerce.number().min(0).optional(),
  notes: z.string().optional().nullable(),
  items: z.array(lineSchema).min(1).optional(),
});

const shipSchema = z.object({
  carrierId: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  freightCost: z.coerce.number().min(0).optional(),
});

const trackingSchema = z.object({
  carrierId: z.string().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  freightCost: z.coerce.number().min(0).optional(),
});

// GET /api/shipments
shipmentsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const shipments = await prisma.shipment.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        carrier: { select: { id: true, name: true } },
        items: { select: { quantity: true } },
      },
    });
    const result = shipments.map(({ items, ...s }) => ({
      ...s,
      itemCount: items.length,
      totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
    }));
    res.json(result);
  }),
);

// GET /api/shipments/:id
shipmentsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const shipment = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        carrier: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        items: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
      },
    });
    if (!shipment) throw notFound('Shipment not found');
    res.json(shipment);
  }),
);

// POST /api/shipments  (ADMIN, MANAGER) — create a PENDING shipment
shipmentsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const data = parse(createSchema, req.body);
    await assertRefs(companyId, data.warehouseId, data.carrierId, data.items.map((i) => i.productId));

    const shipment = await prisma.$transaction(async (tx) => {
      const number = await nextShipmentNumber(tx, companyId);
      return tx.shipment.create({
        data: {
          number,
          companyId,
          warehouseId: data.warehouseId,
          customerName: data.customerName,
          address: data.address ?? null,
          carrierId: data.carrierId ?? null,
          trackingNumber: data.trackingNumber ?? null,
          freightCost: data.freightCost,
          notes: data.notes ?? null,
          createdById: req.user?.id,
          items: { create: data.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
        },
        include: { items: true },
      });
    });
    res.status(201).json(shipment);
  }),
);

// PUT /api/shipments/:id  (ADMIN, MANAGER) — edit a PENDING shipment only
shipmentsRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const existing = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw notFound('Shipment not found');
    if (existing.status !== 'PENDING') throw badRequest('Only pending shipments can be edited');

    const data = parse(updateSchema, req.body);
    await assertRefs(companyId, data.warehouseId, data.carrierId, (data.items ?? []).map((i) => i.productId));

    const shipment = await prisma.$transaction(async (tx) => {
      if (data.items) {
        await tx.shipmentItem.deleteMany({ where: { shipmentId: req.params.id } });
        for (const i of data.items) {
          await tx.shipmentItem.create({
            data: { shipmentId: req.params.id, productId: i.productId, quantity: i.quantity },
          });
        }
      }
      return tx.shipment.update({
        where: { id: req.params.id },
        data: {
          warehouseId: data.warehouseId,
          customerName: data.customerName,
          address: data.address,
          carrierId: data.carrierId,
          trackingNumber: data.trackingNumber,
          freightCost: data.freightCost,
          notes: data.notes,
        },
        include: { items: true },
      });
    });
    res.json(shipment);
  }),
);

// POST /api/shipments/:id/pick  (ADMIN, MANAGER) — PENDING -> PICKING
shipmentsRouter.post(
  '/:id/pick',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const s = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true, status: true },
    });
    if (!s) throw notFound('Shipment not found');
    if (s.status !== 'PENDING') throw badRequest('Only pending shipments can start picking');
    const updated = await prisma.shipment.update({ where: { id: s.id }, data: { status: 'PICKING' } });
    res.json(updated);
  }),
);

// POST /api/shipments/:id/ship  (ADMIN, MANAGER) — deduct stock, set SHIPPED
shipmentsRouter.post(
  '/:id/ship',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { carrierId, trackingNumber, freightCost } = parse(shipSchema, req.body);
    if (carrierId) await assertRefs(req.user!.companyId, undefined, carrierId, []);

    const updated = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true },
      });
      if (!shipment) throw notFound('Shipment not found');
      if (shipment.status !== 'PENDING' && shipment.status !== 'PICKING') {
        throw badRequest('Only pending or picking shipments can be shipped');
      }

      // Deduct each line from the source warehouse (applyStockChange blocks overselling).
      for (const item of shipment.items) {
        await applyStockChange(tx, {
          productId: item.productId,
          warehouseId: shipment.warehouseId,
          delta: -item.quantity,
          type: 'SHIPMENT',
          reference: shipment.number,
          reason: 'Shipment dispatched',
          userId: req.user?.id,
        });
      }

      return tx.shipment.update({
        where: { id: shipment.id },
        data: {
          status: 'SHIPPED',
          shippedAt: new Date(),
          carrierId: carrierId ?? shipment.carrierId,
          trackingNumber: trackingNumber ?? shipment.trackingNumber,
          freightCost: freightCost ?? shipment.freightCost,
        },
      });
    });
    res.json(updated);
  }),
);

// POST /api/shipments/:id/deliver  (ADMIN, MANAGER) — SHIPPED -> DELIVERED
shipmentsRouter.post(
  '/:id/deliver',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const s = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true, status: true },
    });
    if (!s) throw notFound('Shipment not found');
    if (s.status !== 'SHIPPED') throw badRequest('Only shipped shipments can be marked delivered');
    const updated = await prisma.shipment.update({
      where: { id: s.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    res.json(updated);
  }),
);

// PATCH /api/shipments/:id/tracking  (ADMIN, MANAGER) — update carrier/tracking
shipmentsRouter.patch(
  '/:id/tracking',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const s = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true },
    });
    if (!s) throw notFound('Shipment not found');
    const data = parse(trackingSchema, req.body);
    if (data.carrierId) await assertRefs(req.user!.companyId, undefined, data.carrierId, []);
    const updated = await prisma.shipment.update({ where: { id: s.id }, data });
    res.json(updated);
  }),
);

// POST /api/shipments/:id/cancel  (ADMIN, MANAGER) — before it ships
shipmentsRouter.post(
  '/:id/cancel',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const s = await prisma.shipment.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true, status: true },
    });
    if (!s) throw notFound('Shipment not found');
    if (s.status === 'SHIPPED' || s.status === 'DELIVERED') {
      throw badRequest('Cannot cancel a shipment that has already shipped');
    }
    if (s.status === 'CANCELLED') throw badRequest('Shipment is already cancelled');
    const updated = await prisma.shipment.update({ where: { id: s.id }, data: { status: 'CANCELLED' } });
    res.json(updated);
  }),
);
