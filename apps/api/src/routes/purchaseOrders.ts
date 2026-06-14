import { Router } from 'express';
import type { Prisma, PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { applyStockChange } from '../lib/inventory.js';
import { sendMail } from '../lib/email.js';
import { buildOrderEmail, confirmLandingPage, confirmResultPage } from '../lib/poEmail.js';

export const purchaseOrdersRouter = Router();

type Tx = Prisma.TransactionClient | PrismaClient;

// --- Supplier confirmation tokens (signed; no DB column needed) ---
function signConfirmToken(poId: string): string {
  return jwt.sign({ poId, purpose: 'po-confirm' }, env.JWT_SECRET, { expiresIn: '30d' });
}
function verifyConfirmToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & { poId?: string; purpose?: string };
  if (payload.purpose !== 'po-confirm' || !payload.poId) throw new Error('bad token');
  return payload.poId;
}

/** Next sequential PO number within a company, e.g. PO-0007. */
async function nextPoNumber(tx: Tx, companyId: string): Promise<string> {
  const last = await tx.purchaseOrder.findFirst({
    where: { companyId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const n = last ? parseInt(last.number.replace(/\D/g, ''), 10) + 1 : 1;
  return `PO-${String(n).padStart(4, '0')}`;
}

/** Verify all referenced entities belong to the company (throws 400 otherwise). */
async function assertPoRefs(
  companyId: string,
  supplierId: string | undefined,
  warehouseId: string | null | undefined,
  productIds: string[],
) {
  if (supplierId) {
    const sup = await prisma.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true } });
    if (!sup) throw badRequest('Unknown supplier');
  }
  if (warehouseId) {
    const wh = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId }, select: { id: true } });
    if (!wh) throw badRequest('Unknown warehouse');
  }
  const unique = [...new Set(productIds)];
  if (unique.length) {
    const ok = await prisma.product.count({ where: { id: { in: unique }, companyId } });
    if (ok !== unique.length) throw badRequest('One or more products are invalid');
  }
}

/**
 * Attach a `warehouse` object to each PO. Resolved in code (one query) rather
 * than via a Prisma relation, since PurchaseOrder only has the warehouseId FK.
 */
async function withWarehouses<T extends { warehouseId: string | null }>(orders: T[]) {
  const ids = [...new Set(orders.map((o) => o.warehouseId).filter((x): x is string => !!x))];
  const warehouses = ids.length
    ? await prisma.warehouse.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true, name: true },
      })
    : [];
  const byId = new Map(warehouses.map((w) => [w.id, w]));
  return orders.map((o) => ({
    ...o,
    warehouse: o.warehouseId ? (byId.get(o.warehouseId) ?? null) : null,
  }));
}

