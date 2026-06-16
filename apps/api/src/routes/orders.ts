import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { applyStockChange } from '../lib/inventory.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

type Tx = Prisma.TransactionClient | PrismaClient;

// Line items can be edited only while the order is in one of these states.
const EDITABLE = ['UNCONFIRMED', 'PREORDER'];

/** Net total for a line after its per-line percentage discount. */
function lineTotal(i: { quantity: number; unitPrice: number; discount: number }) {
  return i.quantity * i.unitPrice * (1 - i.discount / 100);
}

/** Next sequential order number within a company, e.g. ORD-0007. */
async function nextOrderNumber(tx: Tx, companyId: string): Promise<string> {
  const last = await tx.order.findFirst({
    where: { companyId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const n = last ? parseInt(last.number.replace(/\D/g, ''), 10) + 1 : 1;
  return `ORD-${String(n).padStart(4, '0')}`;
}

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).max(100).optional(),
});

const createSchema = z.object({
  customerId: z.string().min(1),
  warehouseId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(lineSchema).min(1, 'An order needs at least one line item'),
});

const updateSchema = z.object({
  warehouseId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(lineSchema).min(1).optional(),
});

/** Validate a warehouse id belongs to the company. */
async function assertWarehouse(warehouseId: string, companyId: string) {
  const wh = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true } });
  if (!wh) throw badRequest('Unknown warehouse');
}

/**
 * Reject order lines whose quantity exceeds available stock — at the chosen source
 * warehouse if one is set, otherwise summed across all warehouses. Duplicate
 * product lines are aggregated so the combined quantity is checked.
 */
async function assertStock(
  companyId: string,
  warehouseId: string | null,
  items: { productId: string; quantity: number }[],
) {
  const wanted = new Map<string, number>();
  for (const i of items) wanted.set(i.productId, (wanted.get(i.productId) ?? 0) + i.quantity);
  const ids = [...wanted.keys()];
  if (!ids.length) return;

  const levels = await prisma.stockLevel.findMany({
    where: { productId: { in: ids }, product: { companyId }, ...(warehouseId ? { warehouseId } : {}) },
    select: { productId: true, quantity: true },
  });
  const have = new Map<string, number>();
  for (const l of levels) have.set(l.productId, (have.get(l.productId) ?? 0) + l.quantity);

  for (const [productId, qty] of wanted) {
    const avail = have.get(productId) ?? 0;
    if (qty > avail) {
      const p = await prisma.product.findFirst({
        where: { id: productId, companyId },
        select: { sku: true, name: true },
      });
      const at = warehouseId ? ' at the selected warehouse' : '';
      throw badRequest(
        `Not enough stock for ${p?.name ?? 'product'}${p?.sku ? ` (${p.sku})` : ''}: ${avail} available${at}, but ${qty} ordered`,
      );
    }
  }
}

/** Resolve line items: validate products belong to the company and default the
 *  unit price from the product when the caller didn't override it. */
async function resolveItems(
  companyId: string,
  items: z.infer<typeof lineSchema>[],
): Promise<{ productId: string; quantity: number; unitPrice: number; discount: number }[]> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, companyId },
    select: { id: true, unitPrice: true },
  });
  if (products.length !== ids.length) throw badRequest('One or more products are invalid');
  const priceById = new Map(products.map((p) => [p.id, p.unitPrice]));
  return items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    unitPrice: i.unitPrice ?? priceById.get(i.productId) ?? 0,
    discount: i.discount ?? 0,
  }));
}

// GET /api/orders — list with customer, route, line count + net total
ordersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        route: { select: { id: true, name: true } },
        items: { select: { quantity: true, unitPrice: true, discount: true } },
      },
    });
    res.json(
      orders.map(({ items, ...o }) => ({
        ...o,
        itemCount: items.length,
        total: items.reduce((s, i) => s + lineTotal(i), 0),
      })),
    );
  }),
);

