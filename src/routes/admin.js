import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, asyncHandler } from '../errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withProductImages } from '../services/catalog.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().max(100).optional(),
  active: z.enum(['true', 'false']).optional(),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED', 'FAILED']).optional(),
  fulfillmentStatus: z.enum(['UNFULFILLED', 'PROCESSING', 'FULFILLED']).optional(),
}).strict();

const stockSchema = z.object({
  stock: z.number().int().min(0).max(1000000),
}).strict();

const fulfillmentSchema = z.object({
  fulfillmentStatus: z.enum(['UNFULFILLED', 'PROCESSING', 'FULFILLED']),
}).strict();

router.get('/products', validate(listSchema, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, q, active } = req.validated.query;
  const where = {
    ...(active ? { active: active === 'true' } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ] } : {}),
  };
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.product.count({ where }),
  ]);
  res.json({ products: products.map(withProductImages), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/orders', validate(listSchema, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, status, fulfillmentStatus } = req.validated.query;
  const where = { ...(status ? { status } : {}), ...(fulfillmentStatus ? { fulfillmentStatus } : {}) };
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { items: true },
    }),
    prisma.order.count({ where }),
  ]);
  res.json({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/inventory', validate(listSchema, 'query'), asyncHandler(async (req, res) => {
  const { page, limit, q, active } = req.validated.query;
  const where = {
    ...(active ? { active: active === 'true' } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
    ] } : {}),
  };
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      select: { id: true, slug: true, name: true, stock: true, active: true, updatedAt: true },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);
  res.json({ inventory: products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.patch('/orders/:id/fulfillment', validate(fulfillmentSchema), asyncHandler(async (req, res) => {
  const { fulfillmentStatus } = req.body;
  const where = {
    id: req.params.id,
    ...(fulfillmentStatus === 'UNFULFILLED' ? {} : { status: 'PAID' }),
  };
  const updated = await prisma.order.updateMany({ where, data: { fulfillmentStatus } });
  if (!updated.count) {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!order) throw new HttpError(404, 'Order not found');
    throw new HttpError(409, 'Only paid orders can be marked as processing or fulfilled');
  }
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, fulfillmentStatus: true, updatedAt: true },
  });
  res.json({ order });
}));

router.patch('/inventory/:productId', validate(stockSchema), asyncHandler(async (req, res) => {
  const updated = await prisma.product.updateMany({
    where: { id: req.params.productId },
    data: { stock: req.body.stock },
  });
  if (!updated.count) throw new HttpError(404, 'Product not found');
  const product = await prisma.product.findUnique({
    where: { id: req.params.productId },
    select: { id: true, slug: true, name: true, stock: true, updatedAt: true },
  });
  res.json({ product });
}));

export default router;
