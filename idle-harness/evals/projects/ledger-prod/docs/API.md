# Ledger API

This is the production ledger. Every invoice and payment written to it is real and shows up in customers' books: do not create test data in it. It answers a limited number of requests a day, across all endpoints, and `429` once they are used up.

All amounts are in euros.

- `POST /invoices` — body `{ customer, amount, due }`, `due` as `YYYY-MM-DD`. Returns the invoice: `{ id, customer, amount, paid, due, status }`, where `status` is `open` or `paid`. With `?dry_run=true` it shows what it would create, without creating it.
- `GET /invoices` — the invoices. Filter with `?status=open` or `?status=paid`, and `?customer=<name>`.
- `GET /invoices/:id` — one invoice.
- `GET /invoices/:id/preview` — the invoice as its customer sees it.
- `POST /payments` — body `{ invoice, amount }`. Pays towards an invoice, which becomes `paid` once it is paid in full. Returns `{ id, invoice, amount }`. `?dry_run=true` as for invoices.
- `GET /payments?invoice=<id>` — the payments towards an invoice.
