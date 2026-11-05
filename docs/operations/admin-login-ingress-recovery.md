# Login ingress peer recovery

The private signer resolves the exact Docker alias `coolify-proxy` for each
authentication request. Its image sets `ADMIN_INGRESS_TRAEFIK_HOSTNAME` to that
alias, so a proxy address change after a server restart needs no manual update.
DNS failures, multiple distinct IPv4 answers and timeouts deny the request;
dynamic mode never falls back to `ADMIN_INGRESS_TRAEFIK_IPV4`.

Keep the signer on the private Coolify network with no published ports, its
existing signing key, read-only filesystem, dropped capabilities and
`no-new-privileges`. Keep ForwardAuth's `trustForwardHeader=false` and
`forwardBody=false`. The resolved address must still match the socket peer.

Regression checks: `node --test scripts/admin-login-ingress-signer.test.mjs`
and the shared ingress verifier tests. Public readiness checks must not send
an OTP, reuse a customer's challenge or issue a customer session.
