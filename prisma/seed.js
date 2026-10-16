import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { config } from '../src/config.js';

const prisma = new PrismaClient();

try {
  const collectionSpecs = [
    { slug: 'new-arrivals', name: 'New Arrivals', description: 'Sample-only products for the New Arrivals collection.' },
    { slug: 'fitted-caps', name: 'Fitted Caps', description: 'Sample-only products for the Fitted Caps collection.' },
    { slug: 'vintage-caps', name: 'Vintage Caps', description: 'Sample-only products for the Vintage Caps collection.' },
    { slug: 'accessories', name: 'Accessories', description: 'Sample-only products for the Accessories collection.' },
  ];
  const collections = {};
  for (const spec of collectionSpecs) {
    collections[spec.slug] = await prisma.collection.upsert({
      where: { slug: spec.slug },
      update: { name: spec.name, description: spec.description },
      create: spec,
    });
  }

  const samples = [
    { collection: 'new-arrivals', slug: 'sample-new-black-cap', name: 'SAMPLE ONLY — New Black Cap', color: 'Black', priceCents: 3200, stock: 25, imageUrl: '/assets/images/products/main.jpg', featured: true },
    { collection: 'new-arrivals', slug: 'sample-new-stone-cap', name: 'SAMPLE ONLY — New Tan Cap', color: 'Tan', priceCents: 3400, stock: 18, imageUrl: '/assets/images/products/product-tan-cap.jpg' },
    { collection: 'fitted-caps', slug: 'sample-fitted-black-cap', name: 'SAMPLE ONLY — Fitted White LA Cap', color: 'White', priceCents: 3600, stock: 12, imageUrl: '/assets/images/products/product-white-la-cap.jpg' },
    { collection: 'fitted-caps', slug: 'sample-fitted-navy-cap', name: 'SAMPLE ONLY — Fitted White NY Cap', color: 'White', priceCents: 3600, stock: 12, imageUrl: '/assets/images/products/product-white-ny-cap.jpg' },
    { collection: 'vintage-caps', slug: 'sample-vintage-washed-cap', name: 'SAMPLE ONLY — Vintage Washed Cap', color: 'Washed Black', priceCents: 3800, stock: 8, imageUrl: '/assets/images/products/new-arrival-lookbook.jpg' },
    { collection: 'vintage-caps', slug: 'sample-vintage-cream-cap', name: 'SAMPLE ONLY — Vintage Cream Cap', color: 'Cream', priceCents: 3800, stock: 8 },
    { collection: 'accessories', slug: 'sample-logo-keychain', name: 'SAMPLE ONLY — Logo Keychain', color: 'Black', priceCents: 900, stock: 30 },
    { collection: 'accessories', slug: 'sample-logo-socks', name: 'SAMPLE ONLY — Logo Socks', color: 'White', priceCents: 1200, stock: 30 },
  ];
  for (const sample of samples) {
    const { collection: collectionSlug, ...product } = sample;
    product.description = 'Sample catalog data only; not a real product or statement of available stock.';
    product.collectionId = collections[collectionSlug].id;
    product.isSample = true;
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        color: product.color,
        ...(product.imageUrl ? { imageUrl: product.imageUrl } : {}),
        priceCents: product.priceCents,
        featured: Boolean(product.featured),
        collectionId: product.collectionId,
        isSample: true,
      },
      create: product,
    });
  }

  if (config.ADMIN_EMAIL && config.ADMIN_PASSWORD) {
    const passwordHash = await bcrypt.hash(config.ADMIN_PASSWORD, 12);
    await prisma.user.upsert({
      where: { email: config.ADMIN_EMAIL.toLowerCase() },
      update: { passwordHash, role: 'ADMIN' },
      create: { email: config.ADMIN_EMAIL.toLowerCase(), passwordHash, role: 'ADMIN' },
    });
    console.log(`Seeded administrator ${config.ADMIN_EMAIL.toLowerCase()}`);
  } else {
    console.log('No administrator created; configure ADMIN_EMAIL and ADMIN_PASSWORD before seeding to create one.');
  }
} finally {
  await prisma.$disconnect();
}
