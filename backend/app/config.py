"""Application settings loaded from the environment.

Every value has a documented default so the app boots without a .env file.
Set values in a `.env` file at the repository root of the backend
(`backend/.env`) or export them in the shell. See `.env.example`.

- BUILD_SHA: commit SHA injected at deploy time; falls back to "dev".
- DATABASE_PATH: SQLite file shared with the frontend Drizzle workspace.
  Relative paths resolve against the backend directory.
- CORS_ORIGINS: comma-separated list of allowed browser origins.
- ENVIRONMENT: development / test / production. Only "development" enables
  the interactive API docs in the /docs and /redoc routes.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = Field(default="development")
    build_sha: str = Field(default="dev", description="Git SHA the build was cut from.")
    database_path: str = Field(
        default="db/hospital.db",
        description="SQLite database path, relative to the backend dir or absolute.",
    )
    cors_origins: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of allowed CORS origins.",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_database_path(self) -> Path:
        path = Path(self.database_path)
        if not path.is_absolute():
            path = BACKEND_DIR / path
        return path

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
