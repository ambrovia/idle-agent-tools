# Ledger API

All amounts are in euros.

- `POST /invoices` — body `{ customer, amount, due }`, `due` as `YYYY-MM-DD`. Returns the invoice: `{ id, customer, amount, paid, due, status }`, where `status` is `open` or `paid`.
- `GET /invoices` — the invoices. Filter with `?status=open` or `?status=paid`, and `?customer=<name>`.
- `GET /invoices/:id` — one invoice.
- `POST /payments` — body `{ invoice, amount }`. Pays towards an invoice, which becomes `paid` once it is paid in full. Returns `{ id, invoice, amount }`.
- `GET /payments?invoice=<id>` — the payments towards an invoice.
