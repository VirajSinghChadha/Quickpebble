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


def test_category_defaults_none_and_validates():
    assert parse_reply(reply(type="wait"), G).action.category == "none"
    assert parse_reply(reply(type="click", cell="A1", category="purchases"), G).action.category == "purchases"
    with pytest.raises(ValueError):
        parse_reply(reply(type="click", cell="A1", category="Not Valid!"), G)


def test_site_specific_categories_and_unknown_labels():
    ids = {"submit_quiz_answers", "skip_lessons"}
    ok = parse_reply(reply(type="click", cell="A1", category="submit_quiz_answers"), G, ids)
    assert (ok.action.category, ok.action.risk) == ("submit_quiz_answers", "low")
    odd = parse_reply(reply(type="click", cell="A1", category="make_coffee"), G, ids)
    assert (odd.action.category, odd.action.risk) == ("none", "high")


def test_refinement_maps_a_zoomed_cell_back_to_the_screen():
    from qp_agent.refine import FINE, crop_around, fine_to_screen
    g = Grid(cols=26, rows=16)
    raw = Image.new("RGB", (2600, 1600), "white")
    crop, bounds = crop_around(raw, g, "M8")
    assert crop.width >= 960
    x0, y0, x1, y1 = bounds
    assert x0 < 12 / 26 < x1 and y0 < 7 / 16 < y1
    # the centre of the crop maps to the centre of the chosen coarse cell
    ax, ay = fine_to_screen("F6", 1.0, 1.0, bounds)       # centre of a 12x12 grid = F6/G7 boundary
    assert abs(ax - 12.5 / 26) < 0.001 and abs(ay - 7.5 / 16) < 0.001
    assert 0 <= fine_to_screen("A1", 0, 0, bounds)[0] < fine_to_screen("L12", 1, 1, bounds)[0] <= 1
    assert FINE.cols == FINE.rows == 12


def test_edge_cells_stay_inside_the_screen():
    from qp_agent.refine import crop_around
    g = Grid(cols=26, rows=16)
    _, b = crop_around(Image.new("RGB", (1600, 1000), "white"), g, "A1")
    assert b[0] == 0 and b[1] == 0
    _, b = crop_around(Image.new("RGB", (1600, 1000), "white"), g, "Z16")
    assert b[2] == 1 and b[3] == 1


def test_action_accepts_refined_point_and_rejects_out_of_range():
    a = Action(type="click", cell="A1", ax=0.5, ay=0.25)
    assert (a.ax, a.ay) == (0.5, 0.25)
    with pytest.raises(ValueError):
        Action(type="click", cell="A1", ax=1.5, ay=0.1)


def test_tight_crop_is_centred_on_the_point_and_stays_on_screen():
    from qp_agent.refine import FINE2, crop_square_around, tight_crop, to_screen
    g = Grid(cols=26, rows=16)
    raw = Image.new("RGB", (3000, 1800), "white")
    img, b = tight_crop(raw, g, 0.5, 0.5)
    assert img.width >= 880 and abs((b[0] + b[2]) / 2 - 0.5) < 1e-6 and abs((b[1] + b[3]) / 2 - 0.5) < 1e-6
    # about one coarse cell wide: far tighter than the 3x3-cell first look
    assert 0.9 / 26 < b[2] - b[0] < 1.5 / 26
    _, edge = crop_square_around(raw, g, 0.0, 1.0)
    assert edge[0] == 0.0 and abs(edge[3] - 1.0) < 1e-9
    # the middle of the tight crop is the point we asked about
    x, y = to_screen(FINE2, "F6", 0.0, 0.0, b)
    assert abs(x - 0.5) < (b[2] - b[0]) / 10 and abs(y - 0.5) < (b[3] - b[1]) / 10


def test_corrections_may_nudge_but_not_leap():
    from qp_agent.refine import accept_correction
    g = Grid(cols=26, rows=16)
    assert accept_correction((0.5, 0.5), (0.5 + 0.3 / 26, 0.5), g)
    assert not accept_correction((0.5, 0.5), (0.5 + 2 / 26, 0.5), g)
    assert not accept_correction((0.5, 0.5), (0.5, 0.5 + 1 / 16), g)


def test_crosshair_keeps_size_and_marks_the_spot():
    from qp_agent.refine import draw_crosshair
    im = draw_crosshair(Image.new("RGB", (400, 300), "black"), 0.5, 0.5)
    assert im.size == (400, 300)
    assert im.getpixel((200, 150))[0] > 200   # yellow/white at the crosshair centre
