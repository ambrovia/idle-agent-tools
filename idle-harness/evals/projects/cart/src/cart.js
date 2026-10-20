// A shopping cart: items with a price in cents and a quantity.
export function total(items) {
  let sum = 0;
  for (const item of items) sum += item.price * item.quantity;
  return sum;
}

export function discount(totalCents, percent) {
  return Math.round(totalCents * (100 - percent) / 100);
}
