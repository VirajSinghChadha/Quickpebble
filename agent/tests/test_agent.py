import json

import pytest
from PIL import Image

from qp_agent.gemini import parse_reply
from qp_agent.grid import Grid, draw_grid
from qp_agent.schema import Action

G = Grid(cols=24, rows=14)


def reply(**action):
    return json.dumps({"user": {"thinking": "I see a button.", "message": "Clicking it."}, "action": action})


def test_cell_to_screen_centre_and_offsets():
    assert G.to_screen("A1", 0.5, 0.5, 2400, 1400) == (50, 50)
    assert G.to_screen("X14", 1.0, 1.0, 2400, 1400) == (2399, 1399)
    assert G.to_screen("M7", 0.0, 0.0, 2400, 1400) == (1200, 600)


def test_cell_outside_grid_is_rejected():
    for bad in ("Z1", "A15", "A0", "11", "AA1"):
        with pytest.raises(ValueError):
            G.parse(bad)


def test_valid_two_part_reply():
    r = parse_reply(reply(type="click", cell="M7", fx=0.2, fy=0.8), G)
    assert r.user.message == "Clicking it." and r.action.cell == "M7"


def test_json_wrapped_in_prose_still_parses():
    assert parse_reply("Sure! " + reply(type="wait") + " done", G).action.type == "wait"


@pytest.mark.parametrize("action", [
    {"type": "shell", "text": "rm -rf /"},
    {"type": "click"},
    {"type": "click", "cell": "ZZ99"},
    {"type": "click", "cell": "Z1"},
    {"type": "type", "text": ""},
    {"type": "key", "key": "cmd+shift+alt+ctrl+bananas"},
])
def test_invalid_actions_rejected(action):
    with pytest.raises(ValueError):
        parse_reply(reply(**action), G)


def test_missing_user_part_rejected():
    with pytest.raises(ValueError):
        parse_reply(json.dumps({"action": {"type": "wait"}}), G)


def test_values_are_clamped():
    a = Action(type="scroll", cell="B2", fx=5, fy=-3, amount=99)
    assert (a.fx, a.fy, a.amount, a.direction) == (1.0, 0.0, 10, "down")


def test_grid_overlay_keeps_size():
    img = Image.new("RGB", (1600, 900), "white")
    assert draw_grid(img, G).size == (1600, 900)


def test_risk_defaults_low_and_rejects_unknown():
    assert parse_reply(reply(type="wait"), G).action.risk == "low"
    assert parse_reply(reply(type="click", cell="A1", risk="high"), G).action.risk == "high"
    with pytest.raises(ValueError):
        parse_reply(reply(type="click", cell="A1", risk="maybe"), G)
