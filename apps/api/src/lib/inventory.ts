import type { Prisma, PrismaClient } from '@prisma/client';
import type { MovementType } from '../constants.js';
import { badRequest } from './http.js';

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Apply a signed stock change for a product at a warehouse and record a movement.
 * Run inside a transaction when multiple changes must succeed together.
 * Throws if the change would drive stock negative.
 */
export async function applyStockChange(
  tx: Tx,
  params: {
    productId: string;
    warehouseId: string;
    delta: number; // positive = in, negative = out
    type: MovementType;
    reason?: string | null;
    reference?: string | null;
    userId?: string | null;
  },
) {
  const { productId, warehouseId, delta, type, reason, reference, userId } = params;

  const existing = await tx.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  const current = existing?.quantity ?? 0;
  const newQty = current + delta;

  if (newQty < 0) {
    throw badRequest(
      `Insufficient stock: ${current} on hand, cannot apply change of ${delta}`,
    );
  }

  const level = await tx.stockLevel.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    create: { productId, warehouseId, quantity: newQty },
    update: { quantity: newQty },
  });

  await tx.stockMovement.create({
    data: { productId, warehouseId, type, quantity: delta, reason, reference, userId },
  });

  return level;
}
