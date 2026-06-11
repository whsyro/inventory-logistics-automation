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

warehousesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
    });
    if (!warehouse) throw notFound('Warehouse not found');
    res.json(warehouse);
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
