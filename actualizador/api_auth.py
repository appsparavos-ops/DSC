"""Small authentication helpers for machine-to-machine API calls."""

import hmac


def is_valid_bearer_token(expected_token, authorization_header):
    """Return whether an Authorization header contains the expected bearer token."""
    if not isinstance(expected_token, str) or not expected_token.strip():
        return False
    if not isinstance(authorization_header, str):
        return False

    parts = authorization_header.strip().split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False

    return hmac.compare_digest(parts[1], expected_token.strip())
