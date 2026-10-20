# Invoices

Id prefix `inv`.

| Field | Type | Required |
|---|---|---|
| `orderId` | string | yes |
| `amountCents` | integer | yes |
| `dueOn` | date | yes |

- `GET /invoices` — every invoice
- `GET /invoices/:id` — one invoice
- `POST /invoices` — create a invoice
- `PATCH /invoices/:id` — change some fields
- `DELETE /invoices/:id` — delete it
