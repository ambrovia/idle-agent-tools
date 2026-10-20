// What a user is made of.
export const schema = {
  email: { type: 'string', required: true },
  name: { type: 'string', required: true },
  role: { type: 'enum', values: ['admin', 'member'], required: false },
};
