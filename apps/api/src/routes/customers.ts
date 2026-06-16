import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

const customerInput = z.object({
  name: z.string().min(1),
  contactName: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  routeId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

/** Ensure a route id (if given) belongs to the caller's company. */
async function assertRouteInCompany(routeId: string, companyId: string) {
  const r = await prisma.route.findFirst({ where: { id: routeId, companyId }, select: { id: true } });
  if (!r) throw badRequest('Unknown route');
}

// GET /api/customers — directory with assigned route + order count
customersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const customers = await prisma.customer.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { name: 'asc' },
      include: {
        route: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
      },
    });
    res.json(customers);
  }),
);

// GET /api/customers/:id
customersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        route: { select: { id: true, name: true } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, number: true, status: true, createdAt: true },
        },
      },
    });
    if (!customer) throw notFound('Customer not found');
    res.json(customer);
  }),
);

// POST /api/customers  (ADMIN, MANAGER)
customersRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const data = parse(customerInput, req.body);
    if (data.routeId) await assertRouteInCompany(data.routeId, companyId);
    const customer = await prisma.customer.create({
      data: { ...data, email: data.email || null, companyId },
    });
    res.status(201).json(customer);
  }),
);

// PUT /api/customers/:id  (ADMIN, MANAGER)
customersRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true },
    });
    if (!existing) throw notFound('Customer not found');

    const data = parse(customerInput.partial(), req.body);
    if (data.routeId) await assertRouteInCompany(data.routeId, companyId);
    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { ...data, ...(data.email !== undefined ? { email: data.email || null } : {}) },
    });
    res.json(customer);
  }),
);