// GET /api/orders/centralization?status=CONFIRMED,PREORDER
// Per-route rollup: which stops (customers) and what merchandise each driver loads.
ordersRouter.get(
  '/centralization',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const statusParam = typeof req.query.status === 'string' ? req.query.status : '';
    const statuses = statusParam
      ? statusParam.split(',').map((s) => s.trim()).filter(Boolean)
      : ['UNCONFIRMED', 'CONFIRMED', 'PREORDER'];

    const orders = await prisma.order.findMany({
      where: { companyId, status: { in: statuses } },
      include: {
        customer: { select: { id: true, name: true, address: true } },
        route: { select: { id: true, name: true, code: true, driver: { select: { id: true, name: true } } } },
        items: {
          select: {
            quantity: true,
            product: { select: { id: true, sku: true, name: true, unit: true } },
          },
        },
      },
    });

    // Group by route (null route -> "Unassigned").
    type Group = {
      route: { id: string; name: string; code: string | null } | null;
      driver: { id: string; name: string } | null;
      stops: Map<string, { customerId: string; customerName: string; address: string | null; orderCount: number }>;
      merch: Map<string, { productId: string; sku: string; name: string; unit: string; quantity: number }>;
      orderCount: number;
    };
    const groups = new Map<string, Group>();

    for (const o of orders) {
      const key = o.route?.id ?? '__unassigned__';
      if (!groups.has(key)) {
        groups.set(key, {
          route: o.route ? { id: o.route.id, name: o.route.name, code: o.route.code } : null,
          driver: o.route?.driver ?? null,
          stops: new Map(),
          merch: new Map(),
          orderCount: 0,
        });
      }
      const g = groups.get(key)!;
      g.orderCount += 1;

      const stop = g.stops.get(o.customer.id);
      if (stop) stop.orderCount += 1;
      else
        g.stops.set(o.customer.id, {
          customerId: o.customer.id,
          customerName: o.customer.name,
          address: o.customer.address,
          orderCount: 1,
        });

      for (const it of o.items) {
        const m = g.merch.get(it.product.id);
        if (m) m.quantity += it.quantity;
        else
          g.merch.set(it.product.id, {
            productId: it.product.id,
            sku: it.product.sku,
            name: it.product.name,
            unit: it.product.unit,
            quantity: it.quantity,
          });
      }
    }

    const result = [...groups.values()]
      .map((g) => ({
        route: g.route,
        driver: g.driver,
        orderCount: g.orderCount,
        stops: [...g.stops.values()].sort((a, b) => a.customerName.localeCompare(b.customerName)),
        merchandise: [...g.merch.values()].sort((a, b) => a.name.localeCompare(b.name)),
        totalUnits: [...g.merch.values()].reduce((s, m) => s + m.quantity, 0),
      }))
      // Real routes first (alpha), unassigned bucket last.
      .sort((a, b) => {
        if (!a.route) return 1;
        if (!b.route) return -1;
        return a.route.name.localeCompare(b.route.name);
      });

    res.json({ statuses, groups: result });
  }),
);

// GET /api/orders/:id
ordersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        customer: { select: { id: true, name: true, address: true } },
        route: { select: { id: true, name: true, driver: { select: { id: true, name: true } } } },
        warehouse: { select: { id: true, code: true, name: true } },
        createdBy: { select: { name: true } },
        items: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
      },
    });
    if (!order) throw notFound('Order not found');
    res.json(order);
  }),
);

// POST /api/orders  (internal staff) — create an UNCONFIRMED order for a customer
ordersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const data = parse(createSchema, req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, companyId },
      select: { id: true, routeId: true },
    });
    if (!customer) throw badRequest('Unknown customer');
    if (data.warehouseId) await assertWarehouse(data.warehouseId, companyId);
    const items = await resolveItems(companyId, data.items);
    await assertStock(companyId, data.warehouseId ?? null, items);

    const order = await prisma.$transaction(async (tx) => {
      const number = await nextOrderNumber(tx, companyId);
      return tx.order.create({
        data: {
          number,
          companyId,
          customerId: customer.id,
          routeId: customer.routeId, // snapshot the customer's route
          warehouseId: data.warehouseId ?? null,
          notes: data.notes ?? null,
          createdById: req.user?.id,
          items: { create: items },
        },
        include: { items: true },
      });
    });
    res.status(201).json(order);
  }),
);

