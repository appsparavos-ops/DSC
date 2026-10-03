import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


REPO_ROOT = Path(__file__).resolve().parents[1]
FIREBASE_SERVICE_PATH = REPO_ROOT / "actualizador" / "firebase_service.py"


def load_firebase_service_without_external_dependencies():
    """Load the module with lightweight Firebase/dotenv stubs for unit tests."""
    firebase_admin_stub = types.ModuleType("firebase_admin")
    firebase_admin_stub.credentials = types.SimpleNamespace(Certificate=Mock())
    firebase_admin_stub.db = types.SimpleNamespace(reference=Mock())
    firebase_admin_stub._apps = {}
    firebase_admin_stub.initialize_app = Mock()
    firebase_admin_stub.get_app = Mock()

    dotenv_stub = types.ModuleType("dotenv")
    dotenv_stub.load_dotenv = Mock()

    module = types.ModuleType("firebase_service_under_test")
    module.__file__ = str(FIREBASE_SERVICE_PATH)
    source = FIREBASE_SERVICE_PATH.read_text(encoding="utf-8")

    with patch.dict(
        sys.modules,
        {"firebase_admin": firebase_admin_stub, "dotenv": dotenv_stub},
    ):
        exec(compile(source, str(FIREBASE_SERVICE_PATH), "exec"), module.__dict__)

    return module


class AutoSeasonsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.firebase_service = load_firebase_service_without_external_dependencies()

    def test_parses_comma_separated_values_and_preserves_order(self):
        seasons = self.firebase_service.parse_auto_seasons(
            " 2026, 2026-2027, 2026, , 2027 "
        )

        self.assertEqual(seasons, ["2026", "2026-2027", "2027"])

    def test_missing_or_blank_node_has_no_seasons(self):
        self.assertEqual(self.firebase_service.parse_auto_seasons(None), [])
        self.assertEqual(self.firebase_service.parse_auto_seasons("  ,  "), [])

    def test_rejects_unexpected_node_format(self):
        with self.assertRaises(ValueError):
            self.firebase_service.parse_auto_seasons(["2026", "2026-2027"])

    def test_reads_the_root_auto_seasons_node(self):
        root_ref = Mock()
        auto_seasons_ref = Mock()
        root_ref.child.return_value = auto_seasons_ref
        auto_seasons_ref.get.return_value = "2026, 2026-2027"

        seasons = self.firebase_service.get_auto_seasons(root_ref)

        root_ref.child.assert_called_once_with("AutoSeasons")
        auto_seasons_ref.get.assert_called_once_with()
        self.assertEqual(seasons, ["2026", "2026-2027"])


if __name__ == "__main__":
    unittest.main()
