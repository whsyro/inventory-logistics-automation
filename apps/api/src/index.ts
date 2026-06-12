import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { corsOrigins, env } from './env.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { carriersRouter } from './routes/carriers.js';
import { dashboardRouter } from './routes/dashboard.js';
import { inventoryRouter } from './routes/inventory.js';
import { productsRouter } from './routes/products.js';
import { purchaseOrdersRouter } from './routes/purchaseOrders.js';
import { shipmentsRouter } from './routes/shipments.js';
import { suppliersRouter } from './routes/suppliers.js';
import { usersRouter } from './routes/users.js';
import { warehousesRouter } from './routes/warehouses.js';

const app = express();

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // supplier confirmation form posts
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/products', productsRouter);
app.use('/api/warehouses', warehousesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/carriers', carriersRouter);
app.use('/api/users', usersRouter);

// 404 for unknown API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`🚀 API listening on http://localhost:${env.PORT}`);
});
