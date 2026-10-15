import unittest
from reservation import reserve

# @spec {"artifact_id":"SPEC-RESERVATION","artifact_type":"spec","revision":1,"status":"accepted","context_ref":"../domain-context.md"}
# Observable delta: add a local reservation operation; acceptance lives below.


class ReservationSpec(unittest.TestCase):
    # @acceptance {"item_id":"AC-AT-CAPACITY","lifetime":"business"}
    def test_at_capacity(self):
        """残数と同じ数量を予約すると、上限まで確保できる。"""
        state = {"capacity": 10, "reserved": 7}
        self.assertEqual(reserve(state, 3), {"ok": True, "reserved": 10})
        self.assertEqual(state["reserved"], 10)

    # @acceptance {"item_id":"AC-EXCEEDS-CAPACITY","lifetime":"business"}
    def test_exceeds_capacity(self):
        """残数を超えて予約すると、拒否され確保済み数量は変わらない。"""
        state = {"capacity": 10, "reserved": 7}
        self.assertEqual(reserve(state, 4), {"ok": False, "error": "CAPACITY_EXCEEDED"})
        self.assertEqual(state["reserved"], 7)

    # @acceptance {"item_id":"AC-INVALID-QUANTITY","lifetime":"business"}
    def test_invalid_quantity(self):
        """正の整数でない数量は拒否され、確保済み数量は変わらない。"""
        for quantity in [0, -1, 1.5, "3", True, float("nan")]:
            with self.subTest(quantity=quantity):
                state = {"capacity": 10, "reserved": 7}
                self.assertEqual(reserve(state, quantity), {"ok": False, "error": "INVALID_QUANTITY"})
                self.assertEqual(state["reserved"], 7)
