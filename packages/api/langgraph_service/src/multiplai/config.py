"""Configuration management for the multiplai service.

This module provides centralized configuration using pydantic-settings,
loading values from environment variables and .env files.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings  # type: ignore[import-not-found]


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Required settings must be provided via environment variables or .env file.
    Optional settings have sensible defaults.
    """

    # Required API keys and credentials
    anthropic_api_key: str
    github_token: str
    database_url: str

    # Optional API keys
    linear_api_key: str | None = None

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000

    # AutoDev settings
    max_attempts: int = 3
    max_diff_lines: int = 300

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings."""
    return Settings()
