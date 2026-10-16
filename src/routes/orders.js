import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, asyncHandler } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { cartItemRowsSchema, normalizeCartItems, priceCart } from '../services/cart.js';

const router = Router();
const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
const checkoutSchema = z.object({
  items: cartItemRowsSchema,
  email: z.string().email().max(254).transform((email) => email.trim().toLowerCase()),
  successUrl: z.string().url().max(2000),
  cancelUrl: z.string().url().max(2000),
}).strict().transform(({ items, ...details }) => ({ ...details, items: normalizeCartItems(items) }))
  .refine(({ items }) => items.every(({ quantity }) => quantity <= 99), {
    message: 'Combined quantity for a product cannot exceed 99',
  });

router.post('/checkout', validate(checkoutSchema), asyncHandler(async (req, res) => {
  if (!stripe) throw new HttpError(503, 'Checkout is not configured');
  if (!config.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Payment confirmation is not configured');

  const { items, email, successUrl, cancelUrl } = req.body;
  for (const returnUrl of [successUrl, cancelUrl]) {
    if (!config.CORS_ORIGINS.includes(new URL(returnUrl).origin)) {
      throw new HttpError(400, 'Checkout return URLs must use an allowed storefront origin');
    }
  }
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) }, active: true },
    select: { id: true, slug: true, name: true, imageUrl: true, priceCents: true, currency: true, stock: true, active: true, isSample: true },
  });
  const cart = priceCart(items, products);
  if (cart.totalCents <= 0) throw new HttpError(400, 'Order total must be greater than zero');

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        userId: req.user?.id,
        email,
        currency: cart.currency,
        totalCents: cart.totalCents,
        items: { create: cart.items.map((item) => ({
          productId: item.productId,
          productName: item.name,
          productSlug: item.slug,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
        })) },
      },
    });
    for (const item of cart.items) {
      const result = await tx.product.updateMany({
        where: { id: item.productId, active: true, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (result.count !== 1) throw new HttpError(409, `${item.name} is no longer available in the requested quantity`);
    }
    return created;
  }, { isolationLevel: 'Serializable' });

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email,
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: cart.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: cart.currency,
          unit_amount: item.unitPriceCents,
          product_data: {
            name: item.name,
            ...(item.imageUrl ? { images: [item.imageUrl] } : {}),
          },
        },
      })),
    });
    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });
    res.status(201).json({ orderId: order.id, checkoutUrl: session.url });
  } catch (error) {
    if (session?.id) {
      try {
        await stripe.checkout.sessions.expire(session.id);
        await releaseReservation(order.id, 'CANCELLED');
      } catch (expireError) {
        console.error(`Could not expire Stripe session for pending order ${order.id}`, expireError);
      }
    } else {
      await releaseReservation(order.id, 'CANCELLED');
    }
    throw error;
  }
}));

async function releaseReservation(orderId, status) {
  await prisma.$transaction(async (tx) => {
    const changed = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING', inventoryReserved: true },
      data: { status, inventoryReserved: false },
    });
    if (!changed.count) return;
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
    for (const item of items) {
      if (item.productId) {
        await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
      }
    }
  });
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  res.json({ orders });
}));

router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    select: {
      id: true,
      email: true,
      status: true,
      fulfillmentStatus: true,
      currency: true,
      totalCents: true,
      createdAt: true,
      updatedAt: true,
      items: true,
    },
  });
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ order });
}));

export async function handleStripeWebhook(rawBody, signature) {
  if (!stripe || !config.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Payment webhook is not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new HttpError(400, 'Invalid Stripe webhook signature');
  }

  const session = event.data.object;
  const orderId = session.metadata?.orderId || session.client_reference_id;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.stripeEvent.create({ data: { stripeId: event.id, type: event.type } });
      if (!orderId) return;

      const isPaidEvent = event.type === 'checkout.session.completed'
        || event.type === 'checkout.session.async_payment_succeeded';
      const isReleaseEvent = event.type === 'checkout.session.expired'
        || event.type === 'checkout.session.async_payment_failed';
      if (!isPaidEvent && !isReleaseEvent) return;

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || (order.stripeSessionId && order.stripeSessionId !== session.id)) return;
      if (isPaidEvent) {
        if (session.payment_status !== 'paid') return;
        if (session.amount_total !== order.totalCents || session.currency !== order.currency) {
          throw new Error(`Stripe amount/currency mismatch for order ${order.id}`);
        }
        await tx.order.updateMany({
          where: {
            id: orderId,
            status: 'PENDING',
            inventoryReserved: true,
            OR: [{ stripeSessionId: session.id }, { stripeSessionId: null }],
          },
          data: { status: 'PAID', inventoryReserved: false, stripeSessionId: session.id },
        });
      } else {
        const changed = await tx.order.updateMany({
          where: {
            id: orderId,
            status: 'PENDING',
            inventoryReserved: true,
            OR: [{ stripeSessionId: session.id }, { stripeSessionId: null }],
          },
          data: {
            status: event.type.endsWith('expired') ? 'CANCELLED' : 'FAILED',
            inventoryReserved: false,
            stripeSessionId: session.id,
          },
        });
        if (changed.count) {
          const items = await tx.orderItem.findMany({ where: { orderId }, select: { productId: true, quantity: true } });
          for (const item of items) {
            if (item.productId) {
              await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
            }
          }
        }
      }
    });
  } catch (error) {
    if (error.code === 'P2002') {
      const duplicate = await prisma.stripeEvent.findUnique({ where: { stripeId: event.id }, select: { id: true } });
      if (duplicate) return;
    }
    throw error;
  }
}

export default router;