/** Load a PO with everything the email/confirmation pages need. */
async function loadPoEmailData(poId: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      supplier: { select: { name: true, email: true } },
      items: { include: { product: { select: { name: true, sku: true } } } },
    },
  });
  if (!po) return null;
  const [withWh] = await withWarehouses([po]);
  return {
    po,
    emailData: {
      number: po.number,
      supplierName: po.supplier.name,
      expectedAt: po.expectedAt,
      notes: po.notes,
      warehouseName: withWh.warehouse?.name ?? null,
      items: po.items.map((i) => ({
        name: i.product.name,
        sku: i.product.sku,
        quantity: i.quantity,
        unitCost: i.unitCost,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// PUBLIC: supplier order confirmation (no auth — reached via email link)
// ---------------------------------------------------------------------------

// GET landing page (read-only; safe from email link prefetching).
purchaseOrdersRouter.get(
  '/confirm/:token',
  asyncHandler(async (req, res) => {
    let poId: string;
    try {
      poId = verifyConfirmToken(req.params.token);
    } catch {
      return res
        .status(400)
        .send(
          confirmResultPage({
            title: 'Invalid or expired link',
            message: 'This confirmation link is no longer valid. Please contact the buyer.',
            tone: 'red',
          }),
        );
    }

    const data = await loadPoEmailData(poId);
    if (!data) {
      return res.status(404).send(
        confirmResultPage({ title: 'Order not found', message: 'This purchase order no longer exists.', tone: 'gray' }),
      );
    }

    if (data.po.status !== 'AWAITING_CONFIRMATION') {
      const s = data.po.status;
      const page =
        s === 'ORDERED' || s === 'PARTIALLY_RECEIVED' || s === 'RECEIVED'
          ? { title: 'Already confirmed', message: `Order ${data.po.number} has already been confirmed. Thank you!`, tone: 'green' as const }
          : s === 'DECLINED'
            ? { title: 'Already declined', message: `Order ${data.po.number} was declined.`, tone: 'red' as const }
            : { title: 'No longer awaiting a response', message: `Order ${data.po.number} is currently "${s}".`, tone: 'gray' as const };
      return res.send(confirmResultPage(page));
    }

    const intent = typeof req.query.intent === 'string' ? req.query.intent : undefined;
    res.send(confirmLandingPage(data.emailData, req.params.token, intent));
  }),
);

// POST applies the supplier's decision.
purchaseOrdersRouter.post(
  '/confirm/:token',
  asyncHandler(async (req, res) => {
    let poId: string;
    try {
      poId = verifyConfirmToken(req.params.token);
    } catch {
      return res.status(400).send(
        confirmResultPage({ title: 'Invalid or expired link', message: 'This confirmation link is no longer valid.', tone: 'red' }),
      );
    }

    const raw = (req.body?.decision ?? req.query.decision) as string | undefined;
    const decision = raw === 'decline' ? 'decline' : 'confirm';

    const result = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
      if (!po) return { kind: 'notfound' as const };
      if (po.status !== 'AWAITING_CONFIRMATION') {
        return { kind: 'stale' as const, status: po.status, number: po.number };
      }
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: decision === 'decline' ? 'DECLINED' : 'ORDERED' },
      });
      return { kind: 'ok' as const, number: po.number };
    });

    if (result.kind === 'notfound') {
      return res.status(404).send(
        confirmResultPage({ title: 'Order not found', message: 'This purchase order no longer exists.', tone: 'gray' }),
      );
    }
    if (result.kind === 'stale') {
      return res.send(
        confirmResultPage({ title: 'Already responded', message: `Order ${result.number} is currently "${result.status}".`, tone: 'gray' }),
      );
    }
    if (decision === 'decline') {
      return res.send(
        confirmResultPage({ title: 'Order declined', message: `You declined order ${result.number}. The buyer will see this in their dashboard.`, tone: 'red' }),
      );
    }
    return res.send(
      confirmResultPage({ title: 'Order confirmed', message: `Thank you! Order ${result.number} is confirmed. The buyer can now receive the goods.`, tone: 'green' }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Everything below requires authentication.
// ---------------------------------------------------------------------------
purchaseOrdersRouter.use(requireAuth);

const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitCost: z.coerce.number().min(0).default(0),
});

const createSchema = z.object({
  supplierId: z.string().min(1),
  warehouseId: z.string().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
  expectedAt: z.coerce.date().optional().nullable(),
  items: z.array(lineSchema).min(1, 'A purchase order needs at least one line item'),
});

const updateSchema = z.object({
  supplierId: z.string().min(1).optional(),
  warehouseId: z.string().min(1).optional().nullable(),
  notes: z.string().optional().nullable(),
  expectedAt: z.coerce.date().optional().nullable(),
  items: z.array(lineSchema).min(1).optional(),
});

const receiveSchema = z.object({
  items: z
    .array(z.object({ itemId: z.string().min(1), receivedQty: z.coerce.number().int().min(0) }))
    .min(1),
  nextExpectedAt: z.coerce.date().optional().nullable(),
});

// GET /api/purchase-orders
purchaseOrdersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const orders = await prisma.purchaseOrder.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { select: { quantity: true, unitCost: true } },
      },
    });
    const result = (await withWarehouses(orders)).map(({ items, ...po }) => ({
      ...po,
      itemCount: items.length,
      total: items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0),
    }));
    res.json(result);
  }),
);

// GET /api/purchase-orders/:id
purchaseOrdersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        items: {
          include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
        },
      },
    });
    if (!po) throw notFound('Purchase order not found');
    const [withWh] = await withWarehouses([po]);
    const receiptHistory = await prisma.stockMovement.findMany({
      where: {
        type: 'RECEIPT',
        reference: po.number,
        product: { companyId: req.user!.companyId },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        user: { select: { name: true } },
      },
    });
    res.json({ ...withWh, receiptHistory });
  }),
);

// POST /api/purchase-orders  (ADMIN, MANAGER) — create a DRAFT
purchaseOrdersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const data = parse(createSchema, req.body);
    await assertPoRefs(companyId, data.supplierId, data.warehouseId, data.items.map((i) => i.productId));

    const po = await prisma.$transaction(async (tx) => {
      const number = await nextPoNumber(tx, companyId);
      return tx.purchaseOrder.create({
        data: {
          number,
          companyId,
          supplierId: data.supplierId,
          warehouseId: data.warehouseId ?? null,
          notes: data.notes ?? null,
          expectedAt: data.expectedAt ?? null,
          createdById: req.user?.id,
          items: {
            create: data.items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitCost: i.unitCost,
            })),
          },
        },
        include: { items: true },
      });
    });
    res.status(201).json(po);
  }),
);

