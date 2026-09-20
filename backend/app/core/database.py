import time
from typing import Generator, Tuple, Optional
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.core.logging import logger

# SQLAlchemy engine configured for MySQL via PyMySQL
# Pool pre-ping ensures stale connections are recycled gracefully
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency for obtaining database sessions in API endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_health() -> Tuple[bool, Optional[str], float]:
    """
    Executes a safe SELECT 1 and returns (is_healthy, db_version, latency_ms).
    Safely catches errors without exposing credentials or internal host details.
    """
    start_time = time.perf_counter()
    try:
        with engine.connect() as connection:
            result = connection.execute(text("SELECT VERSION()"))
            version_row = result.fetchone()
            db_version = version_row[0] if version_row else "Unknown"
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return True, db_version, latency_ms
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(f"Database connectivity check failed: {str(exc)}")
        return False, None, latency_ms
