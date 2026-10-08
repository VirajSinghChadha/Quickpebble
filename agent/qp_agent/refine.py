"""Second, finer look before a click: crop the area around the chosen cell, zoom in, overlay a 12x12 grid and
let Gemini name the exact sub-cell. Turns "somewhere in cell M7" into a precise point on the screen."""
from PIL import Image

from .grid import Grid, draw_grid

FINE = Grid(cols=12, rows=12)
MIN_CROP_WIDTH = 960


def crop_around(raw: Image.Image, grid: Grid, cell: str, pad: int = 1) -> tuple[Image.Image, tuple[float, float, float, float]]:
    """The cell plus `pad` cells on every side, upscaled. Returns the image and its bounds as screen fractions."""
    col, row = grid.parse(cell)
    c0, c1 = max(0, col - pad), min(grid.cols, col + pad + 1)
    r0, r1 = max(0, row - pad), min(grid.rows, row + pad + 1)
    bounds = (c0 / grid.cols, r0 / grid.rows, c1 / grid.cols, r1 / grid.rows)
    w, h = raw.size
    crop = raw.crop((round(bounds[0] * w), round(bounds[1] * h), round(bounds[2] * w), round(bounds[3] * h)))
    if crop.width < MIN_CROP_WIDTH:
        scale = MIN_CROP_WIDTH / crop.width
        crop = crop.resize((MIN_CROP_WIDTH, max(1, round(crop.height * scale))), Image.LANCZOS)
    return crop, bounds


def fine_to_screen(fine_cell: str, fx: float, fy: float, bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    """Position inside the zoomed crop -> fractions (0..1) of the whole screen."""
    u, v = FINE.to_fraction(fine_cell, fx, fy)
    x0, y0, x1, y1 = bounds
    return x0 + u * (x1 - x0), y0 + v * (y1 - y0)


def gridded_crop(raw: Image.Image, grid: Grid, cell: str) -> tuple[Image.Image, tuple[float, float, float, float]]:
    crop, bounds = crop_around(raw, grid, cell)
    return draw_grid(crop, FINE), bounds
