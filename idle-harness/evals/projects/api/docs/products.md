# Products

Id prefix `prd`.

| Field | Type | Required |
|---|---|---|
| `sku` | string | yes |
| `title` | string | yes |
| `priceCents` | integer | yes |
| `active` | boolean | no |

- `GET /products` — every product
- `GET /products/:id` — one product
- `POST /products` — create a product
- `PATCH /products/:id` — change some fields
- `DELETE /products/:id` — delete it
