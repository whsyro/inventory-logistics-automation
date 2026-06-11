import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // --- Company (the demo tenant) ---
  const company = await prisma.company.upsert({
    where: { id: 'seed-company' },
    update: {},
    create: { id: 'seed-company', name: 'Demo Company' },
  });
  const companyId = company.id;

  // --- Users ---
  const users = [
    { email: 'admin@ila.local', name: 'Ada Admin', role: 'ADMIN' },
    { email: 'manager@ila.local', name: 'Max Manager', role: 'MANAGER' },
    { email: 'staff@ila.local', name: 'Sam Staff', role: 'STAFF' },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, companyId },
      create: { ...u, passwordHash, companyId },
    });
  }

  // --- Warehouses ---
  const main = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId, code: 'MAIN' } },
    update: {},
    create: { code: 'MAIN', name: 'Main Warehouse', address: '100 Depot Rd', companyId },
  });
  const east = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId, code: 'EAST' } },
    update: {},
    create: { code: 'EAST', name: 'East Distribution Center', address: '5 Harbor Ave', companyId },
  });

  // --- Suppliers ---
  const acme = await prisma.supplier.upsert({
    where: { id: 'seed-supplier-acme' },
    update: {},
    create: {
      id: 'seed-supplier-acme',
      name: 'Acme Components',
      contactName: 'Jane Doe',
      email: 'sales@acme.example',
      phone: '+1-555-0100',
      companyId,
    },
  });
  const globex = await prisma.supplier.upsert({
    where: { id: 'seed-supplier-globex' },
    update: {},
    create: {
      id: 'seed-supplier-globex',
      name: 'Globex Supplies',
      contactName: 'John Smith',
      email: 'orders@globex.example',
      phone: '+1-555-0200',
      companyId,
    },
  });

  // --- Products (with initial stock) ---
  const productSeed = [
    { sku: 'WIDGET-001', name: 'Standard Widget', category: 'Widgets', unitCost: 2.5, unitPrice: 6.0, reorderPoint: 50, reorderQty: 200, supplierId: acme.id, stock: { MAIN: 320, EAST: 80 } },
    { sku: 'WIDGET-002', name: 'Premium Widget', category: 'Widgets', unitCost: 4.0, unitPrice: 11.0, reorderPoint: 30, reorderQty: 120, supplierId: acme.id, stock: { MAIN: 18, EAST: 5 } },
    { sku: 'GADGET-100', name: 'Gadget Mk I', category: 'Gadgets', unitCost: 9.0, unitPrice: 24.0, reorderPoint: 25, reorderQty: 100, supplierId: globex.id, stock: { MAIN: 60 } },
    { sku: 'GADGET-200', name: 'Gadget Mk II', category: 'Gadgets', unitCost: 14.0, unitPrice: 39.0, reorderPoint: 20, reorderQty: 60, supplierId: globex.id, stock: { MAIN: 12, EAST: 4 } },
    { sku: 'BOX-SM', name: 'Small Shipping Box', category: 'Packaging', unit: 'box', unitCost: 0.4, unitPrice: 1.0, reorderPoint: 200, reorderQty: 1000, supplierId: globex.id, stock: { MAIN: 1500 } },
    { sku: 'BOX-LG', name: 'Large Shipping Box', category: 'Packaging', unit: 'box', unitCost: 0.8, unitPrice: 2.0, reorderPoint: 150, reorderQty: 800, supplierId: globex.id, stock: { MAIN: 90 } },
  ];

  const warehouseByCode: Record<string, string> = { MAIN: main.id, EAST: east.id };

  for (const p of productSeed) {
    const { stock, ...data } = p;
    const product = await prisma.product.upsert({
      where: { companyId_sku: { companyId, sku: p.sku } },
      update: {},
      create: { ...data, companyId },
    });

    for (const [code, qty] of Object.entries(stock)) {
      const warehouseId = warehouseByCode[code];
      await prisma.stockLevel.upsert({
        where: { productId_warehouseId: { productId: product.id, warehouseId } },
        update: { quantity: qty },
        create: { productId: product.id, warehouseId, quantity: qty },
      });
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          warehouseId,
          type: 'ADJUSTMENT',
          quantity: qty,
          reason: 'Initial seed stock',
        },
      });
    }
  }

  console.log('✅ Seed complete.');
  console.log('   Logins: admin@ila.local / manager@ila.local / staff@ila.local');
  console.log('   Password for all: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
