// What a invoice is made of.
export const schema = {
  orderId: { type: 'string', required: true },
  amountCents: { type: 'integer', required: true },
  dueOn: { type: 'date', required: true },
};
