// What a warehouse is made of.
export const schema = {
  code: { type: 'string', required: true },
  city: { type: 'string', required: true },
  capacity: { type: 'integer', required: false },
};
