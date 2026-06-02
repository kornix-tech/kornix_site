# KORNIX Frontend VDS Security Context

Current frontend security target: `KORNIX_FRONTEND_VDS_SECURITY_READY`.

Production assumptions:

- Public entrypoint is HTTPS reverse proxy.
- Frontend is static Nginx container.
- API base is same-origin `/api`.
- Auth is BFF/session cookie based.
- Frontend does not store secrets or tokens.
- Backend enforces tenant scope, managed scope, CSRF and approval workflow.

Local WSL/Docker workflow remains available through `.env.local.example` and
`.env.integration.example`.
