// What a product is made of.
export const schema = {
  sku: { type: 'string', required: true },
  title: { type: 'string', required: true },
  priceCents: { type: 'integer', required: true },
  active: { type: 'boolean', required: false },
};
