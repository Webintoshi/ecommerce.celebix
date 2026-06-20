# Abandoned Cart PII Visibility

Abandoned cart contact data is treated as admin-only operational data.

- Full customer name, email, and phone are shown only in authenticated admin surfaces that pass store-role authorization.
- The current full-PII admin policy is limited to `super_admin`; lower roles must receive `403`, masked data, or no PII by default.
- Public storefront abandoned-cart endpoints must not expose raw name, email, or phone. Public `GET /api/abandoned-carts` must stay disabled.
- Umami and storefront analytics event payloads must not include raw name, email, or phone.
- Store owners must ensure their KVKK/privacy/cookie notices cover abandoned-cart tracking and recovery purposes. Separate notice or explicit consent may be required depending on the store's legal basis and implementation.
