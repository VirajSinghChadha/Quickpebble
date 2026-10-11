"""A labeled grid over the screenshot. Gemini names a cell (e.g. "M7" or "AC12") plus an offset inside it;
we turn that into exact screen coordinates. Columns are letters A..Z then AA..AZ, rows are numbers 1.."""
import re
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont


def col_name(c: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA, 39 -> AN."""
    return chr(65 + c) if c < 26 else chr(65 + c // 26 - 1) + chr(65 + c % 26)


def col_index(name: str) -> int:
    return ord(name) - 65 if len(name) == 1 else (ord(name[0]) - 64) * 26 + ord(name[1]) - 65


@dataclass(frozen=True)
class Grid:
    cols: int = 40   # about 36 px per cell on the screenshot Gemini sees: precise enough that one look usually lands the click
    rows: int = 25

    def label(self, col: int, row: int) -> str:
        return f"{col_name(col)}{row + 1}"

    def parse(self, cell: str) -> tuple[int, int]:
        m = re.fullmatch(r"([A-Z]{1,2})([0-9]{1,2})", cell.strip().upper())
        if not m:
            raise ValueError(f"bad cell '{cell}'")
        col, row = col_index(m.group(1)), int(m.group(2)) - 1
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
        last = col_name(self.cols - 1)
        names = f"A-{last}" if self.cols <= 26 else f"A-Z then AA-{last}"
        return f"{self.cols} columns ({names}, left to right) by {self.rows} rows (1-{self.rows}, top to bottom)"


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
    font = _font(max(8, int(min(cw, ch) / (3.6 if grid.cols > 30 else 4.2))))
    dense = grid.cols > 30
    for c in range(grid.cols + 1):
        major = dense and c % 5 == 0
        d.line([(round(c * cw), 0), (round(c * cw), h)], fill=(255, 0, 80, 210 if major else (95 if dense else 150)), width=2 if major else 1)
    for r in range(grid.rows + 1):
        major = dense and r % 5 == 0
        d.line([(0, round(r * ch)), (w, round(r * ch))], fill=(255, 0, 80, 210 if major else (95 if dense else 150)), width=2 if major else 1)
    for c in range(grid.cols):
        for r in range(grid.rows):
            x, y = round(c * cw) + 2, round(r * ch) + 1
            text = grid.label(c, r)
            box = d.textbbox((x, y), text, font=font)
            d.rectangle(box, fill=(255, 255, 255, 170))
            d.text((x, y), text, fill=(200, 0, 60, 255), font=font)
    return Image.alpha_composite(out.convert("RGBA"), overlay).convert("RGB")
