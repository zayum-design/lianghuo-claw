from typing import Dict, Any
from fastapi import Depends

from .config import get_settings

settings = get_settings()


# TODO Sprint4: Replace with JWT authentication
async def get_current_user() -> Dict[str, Any]:
    """
    Mock user dependency for authentication bypass.

    Returns a fixed mock user object. In Sprint 4, this will be replaced
    with JWT token validation and real user lookup.
    """
    return {
        "id": settings.MOCK_USER_ID,
        "username": "dev_user",
        "email": "dev@lianghuo.local",
        "is_active": True,
    }


# Export for easy import
CurrentUser = Depends(get_current_user)