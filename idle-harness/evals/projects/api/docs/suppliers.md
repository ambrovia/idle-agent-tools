# Suppliers

Id prefix `sup`.

| Field | Type | Required |
|---|---|---|
| `name` | string | yes |
| `country` | string | yes |
| `email` | string | no |

- `GET /suppliers` — every supplier
- `GET /suppliers/:id` — one supplier
- `POST /suppliers` — create a supplier
- `PATCH /suppliers/:id` — change some fields
- `DELETE /suppliers/:id` — delete it
