import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  HIDEABLE_ROLES,
  PRODUCT_VISIBILITIES,
  type HideableRole,
  type ProductVisibility,
} from '../constants.js';
import { asyncHandler, badRequest, notFound } from '../lib/http.js';
import { parse } from '../lib/validate.js';
import { requireAuth, requireRole } from '../lib/auth.js';

export const productsRouter = Router();
productsRouter.use(requireAuth);

const productInput = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  unit: z.string().default('each'),
  barcode: z.string().optional().nullable(),
  unitCost: z.coerce.number().min(0).default(0),
  unitPrice: z.coerce.number().min(0).default(0),
  reorderPoint: z.coerce.number().int().min(0).default(0),
  reorderQty: z.coerce.number().int().min(0).default(0),
  supplierId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  // Visibility mode plus its parameters: the user list for RESTRICTED and the role
  // list for BY_ROLE. Only honored for admins (see the visibility helpers below);
  // managers always get COMPANY products.
  visibility: z.enum(PRODUCT_VISIBILITIES).optional(),
  visibleUserIds: z.array(z.string()).optional(),
  hiddenRoles: z
    .array(z.enum(HIDEABLE_ROLES as unknown as [HideableRole, ...HideableRole[]]))
    .optional(),
});

/** Attach total stock (summed across warehouses) to each product. */
function withTotalStock<T extends { stockLevels: { quantity: number }[] }>(p: T) {
  const totalStock = p.stockLevels.reduce((sum, s) => sum + s.quantity, 0);
  const { stockLevels, ...rest } = p;
  return { ...rest, totalStock };
}

/** Ensure a supplier id (if given) belongs to the caller's company. */
async function assertSupplierInCompany(supplierId: string, companyId: string) {
  const s = await prisma.supplier.findFirst({ where: { id: supplierId, companyId }, select: { id: true } });
  if (!s) throw badRequest('Unknown supplier');
}

/** Ensure every user id in a visibility list belongs to the caller's company. */
async function assertUsersInCompany(userIds: string[], companyId: string) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const count = await prisma.user.count({ where: { id: { in: unique }, companyId } });
  if (count !== unique.length) throw badRequest('Unknown user in visibility list');
}

/**
 * Prisma `where` fragments (to spread into an `AND`) that restrict a non-admin to
 * the products they may see: company-wide ones, RESTRICTED ones that list their id,
 * or BY_ROLE ones that don't hide their role. ADMINS_ONLY products never match.
 * Admins see everything (returns nothing).
 */
function visibilityFilter(user: { id: string; role: string }): Prisma.ProductWhereInput[] {
  if (user.role === 'ADMIN') return [];
  return [
    {
      OR: [
        { visibility: 'COMPANY' },
        { visibility: 'RESTRICTED', visibleTo: { some: { userId: user.id } } },
        { visibility: 'BY_ROLE', hiddenRoles: { none: { role: user.role } } },
      ],
    },
  ];
}

/**
 * Validate an admin's chosen visibility mode + parameters and resolve what to
 * persist, normalizing degenerate cases: RESTRICTED with no users, and BY_ROLE that
 * hides every non-admin role, both collapse to ADMINS_ONLY; BY_ROLE hiding no role
 * collapses to COMPANY. Returns the user ids / roles to write as child rows.
 */
async function resolveVisibility(
  mode: ProductVisibility,
  visibleUserIds: string[] | undefined,
  hiddenRoles: HideableRole[] | undefined,
  companyId: string,
): Promise<{ visibility: ProductVisibility; userIds: string[]; roles: HideableRole[] }> {
  if (mode === 'RESTRICTED') {
    const userIds = [...new Set(visibleUserIds ?? [])];
    if (userIds.length) await assertUsersInCompany(userIds, companyId);
    return userIds.length
      ? { visibility: 'RESTRICTED', userIds, roles: [] }
      : { visibility: 'ADMINS_ONLY', userIds: [], roles: [] };
  }
  if (mode === 'BY_ROLE') {
    const roles = [...new Set(hiddenRoles ?? [])].filter((r) => HIDEABLE_ROLES.includes(r));
    if (roles.length === 0) return { visibility: 'COMPANY', userIds: [], roles: [] };
    if (roles.length === HIDEABLE_ROLES.length)
      return { visibility: 'ADMINS_ONLY', userIds: [], roles: [] };
    return { visibility: 'BY_ROLE', userIds: [], roles };
  }
  // COMPANY or ADMINS_ONLY — no child rows.
  return { visibility: mode, userIds: [], roles: [] };
}

