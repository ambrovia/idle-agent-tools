# Orders

Id prefix `ord`.

| Field | Type | Required |
|---|---|---|
| `userId` | string | yes |
| `totalCents` | integer | yes |
| `status` | one of `open`, `paid`, `shipped` | no |

- `GET /orders` — every order
- `GET /orders/:id` — one order
- `POST /orders` — create a order
- `PATCH /orders/:id` — change some fields
- `DELETE /orders/:id` — delete it
