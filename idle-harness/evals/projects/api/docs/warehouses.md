# Warehouses

Id prefix `wrh`.

| Field | Type | Required |
|---|---|---|
| `code` | string | yes |
| `city` | string | yes |
| `capacity` | integer | no |

- `GET /warehouses` — every warehouse
- `GET /warehouses/:id` — one warehouse
- `POST /warehouses` — create a warehouse
- `PATCH /warehouses/:id` — change some fields
- `DELETE /warehouses/:id` — delete it
