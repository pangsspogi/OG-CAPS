import { z } from 'zod';
import { HttpError } from '../errors.js';

export const cartItemRowsSchema = z.array(z.object({
  productId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(99),
}).strict()).min(1).max(50);

export function normalizeCartItems(items) {
  const quantities = new Map();
  for (const { productId, quantity } of items) {
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export const cartInputSchema = z.object({
  items: cartItemRowsSchema,
}).strict().transform(({ items }) => {
  return { items: normalizeCartItems(items) };
}).refine(({ items }) => items.every(({ quantity }) => quantity <= 99), {
  message: 'Combined quantity for a product cannot exceed 99',
});

export function priceCart(items, products) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const lines = items.map(({ productId, quantity }) => {
    const product = byId.get(productId);
    if (!product || !product.active) throw new HttpError(400, 'One or more products are unavailable');
    if (product.isSample) throw new HttpError(400, `${product.name} is sample catalog data and cannot be purchased`);
    if (product.stock < quantity) throw new HttpError(409, `${product.name} has insufficient stock`);
    if (product.currency !== 'usd') throw new HttpError(400, 'Product currency is not supported');
    return {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl: product.imageUrl,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: product.priceCents * quantity,
    };
  });
  const totalCents = lines.reduce((total, item) => total + item.lineTotalCents, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents > 2147483647) {
    throw new HttpError(400, 'Order total exceeds the supported limit');
  }
  return {
    items: lines,
    currency: 'usd',
    totalCents,
  };
}
