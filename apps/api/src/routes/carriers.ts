import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';

export const carriersRouter = Router();
carriersRouter.use(requireAuth);

const carrierInput = z.object({
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  serviceLevels: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// GET /api/carriers — directory + per-carrier shipment count & freight spend
carriersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const carriers = await prisma.carrier.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
    const grouped = await prisma.shipment.groupBy({
      by: ['carrierId'],
      where: { companyId, carrierId: { not: null } },
      _count: { _all: true },
      _sum: { freightCost: true },
    });
    const byId = new Map(grouped.map((g) => [g.carrierId, g]));
    res.json(
      carriers.map((c) => {
        const g = byId.get(c.id);
        return { ...c, shipmentCount: g?._count._all ?? 0, freightSpend: g?._sum.freightCost ?? 0 };
      }),
    );
  }),
);

carriersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const carrier = await prisma.carrier.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!carrier) throw notFound('Carrier not found');
    res.json(carrier);
  }),
);

carriersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const data = parse(carrierInput, req.body);
    const carrier = await prisma.carrier.create({ data: { ...data, companyId: req.user!.companyId } });
    res.status(201).json(carrier);
  }),
);

carriersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.carrier.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true },
    });
    if (!existing) throw notFound('Carrier not found');
    const data = parse(carrierInput.partial(), req.body);
    const carrier = await prisma.carrier.update({ where: { id: req.params.id }, data });
    res.json(carrier);
  }),
);
