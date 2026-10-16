export function withProductImages(product) {
  return { ...product, images: product.imageUrl ? [product.imageUrl] : [] };
}
