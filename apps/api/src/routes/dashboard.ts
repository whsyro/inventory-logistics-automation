import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth } from '../lib/auth.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

// GET /api/dashboard — summary stats for the home screen (scoped to company)
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.user!.companyId;

    const [productCount, warehouseCount, supplierCount, products, recentMovements] =
      await Promise.all([
        prisma.product.count({ where: { isActive: true, companyId } }),
        prisma.warehouse.count({ where: { isActive: true, companyId } }),
        prisma.supplier.count({ where: { isActive: true, companyId } }),
        prisma.product.findMany({
          where: { isActive: true, companyId },
          include: { stockLevels: true },
        }),
        prisma.stockMovement.findMany({
          where: { product: { companyId } },
          take: 8,
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { sku: true, name: true } },
            warehouse: { select: { code: true } },
          },
        }),
      ]);

    let totalUnits = 0;
    let stockValue = 0;
    const lowStock: { id: string; sku: string; name: string; totalStock: number; reorderPoint: number; reorderQty: number }[] = [];

    for (const p of products) {
      const totalStock = p.stockLevels.reduce((sum, s) => sum + s.quantity, 0);
      totalUnits += totalStock;
      stockValue += totalStock * p.unitCost;
      if (totalStock <= p.reorderPoint) {
        lowStock.push({
          id: p.id,
          sku: p.sku,
          name: p.name,
          totalStock,
          reorderPoint: p.reorderPoint,
          reorderQty: p.reorderQty,
        });
      }
    }

    res.json({
      counts: {
        products: productCount,
        warehouses: warehouseCount,
        suppliers: supplierCount,
        lowStock: lowStock.length,
      },
      totalUnits,
      stockValue,
      lowStock: lowStock.slice(0, 10),
      recentMovements,
    });
  }),
);
