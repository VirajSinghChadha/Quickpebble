"""The response contract. Gemini must return exactly this JSON; anything else is rejected and retried.

{
  "user":   {"thinking": "...", "message": "..."},      # shown to the person: how it got there + the answer
  "action": {"type": "click", "cell": "M7", ...}         # sent to the backend: executed exactly as given
}
"""
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .grid import Grid

ActionType = Literal["click", "double_click", "right_click", "drag", "type", "key", "scroll", "open_app", "wait", "ask", "done"]
POINTER = {"click", "double_click", "right_click", "scroll", "drag"}
# Application names: letters, digits, spaces and a few harmless symbols. No path separators or shell characters.
APP_RE = re.compile(r"^[\w][\w .&+()'-]{0,59}$", re.UNICODE)
KEY_RE = re.compile(r"^[A-Za-z0-9]$|^(cmd|ctrl|alt|option|shift)(\+(cmd|ctrl|alt|option|shift))*\+[A-Za-z0-9]$"
                    r"|^(enter|return|tab|escape|esc|backspace|delete|space|up|down|left|right)$"
                    r"|^(cmd|ctrl|alt|option|shift)(\+(cmd|ctrl|alt|option|shift))*\+(enter|return|tab|escape|esc|backspace|delete|space|up|down|left|right)$",
                    re.IGNORECASE)


class UserPart(BaseModel):
    """Everything the person sees. Never executed."""
    thinking: str = Field(max_length=1500)   # how Gemini read the screen and chose this step
    message: str = Field(max_length=4000)    # short status; for type=done it is the final answer


class Action(BaseModel):
    """Everything the backend executes. Nothing here is free-form prose."""
    type: ActionType
    cell: Optional[str] = None               # grid cell label such as "M7" (for drag: where the drag starts)
    to_cell: Optional[str] = None            # drag only: grid cell where the drag ends
    point: Optional[List[int]] = None        # [y, x] of the target, each 0..1000 across the screenshot (y first, like Gemini's own pointing)
    to_point: Optional[List[int]] = None     # drag only: where the drag ends, same format
    app: Optional[str] = None                # open_app only: the application's name, e.g. "Notes"
    fx: float = 0.5                          # position inside the cell, 0 = left edge, 1 = right edge
    fy: float = 0.5                          # position inside the cell, 0 = top edge, 1 = bottom edge
    text: Optional[str] = Field(default=None, max_length=500)
    key: Optional[str] = Field(default=None, max_length=40)
    direction: Optional[Literal["up", "down"]] = None
    amount: int = 3
    category: str = Field(default="none", pattern=r"^[a-z][a-z0-9_]{0,39}$")   # one of the site's permission ids, or "none"
    risk: Literal["low", "high"] = "low"
    ax: Optional[float] = Field(default=None, ge=0, le=1)   # exact point as a fraction of the screen, set by the refinement step
    ay: Optional[float] = Field(default=None, ge=0, le=1)     # "high" = hard to undo or affects others; the app asks the person first

    @field_validator("fx", "fy")
    @classmethod
    def _unit(cls, v: float) -> float:
        if v != v:  # NaN
            raise ValueError("must be a number")
        return min(1.0, max(0.0, v))

    @field_validator("point", "to_point", mode="before")
    @classmethod
    def _point(cls, v):
        if v is None:
            return None
        if not isinstance(v, (list, tuple)) or len(v) != 2 or any(isinstance(n, bool) or not isinstance(n, (int, float)) or n != n for n in v):
            raise ValueError("a point is [y, x], two numbers from 0 to 1000")
        return [min(1000, max(0, int(round(n)))) for n in v]

    @field_validator("amount")
    @classmethod
    def _amount(cls, v: int) -> int:
        return min(10, max(1, v))

    @model_validator(mode="after")
    def _shape(self) -> "Action":
        if self.type in POINTER and not (self.point or (self.cell and re.fullmatch(r"[A-Z]{1,2}[0-9]{1,2}", self.cell))):
            raise ValueError(f"{self.type} needs a 'point' [y, x] (or a grid cell like 'M7')")
        if self.type == "drag" and not (self.to_point or (self.to_cell and re.fullmatch(r"[A-Z]{1,2}[0-9]{1,2}", self.to_cell))):
            raise ValueError("drag needs a destination 'to_point' [y, x] (or a 'to_cell' like 'M7')")
        if self.type == "open_app" and not (self.app and APP_RE.match(self.app)):
            raise ValueError("open_app needs the application's plain name, e.g. 'Notes'")
        if self.type == "type" and not self.text:
            raise ValueError("type needs text")
        if self.type == "key" and not (self.key and KEY_RE.match(self.key)):
            raise ValueError("key needs a single key or combo such as 'enter' or 'cmd+l'")
        if self.type == "scroll" and self.direction is None:
            self.direction = "down"
        return self

    def check_cell(self, grid: Grid) -> None:
        for label in (self.cell, self.to_cell):
            if label:
                grid.parse(label)  # raises ValueError if outside the grid


class AgentResponse(BaseModel):
    user: UserPart
    action: Action


# Gemini structured-output schema: the model is constrained to this shape at generation time.
GEMINI_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "user": {
            "type": "OBJECT",
            "properties": {"thinking": {"type": "STRING"}, "message": {"type": "STRING"}},
            "required": ["thinking", "message"],
        },
        "action": {
            "type": "OBJECT",
            "properties": {
                "type": {"type": "STRING", "enum": list(ActionType.__args__)},
                "cell": {"type": "STRING", "nullable": True},
                "to_cell": {"type": "STRING", "nullable": True},
                "point": {"type": "ARRAY", "items": {"type": "INTEGER"}, "nullable": True},
                "to_point": {"type": "ARRAY", "items": {"type": "INTEGER"}, "nullable": True},
                "app": {"type": "STRING", "nullable": True},
                "fx": {"type": "NUMBER"},
                "fy": {"type": "NUMBER"},
                "text": {"type": "STRING", "nullable": True},
                "key": {"type": "STRING", "nullable": True},
                "direction": {"type": "STRING", "enum": ["up", "down"], "nullable": True},
                "amount": {"type": "INTEGER"},
                "category": {"type": "STRING"},
                "risk": {"type": "STRING", "enum": ["low", "high"]},
            },
            "required": ["type", "category", "risk"],
        },
    },
    "required": ["user", "action"],
}