// PUT /api/purchase-orders/:id  (ADMIN, MANAGER) — edit a DRAFT only
purchaseOrdersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const existing = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) throw notFound('Purchase order not found');
    if (existing.status !== 'DRAFT') throw badRequest('Only draft purchase orders can be edited');

    const data = parse(updateSchema, req.body);
    if (data.supplierId || data.warehouseId || data.items) {
      await assertPoRefs(
        companyId,
        data.supplierId ?? '',
        data.warehouseId,
        (data.items ?? []).map((i) => i.productId),
      );
    }
    const po = await prisma.$transaction(async (tx) => {
      if (data.items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: req.params.id } });
        for (const i of data.items) {
          await tx.purchaseOrderItem.create({
            data: {
              purchaseOrderId: req.params.id,
              productId: i.productId,
              quantity: i.quantity,
              unitCost: i.unitCost,
            },
          });
        }
      }
      return tx.purchaseOrder.update({
        where: { id: req.params.id },
        data: {
          supplierId: data.supplierId,
          warehouseId: data.warehouseId,
          notes: data.notes,
          expectedAt: data.expectedAt,
        },
        include: { items: true },
      });
    });
    res.json(po);
  }),
);

// POST /api/purchase-orders/:id/submit  (ADMIN, MANAGER)
// DRAFT -> emails the supplier with confirm/decline links -> AWAITING_CONFIRMATION
purchaseOrdersRouter.post(
  '/:id/submit',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const data = await loadPoEmailData(req.params.id);
    if (!data || data.po.companyId !== req.user!.companyId) throw notFound('Purchase order not found');
    if (data.po.status !== 'DRAFT') throw badRequest('Only draft purchase orders can be submitted');
    if (!data.po.supplier.email) {
      throw badRequest('This supplier has no email address on file — add one before submitting');
    }
    if (data.po.items.length === 0) {
      throw badRequest('Add at least one line item before submitting');
    }

    // Build + send the order email (must succeed before we change status).
    const token = signConfirmToken(data.po.id);
    const confirmUrl = `${env.APP_BASE_URL}/api/purchase-orders/confirm/${token}`;
    const email = buildOrderEmail(data.emailData, confirmUrl);
    const result = await sendMail({
      to: data.po.supplier.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    const updated = await prisma.purchaseOrder.update({
      where: { id: data.po.id },
      data: { status: 'AWAITING_CONFIRMATION', orderedAt: new Date() },
    });

    res.json({ ...updated, emailedTo: data.po.supplier.email, previewUrl: result.previewUrl });
  }),
);

// POST /api/purchase-orders/:id/receive  (ADMIN, MANAGER) — receive goods into stock
purchaseOrdersRouter.post(
  '/:id/receive',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const { items: lines, nextExpectedAt } = parse(receiveSchema, req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findFirst({
        where: { id: req.params.id, companyId: req.user!.companyId },
        include: { items: true },
      });
      if (!po) throw notFound('Purchase order not found');
      if (!po.warehouseId) {
        throw badRequest('Set a destination warehouse on the PO before receiving');
      }
      if (po.status !== 'ORDERED' && po.status !== 'PARTIALLY_RECEIVED') {
        throw badRequest('Purchase order must be submitted (ORDERED) before receiving');
      }

      for (const line of lines) {
        if (line.receivedQty <= 0) continue;
        const item = po.items.find((i) => i.id === line.itemId);
        if (!item) throw badRequest(`Unknown line item ${line.itemId}`);

        const newReceived = item.receivedQty + line.receivedQty;
        if (newReceived > item.quantity) {
          throw badRequest(
            `Cannot receive ${line.receivedQty}: only ${item.quantity - item.receivedQty} remaining on this line`,
          );
        }

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQty: newReceived },
        });
        await applyStockChange(tx, {
          productId: item.productId,
          warehouseId: po.warehouseId,
          delta: line.receivedQty,
          type: 'RECEIPT',
          reference: po.number,
          reason: 'PO receipt',
          userId: req.user?.id,
        });
      }

      const after = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
      });
      const fullyReceived = after.every((i) => i.receivedQty >= i.quantity);
      const anyReceived = after.some((i) => i.receivedQty > 0);
      const status = fullyReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status;
      if (status === 'PARTIALLY_RECEIVED' && !nextExpectedAt) {
        throw badRequest('Set the next expected date for the remaining stock');
      }

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status, nextExpectedAt: status === 'PARTIALLY_RECEIVED' ? nextExpectedAt : null },
        include: {
          items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
        },
      });
    });

    res.json(updated);
  }),
);

// POST /api/purchase-orders/:id/cancel  (ADMIN, MANAGER)
purchaseOrdersRouter.post(
  '/:id/cancel',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!po) throw notFound('Purchase order not found');
    if (po.status === 'RECEIVED' || po.status === 'CANCELLED' || po.status === 'DECLINED') {
      throw badRequest(`Cannot cancel a ${po.status.toLowerCase().replace('_', ' ')} purchase order`);
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });
    res.json(updated);
  }),
);
