// What a order is made of.
export const schema = {
  userId: { type: 'string', required: true },
  totalCents: { type: 'integer', required: true },
  status: { type: 'enum', values: ['open', 'paid', 'shipped'], required: false },
};