// GET /api/products?search=&lowStock=true
productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const lowStock = req.query.lowStock === 'true';

    const products = await prisma.product.findMany({
      where: {
        companyId,
        AND: [
          ...(search
            ? [
                {
                  OR: [
                    // insensitive keeps search case-insensitive on Postgres (SQLite's
                    // LIKE was case-insensitive by default; Postgres's is not).
                    { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    { sku: { contains: search, mode: Prisma.QueryMode.insensitive } },
                    { category: { contains: search, mode: Prisma.QueryMode.insensitive } },
                  ],
                },
              ]
            : []),
          ...visibilityFilter(req.user!),
        ],
      },
      include: {
        stockLevels: true,
        supplier: { select: { id: true, name: true } },
        visibleTo: { select: { userId: true } },
        hiddenRoles: { select: { role: true } },
      },
      orderBy: { name: 'asc' },
    });

    let result = products.map(withTotalStock);
    if (lowStock) result = result.filter((p) => p.totalStock <= p.reorderPoint);
    res.json(result);
  }),
);

// GET /api/products/:id
productsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id,
        companyId: req.user!.companyId,
        AND: visibilityFilter(req.user!),
      },
      include: {
        stockLevels: { include: { warehouse: { select: { id: true, code: true, name: true } } } },
        supplier: { select: { id: true, name: true } },
        visibleTo: { select: { userId: true } },
        hiddenRoles: { select: { role: true } },
      },
    });
    if (!product) throw notFound('Product not found');
    res.json(product);
  }),
);

// POST /api/products  (ADMIN, MANAGER)
productsRouter.post(
  '/',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const { visibility, visibleUserIds, hiddenRoles, ...data } = parse(productInput, req.body);
    if (data.supplierId) await assertSupplierInCompany(data.supplierId, companyId);

    // Visibility is admin-controlled; managers always create company-wide products.
    const mode = req.user!.role === 'ADMIN' ? visibility ?? 'COMPANY' : 'COMPANY';
    const vis = await resolveVisibility(mode, visibleUserIds, hiddenRoles, companyId);

    const product = await prisma.product.create({
      data: {
        ...data,
        companyId,
        visibility: vis.visibility,
        ...(vis.userIds.length
          ? { visibleTo: { create: vis.userIds.map((userId) => ({ userId })) } }
          : {}),
        ...(vis.roles.length
          ? { hiddenRoles: { create: vis.roles.map((role) => ({ role })) } }
          : {}),
      },
    });
    res.status(201).json(product);
  }),
);

// PUT /api/products/:id  (ADMIN, MANAGER)
productsRouter.put(
  '/:id',
  requireRole('ADMIN', 'MANAGER'),
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, companyId },
      select: { id: true },
    });
    if (!existing) throw notFound('Product not found');

    const { visibility, visibleUserIds, hiddenRoles, ...data } = parse(
      productInput.partial(),
      req.body,
    );
    if (data.supplierId) await assertSupplierInCompany(data.supplierId, companyId);

    // Only admins may change visibility, and only when they actually send the
    // mode — managers editing a product leave its visibility untouched.
    let visData: Prisma.ProductUncheckedUpdateInput = {};
    if (req.user!.role === 'ADMIN' && visibility !== undefined) {
      const vis = await resolveVisibility(visibility, visibleUserIds, hiddenRoles, companyId);
      visData = {
        visibility: vis.visibility,
        visibleTo: { deleteMany: {}, create: vis.userIds.map((userId) => ({ userId })) },
        hiddenRoles: { deleteMany: {}, create: vis.roles.map((role) => ({ role })) },
      };
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { ...data, ...visData },
    });
    res.json(product);
  }),
);

// DELETE /api/products/:id  (ADMIN) — soft delete by deactivating
productsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.user!.companyId },
      select: { id: true },
    });
    if (!existing) throw notFound('Product not found');
    await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).end();
  }),
);
