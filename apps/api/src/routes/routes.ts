import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';

export const routesRouter = Router();
routesRouter.use(requireAuth);

const routeInput = z.object({
  name: z.string().min(1),
  code: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  driverId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

/** Ensure a driver id (if given) is an active DRIVER user in the company. */
async function assertDriverInCompany(driverId: string, companyId: string) {
  const u = await prisma.user.findFirst({
    where: { id: driverId, companyId, role: 'DRIVER' },
    select: { id: true },
  });
  if (!u) throw badRequest('Driver must be a user with the DRIVER role in your company');
}

const driverSelect = { id: true, name: true, email: true } as const;

// GET /api/routes — routes with driver + customer/order counts
routesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const routes = await prisma.route.findMany({
      where: { companyId: req.user!.companyId },
      orderBy: { name: 'asc' },
      include: {
        driver: { select: driverSelect },
        _count: { select: { customers: true, orders: true } },
      },
    });
    res.json(routes);
  }),
);

// GET /api/routes/drivers — DRIVER users available to assign to a route.
// (Managers manage routes but can't hit the ADMIN-only /api/users endpoint.)
routesRouter.get(
  '/drivers',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const drivers = await prisma.user.findMany({
      where: { companyId: req.user!.companyId, role: 'DRIVER', isActive: true },
      select: driverSelect,
      orderBy: { name: 'asc' },
    });
    res.json(drivers);
  }),
);

// GET /api/routes/:id — route with its driver, customers and recent orders
routesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const route = await prisma.route.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        driver: { select: driverSelect },
        customers: {
          orderBy: { name: 'asc' },
          select: { id: true, name: true, address: true, isActive: true },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            number: true,
            status: true,
            createdAt: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!route) throw notFound('Route not found');
    res.json(route);
  }),
);

// POST /api/routes  (ADMIN, MANAGER)
routesRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const data = parse(routeInput, req.body);
    if (data.driverId) await assertDriverInCompany(data.driverId, companyId);
    const route = await prisma.route.create({
      data: { ...data, companyId },
      include: { driver: { select: driverSelect }, _count: { select: { customers: true, orders: true } } },
    });
    res.status(201).json(route);
  }),
);

// PUT /api/routes/:id  (ADMIN, MANAGER) — edit, incl. (re)assigning the driver
routesRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const existing = await prisma.route.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true },
    });
    if (!existing) throw notFound('Route not found');

    const data = parse(routeInput.partial(), req.body);
    if (data.driverId) await assertDriverInCompany(data.driverId, companyId);
    const route = await prisma.route.update({
      where: { id: req.params.id },
      data,
      include: { driver: { select: driverSelect }, _count: { select: { customers: true, orders: true } } },
    });
    res.json(route);
  }),
);
