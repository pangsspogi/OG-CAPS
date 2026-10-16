import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, asyncHandler } from '../errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withProductImages } from '../services/catalog.js';
import { productImageUrlSchema } from '../services/product-image.js';

const router = Router();
const slugSchema = z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const productSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().max(5000).default(''),
  imageUrl: productImageUrlSchema.nullable().optional(),
  color: z.string().trim().min(1).max(60).nullable().optional(),
  priceCents: z.number().int().min(0).max(100000000),
  currency: z.literal('usd').default('usd'),
  stock: z.number().int().min(0).max(1000000).default(0),
  active: z.boolean().default(true),
  featured: z.boolean().default(false),
  collectionId: z.string().min(1).nullable().optional(),
}).strict();
const collectionSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(3000).default(''),
}).strict();
const paginationBaseSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  collection: z.string().optional(),
  color: z.string().trim().min(1).max(60).optional(),
  q: z.string().trim().max(100).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['featured', 'newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc']).default('newest'),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.enum(['true', 'false']).optional(),
}).strict();
const priceRangeSchema = ({ minPrice, maxPrice }) =>
  minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice;
const paginationSchema = paginationBaseSchema.refine(priceRangeSchema, {
  message: 'minPrice must not exceed maxPrice',
});

function productWhere({ collection, color, q, search, minPrice, maxPrice, inStock }) {
  const term = q || search;
  return {
    active: true,
    ...(collection ? { collection: { slug: collection } } : {}),
    ...(color ? { color: { equals: color, mode: 'insensitive' } } : {}),
    ...((minPrice !== undefined || maxPrice !== undefined)
      ? { priceCents: { ...(minPrice !== undefined ? { gte: minPrice } : {}), ...(maxPrice !== undefined ? { lte: maxPrice } : {}) } }
      : {}),
    ...(inStock === 'true' ? { stock: { gt: 0 } } : {}),
    ...(inStock === 'false' ? { stock: 0 } : {}),
    ...(term ? { OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ] } : {}),
  };
}

const sortOrders = {
  featured: [{ featured: 'desc' }, { createdAt: 'desc' }],
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  price_asc: { priceCents: 'asc' },
  price_desc: { priceCents: 'desc' },
  name_asc: { name: 'asc' },
  name_desc: { name: 'desc' },
};

router.get('/products', validate(paginationSchema, 'query'), asyncHandler(async (req, res) => {
  const query = req.validated.query;
  const { page, limit } = query;
  const where = productWhere(query);
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: sortOrders[query.sort],
      skip: (page - 1) * limit,
      take: limit,
      include: { collection: { select: { id: true, slug: true, name: true } } },
    }),
    prisma.product.count({ where }),
  ]);
  res.json({ products: products.map(withProductImages), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/products/:slug', asyncHandler(async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { slug: req.params.slug, active: true },
    include: { collection: { select: { id: true, slug: true, name: true } } },
  });
  if (!product) throw new HttpError(404, 'Product not found');
  res.json({ product: withProductImages(product) });
}));

router.get('/collections', asyncHandler(async (req, res) => {
  const collections = await prisma.collection.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: { where: { active: true } } } } },
  });
  res.json({ collections });
}));

router.get('/collections/:slug/products', validate(paginationBaseSchema.omit({ collection: true }).refine(priceRangeSchema, {
  message: 'minPrice must not exceed maxPrice',
}), 'query'), asyncHandler(async (req, res) => {
  const collection = await prisma.collection.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
  if (!collection) throw new HttpError(404, 'Collection not found');
  const query = req.validated.query;
  const { page, limit } = query;
  const where = { ...productWhere(query), collectionId: collection.id };
  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy: sortOrders[query.sort],
      skip: (page - 1) * limit,
      take: limit,
      include: { collection: { select: { id: true, slug: true, name: true } } },
    }),
    prisma.product.count({ where }),
  ]);
  res.json({ products: products.map(withProductImages), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/collections/:slug', asyncHandler(async (req, res) => {
  const collection = await prisma.collection.findUnique({
    where: { slug: req.params.slug },
    include: { products: { where: { active: true }, orderBy: { createdAt: 'desc' } } },
  });
  if (!collection) throw new HttpError(404, 'Collection not found');
  collection.products = collection.products.map(withProductImages);
  res.json({ collection });
}));

router.post('/admin/products', requireAuth, requireAdmin, validate(productSchema), asyncHandler(async (req, res) => {
  const product = await prisma.product.create({ data: req.body });
  res.status(201).json({ product });
}));

router.patch('/admin/products/:id', requireAuth, requireAdmin, validate(productSchema.partial()), asyncHandler(async (req, res) => {
  if (Object.keys(req.body).length === 0) throw new HttpError(400, 'At least one product field is required');
  const product = await prisma.product.update({ where: { id: req.params.id }, data: req.body });
  res.json({ product });
}));

router.delete('/admin/products/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
  res.status(204).end();
}));

router.post('/admin/collections', requireAuth, requireAdmin, validate(collectionSchema), asyncHandler(async (req, res) => {
  const collection = await prisma.collection.create({ data: req.body });
  res.status(201).json({ collection });
}));

export default router;
