// A shopping cart: items with a price in cents and a quantity.
export function total(items) {
  let sum = 0;
  for (let i = 1; i < items.length; i++) sum += items[i].price * items[i].quantity;
  return sum;
}

export function discount(totalCents, percent) {
  return Math.round(totalCents * percent / 100);
}
