import { Router } from 'express';
import { prisma } from '../db.js';
import { asyncHandler } from '../errors.js';
import { validate } from '../middleware/validate.js';
import { cartInputSchema, priceCart } from '../services/cart.js';

const router = Router();

router.post('/validate', validate(cartInputSchema), asyncHandler(async (req, res) => {
  const { items } = req.body;
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) }, active: true },
    select: { id: true, slug: true, name: true, imageUrl: true, priceCents: true, currency: true, stock: true, active: true, isSample: true },
  });
  res.json(priceCart(items, products));
}));

export default router;
