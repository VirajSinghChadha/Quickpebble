"""A labeled grid over the screenshot. Gemini names a cell (e.g. "M7") plus an offset inside it;
we turn that into exact screen coordinates. Columns are letters A.., rows are numbers 1.."""
import re
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class Grid:
    cols: int = 24
    rows: int = 14

    def label(self, col: int, row: int) -> str:
        return f"{chr(ord('A') + col)}{row + 1}"

    def parse(self, cell: str) -> tuple[int, int]:
        m = re.fullmatch(r"([A-Z])([0-9]{1,2})", cell.strip().upper())
        if not m:
            raise ValueError(f"bad cell '{cell}'")
        col, row = ord(m.group(1)) - ord("A"), int(m.group(2)) - 1
        if not (0 <= col < self.cols and 0 <= row < self.rows):
            raise ValueError(f"cell '{cell}' is outside the {self.cols}x{self.rows} grid (A1..{self.label(self.cols - 1, self.rows - 1)})")
        return col, row

    def to_fraction(self, cell: str, fx: float = 0.5, fy: float = 0.5) -> tuple[float, float]:
        """Position as fractions (0..1) of the whole screen."""
        col, row = self.parse(cell)
        return (col + min(1.0, max(0.0, fx))) / self.cols, (row + min(1.0, max(0.0, fy))) / self.rows

    def to_screen(self, cell: str, fx: float, fy: float, width: int, height: int) -> tuple[int, int]:
        x, y = self.to_fraction(cell, fx, fy)
        return min(width - 1, int(x * width)), min(height - 1, int(y * height))

    def describe(self) -> str:
        return f"{self.cols} columns (A-{chr(ord('A') + self.cols - 1)}, left to right) by {self.rows} rows (1-{self.rows}, top to bottom)"


def _font(size: int):
    for name in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/SFNS.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_grid(img: Image.Image, grid: Grid) -> Image.Image:
    """Returns a copy with thin lines and a label in every cell's top-left corner."""
    out = img.convert("RGB")
    overlay = Image.new("RGBA", out.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    w, h = out.size
    cw, ch = w / grid.cols, h / grid.rows
    font = _font(max(9, int(min(cw, ch) / 4.2)))
    for c in range(grid.cols + 1):
        d.line([(round(c * cw), 0), (round(c * cw), h)], fill=(255, 0, 80, 150), width=1)
    for r in range(grid.rows + 1):
        d.line([(0, round(r * ch)), (w, round(r * ch))], fill=(255, 0, 80, 150), width=1)
    for c in range(grid.cols):
        for r in range(grid.rows):
            x, y = round(c * cw) + 2, round(r * ch) + 1
            text = grid.label(c, r)
            box = d.textbbox((x, y), text, font=font)
            d.rectangle(box, fill=(255, 255, 255, 170))
            d.text((x, y), text, fill=(200, 0, 60, 255), font=font)
    return Image.alpha_composite(out.convert("RGBA"), overlay).convert("RGB")
