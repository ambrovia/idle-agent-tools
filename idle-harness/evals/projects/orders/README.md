# Shop data

The shop's orders, customers and products for the first half of 2026, as exported from the shop system into `data/`.

- `orders.csv` — one row per order line: `order_id`, `line`, `ordered_at`, `customer_id`, `country`, `sku`, `quantity`, `price` (per unit), `price_unit`, `status`.
- `customers.csv` — `customer_id`, `name`, `segment` (retail or wholesale), `signed_up`.
- `products.csv` — `sku`, `name`, `category`.

Revenue is quantity times unit price over fulfilled order lines. An order is fulfilled once it is shipped or delivered; cancelled and refunded orders bring no revenue, and pending ones none yet. Prices are in euros unless `price_unit` says cents. Each order line (`order_id`, `line`) counts once; the export sometimes repeats a row.

Questions about the data are answered in `answers/`, one file per question.
