import unittest

from actualizador.api_auth import is_valid_bearer_token


class BearerTokenTests(unittest.TestCase):
    def test_accepts_the_correct_bearer_token(self):
        self.assertTrue(is_valid_bearer_token("secret-value", "Bearer secret-value"))

    def test_accepts_case_insensitive_bearer_scheme(self):
        self.assertTrue(is_valid_bearer_token("secret-value", "bEaReR secret-value"))

    def test_rejects_missing_or_wrong_tokens(self):
        self.assertFalse(is_valid_bearer_token("secret-value", ""))
        self.assertFalse(is_valid_bearer_token("secret-value", "Bearer wrong-value"))
        self.assertFalse(is_valid_bearer_token("", "Bearer secret-value"))

    def test_rejects_malformed_authorization_headers(self):
        self.assertFalse(is_valid_bearer_token("secret-value", "secret-value"))
        self.assertFalse(is_valid_bearer_token("secret-value", "Basic secret-value"))
        self.assertFalse(is_valid_bearer_token("secret-value", "Bearer"))
        self.assertFalse(is_valid_bearer_token("secret-value", "Bearer one two"))


if __name__ == "__main__":
    unittest.main()
