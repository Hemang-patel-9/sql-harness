import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

_PASSWORD_HAS_LETTER = re.compile(r"[A-Za-z]")
_PASSWORD_HAS_DIGIT = re.compile(r"\d")


def _validate_password_strength(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not _PASSWORD_HAS_LETTER.search(password):
        raise ValueError("Password must contain at least one letter")
    if not _PASSWORD_HAS_DIGIT.search(password):
        raise ValueError("Password must contain at least one number")
    return password


class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(..., max_length=200)

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name is required")
        return value

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return _validate_password_strength(value)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=200)


class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str | None
    created_at: datetime
