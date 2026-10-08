"""The response contract. Gemini must return exactly this JSON; anything else is rejected and retried.

{
  "user":   {"thinking": "...", "message": "..."},      # shown to the person: how it got there + the answer
  "action": {"type": "click", "cell": "M7", ...}         # sent to the backend: executed exactly as given
}
"""
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from .grid import Grid

ActionType = Literal["click", "double_click", "right_click", "type", "key", "scroll", "wait", "ask", "done"]
POINTER = {"click", "double_click", "right_click", "scroll"}
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
    cell: Optional[str] = None               # grid cell label such as "M7"
    fx: float = 0.5                          # position inside the cell, 0 = left edge, 1 = right edge
    fy: float = 0.5                          # position inside the cell, 0 = top edge, 1 = bottom edge
    text: Optional[str] = Field(default=None, max_length=500)
    key: Optional[str] = Field(default=None, max_length=40)
    direction: Optional[Literal["up", "down"]] = None
    amount: int = 3

    @field_validator("fx", "fy")
    @classmethod
    def _unit(cls, v: float) -> float:
        if v != v:  # NaN
            raise ValueError("must be a number")
        return min(1.0, max(0.0, v))

    @field_validator("amount")
    @classmethod
    def _amount(cls, v: int) -> int:
        return min(10, max(1, v))

    @model_validator(mode="after")
    def _shape(self) -> "Action":
        if self.type in POINTER and not (self.cell and re.fullmatch(r"[A-Z][0-9]{1,2}", self.cell)):
            raise ValueError(f"{self.type} needs a grid cell like 'M7'")
        if self.type == "type" and not self.text:
            raise ValueError("type needs text")
        if self.type == "key" and not (self.key and KEY_RE.match(self.key)):
            raise ValueError("key needs a single key or combo such as 'enter' or 'cmd+l'")
        if self.type == "scroll" and self.direction is None:
            self.direction = "down"
        return self

    def check_cell(self, grid: Grid) -> None:
        if self.cell:
            grid.parse(self.cell)  # raises ValueError if outside the grid


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
                "fx": {"type": "NUMBER"},
                "fy": {"type": "NUMBER"},
                "text": {"type": "STRING", "nullable": True},
                "key": {"type": "STRING", "nullable": True},
                "direction": {"type": "STRING", "enum": ["up", "down"], "nullable": True},
                "amount": {"type": "INTEGER"},
            },
            "required": ["type"],
        },
    },
    "required": ["user", "action"],
}
