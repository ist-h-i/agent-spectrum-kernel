"""Standalone example only, not a production reservation service."""


def reserve(state, quantity):
    if type(quantity) is not int or quantity <= 0:
        return {"ok": False, "error": "INVALID_QUANTITY"}
    if state["reserved"] + quantity > state["capacity"]:
        return {"ok": False, "error": "CAPACITY_EXCEEDED"}
    state["reserved"] += quantity
    return {"ok": True, "reserved": state["reserved"]}
