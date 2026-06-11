import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
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
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { sku: { contains: search } },
                { category: { contains: search } },
              ],
            }
          : {}),
      },
      include: { stockLevels: true, supplier: { select: { id: true, name: true } } },
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
      where: { id: req.params.id, companyId: req.user!.companyId },
      include: {
        stockLevels: { include: { warehouse: { select: { id: true, code: true, name: true } } } },
        supplier: { select: { id: true, name: true } },
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
    const data = parse(productInput, req.body);
    if (data.supplierId) await assertSupplierInCompany(data.supplierId, companyId);
    const product = await prisma.product.create({ data: { ...data, companyId } });
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

    const data = parse(productInput.partial(), req.body);
    if (data.supplierId) await assertSupplierInCompany(data.supplierId, companyId);
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
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
