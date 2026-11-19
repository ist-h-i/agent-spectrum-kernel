import unittest
from reservation import reserve

# @spec {"artifact_id":"SPEC-RESERVATION","artifact_type":"spec","revision":2,"status":"accepted","context_ref":"../domain-context.md"}
# Revision 2 adds an under-capacity acceptance item and a second over-capacity example.


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
        for capacity, quantity in [(10, 4), (8, 2)]:
            with self.subTest(capacity=capacity, quantity=quantity):
                before = {"capacity": capacity, "reserved": 7}
                state = before.copy()
                self.assertEqual(reserve(state, quantity), {"ok": False, "error": "CAPACITY_EXCEEDED"})
                self.assertEqual(state, before)

    # @acceptance {"item_id":"AC-INVALID-QUANTITY","lifetime":"business"}
    def test_invalid_quantity(self):
        """正の整数でない数量は拒否され、確保済み数量は変わらない。"""
        for quantity in [0, -1, 1.5, "3", True, float("nan")]:
            with self.subTest(quantity=quantity):
                state = {"capacity": 10, "reserved": 7}
                self.assertEqual(reserve(state, quantity), {"ok": False, "error": "INVALID_QUANTITY"})
                self.assertEqual(state["reserved"], 7)

    # @acceptance {"item_id":"AC-UNDER-CAPACITY","lifetime":"business"}
    def test_under_capacity(self):
        """残数未満を予約すると、その数量だけ確保できる。"""
        state = {"capacity": 8, "reserved": 4}
        self.assertEqual(reserve(state, 2), {"ok": True, "reserved": 6})
        self.assertEqual(state["reserved"], 6)