// PUT /api/orders/:id  (internal staff) — edit while UNCONFIRMED or PREORDER
ordersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true, status: true, warehouseId: true },
    });
    if (!existing) throw notFound('Order not found');
    if (!EDITABLE.includes(existing.status)) {
      throw badRequest('Only unconfirmed or pre-order orders can be edited');
    }

    const data = parse(updateSchema, req.body);
    if (data.warehouseId) await assertWarehouse(data.warehouseId, companyId);
    const items = data.items ? await resolveItems(companyId, data.items) : null;
    if (items) {
      // Validate against the warehouse the order will have after this update.
      const effectiveWarehouse =
        data.warehouseId !== undefined ? data.warehouseId : existing.warehouseId;
      await assertStock(companyId, effectiveWarehouse ?? null, items);
    }

    const order = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.orderItem.deleteMany({ where: { orderId: req.params.id } });
        await tx.orderItem.createMany({
          data: items.map((i) => ({ ...i, orderId: req.params.id })),
        });
      }
      return tx.order.update({
        where: { id: req.params.id },
        data: { warehouseId: data.warehouseId, notes: data.notes },
        include: { items: true },
      });
    });
    res.json(order);
  }),
);

/** Load an order in the company or throw 404. */
async function getOrder(id: string, companyId: string) {
  const o = await prisma.order.findFirst({ where: { id, companyId } });
  if (!o) throw notFound('Order not found');
  return o;
}

// POST /api/orders/:id/confirm — UNCONFIRMED|PREORDER -> CONFIRMED
ordersRouter.post(
  '/:id/confirm',
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  asyncHandler(async (req, res) => {
    const o = await getOrder(req.params.id, req.user!.companyId);
    if (o.status !== 'UNCONFIRMED' && o.status !== 'PREORDER') {
      throw badRequest('Only unconfirmed or pre-order orders can be confirmed');
    }
    const updated = await prisma.order.update({
      where: { id: o.id },
      data: { status: 'CONFIRMED', confirmedAt: o.confirmedAt ?? new Date() },
    });
    res.json(updated);
  }),
);

// POST /api/orders/:id/preorder — CONFIRMED -> PREORDER (reopen for adjustments)
ordersRouter.post(
  '/:id/preorder',
  requireRole('ADMIN', 'MANAGER', 'STAFF'),
  asyncHandler(async (req, res) => {
    const o = await getOrder(req.params.id, req.user!.companyId);
    if (o.status !== 'CONFIRMED') throw badRequest('Only confirmed orders can move to pre-order');
    const updated = await prisma.order.update({ where: { id: o.id }, data: { status: 'PREORDER' } });
    res.json(updated);
  }),
);

// POST /api/orders/:id/deliver  (ADMIN, MANAGER) — deduct stock, set DELIVERED
ordersRouter.post(
  '/:id/deliver',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true },
      });
      if (!order) throw notFound('Order not found');
      if (order.status !== 'CONFIRMED' && order.status !== 'PREORDER') {
        throw badRequest('Only confirmed or pre-order orders can be delivered');
      }
      if (!order.warehouseId) throw badRequest('Set a source warehouse before delivering');

      // Deduct each line from the source warehouse (blocks overselling).
      for (const item of order.items) {
        await applyStockChange(tx, {
          productId: item.productId,
          warehouseId: order.warehouseId,
          delta: -item.quantity,
          type: 'DELIVERY',
          reference: order.number,
          reason: 'Order delivered',
          userId: req.user?.id,
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
    });
    res.json(updated);
  }),
);

// POST /api/orders/:id/cancel  (ADMIN, MANAGER) — before delivery
ordersRouter.post(
  '/:id/cancel',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const o = await getOrder(req.params.id, req.user!.companyId);
    if (o.status === 'DELIVERED') throw badRequest('Delivered orders cannot be cancelled');
    if (o.status === 'CANCELLED') throw badRequest('Order is already cancelled');
    const updated = await prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
    res.json(updated);
  }),
);
