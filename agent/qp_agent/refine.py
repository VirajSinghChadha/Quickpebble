"""Second, finer look before a click: crop the area around the chosen cell, zoom in, overlay a 12x12 grid and
let Gemini name the exact sub-cell. Turns "somewhere in cell M7" into a precise point on the screen."""

from __future__ import annotations
from PIL import Image

from .grid import Grid, draw_grid

FINE = Grid(cols=12, rows=12)
MIN_CROP_WIDTH = 960


def _dense(grid: Grid) -> float:
    """The zoom steps were tuned for ~55 px cells. A denser grid has smaller cells, so distances counted in cells scale up
    to keep covering the same real area (the first look can be a cell or two off)."""
    return 1.6 if grid.cols > 30 else 1.0


def crop_around(raw: Image.Image, grid: Grid, cell: str, pad: int | None = None) -> tuple[Image.Image, tuple[float, float, float, float]]:
    """The cell plus `pad` cells on every side, upscaled. Returns the image and its bounds as screen fractions."""
    pad = pad if pad is not None else (3 if _dense(grid) > 1 else 1)
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


# ---- stage 2: a much tighter look around the stage-1 point, with a crosshair to correct -----------------

FINE2 = Grid(cols=10, rows=10)
SPAN_CELLS = 1.2          # stage-2 crop is about one coarse cell wide (roughly 15x magnification)
MAX_JUMP_CELLS = 0.6      # a correction bigger than this is treated as a mistake and ignored


def crop_square_around(raw: Image.Image, grid: Grid, ax: float, ay: float, span_cells: float | None = None) -> tuple[Image.Image, tuple[float, float, float, float]]:
    """A crop about `span_cells` coarse cells wide, centred on a screen point (kept inside the screen), upscaled."""
    span_cells = span_cells if span_cells is not None else SPAN_CELLS * _dense(grid)
    w_frac, h_frac = span_cells / grid.cols, span_cells / grid.rows
    x0 = min(max(ax - w_frac / 2, 0.0), 1 - w_frac)
    y0 = min(max(ay - h_frac / 2, 0.0), 1 - h_frac)
    bounds = (x0, y0, x0 + w_frac, y0 + h_frac)
    w, h = raw.size
    crop = raw.crop((round(bounds[0] * w), round(bounds[1] * h), round(bounds[2] * w), round(bounds[3] * h)))
    scale = max(1.0, 900 / max(1, crop.width))
    return crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS), bounds


def draw_crosshair(img: Image.Image, u: float, v: float) -> Image.Image:
    """Yellow crosshair with a dark outline at (u, v) given as fractions of the image."""
    from PIL import ImageDraw
    out = img.convert("RGB").copy()
    d = ImageDraw.Draw(out)
    x, y = round(u * out.width), round(v * out.height)
    r = max(10, min(out.size) // 14)
    for color, width in (((0, 0, 0), 5), ((255, 235, 0), 2)):
        d.line([(x - r, y), (x + r, y)], fill=color, width=width)
        d.line([(x, y - r), (x, y + r)], fill=color, width=width)
        d.ellipse([x - r // 2, y - r // 2, x + r // 2, y + r // 2], outline=color, width=width)
    return out


def tight_crop(raw: Image.Image, grid: Grid, ax: float, ay: float) -> tuple[Image.Image, tuple[float, float, float, float]]:
    """Stage-2 image: tight crop, fine grid and a crosshair on the stage-1 estimate."""
    crop, bounds = crop_square_around(raw, grid, ax, ay)
    u, v = (ax - bounds[0]) / (bounds[2] - bounds[0]), (ay - bounds[1]) / (bounds[3] - bounds[1])
    return draw_grid(draw_crosshair(crop, u, v), FINE2), bounds


def to_screen(grid_: Grid, fine_cell: str, fx: float, fy: float, bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    u, v = grid_.to_fraction(fine_cell, fx, fy)
    x0, y0, x1, y1 = bounds
    return x0 + u * (x1 - x0), y0 + v * (y1 - y0)


def accept_correction(p1: tuple[float, float], p2: tuple[float, float], grid: Grid) -> bool:
    """Stage 2 may nudge the point, but never leap far from where stage 1 put it."""
    limit = MAX_JUMP_CELLS * _dense(grid)
    return abs(p2[0] - p1[0]) * grid.cols <= limit and abs(p2[1] - p1[1]) * grid.rows <= limit


# ---- pointing mode: one zoomed look around the model's own point --------------------------------------------

ZOOM_W, ZOOM_H = 0.28, 0.28   # a crop about 400 x 250 px at the usual screenshot size, centred on the first point
ZOOM_MAX_JUMP = 0.042         # the zoomed look may nudge the point by up to ~60 px; a bigger "correction" is ignored


def zoom_crop(raw: Image.Image, ax: float, ay: float) -> tuple[Image.Image, tuple[float, float, float, float]]:
    """A crop around a screen point (kept inside the screen), upscaled 3x so small buttons are easy to place. Bounds as screen fractions."""
    x0 = min(max(ax - ZOOM_W / 2, 0.0), 1 - ZOOM_W)
    y0 = min(max(ay - ZOOM_H / 2, 0.0), 1 - ZOOM_H)
    bounds = (x0, y0, x0 + ZOOM_W, y0 + ZOOM_H)
    w, h = raw.size
    crop = raw.crop((round(bounds[0] * w), round(bounds[1] * h), round(bounds[2] * w), round(bounds[3] * h)))
    scale = max(1.0, 1200 / max(1, crop.width))
    return crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS), bounds


def zoom_to_screen(yx: tuple[float, float], bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    """(y, x) fractions inside the crop -> (x, y) fractions of the whole screen."""
    x0, y0, x1, y1 = bounds
    return x0 + yx[1] * (x1 - x0), y0 + yx[0] * (y1 - y0)


def accept_zoom(first: tuple[float, float], second: tuple[float, float]) -> bool:
    return abs(second[0] - first[0]) <= ZOOM_MAX_JUMP and abs(second[1] - first[1]) <= ZOOM_MAX_JUMP * 1.6
