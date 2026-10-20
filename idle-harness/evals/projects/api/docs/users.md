# Users

Id prefix `usr`.

| Field | Type | Required |
|---|---|---|
| `email` | string | yes |
| `name` | string | yes |
| `role` | one of `admin`, `member` | no |

- `GET /users` — every user
- `GET /users/:id` — one user
- `POST /users` — create a user
- `PATCH /users/:id` — change some fields
- `DELETE /users/:id` — delete it
