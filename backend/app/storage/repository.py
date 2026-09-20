import abc
import hashlib
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
from app.models.report import FinalizedReport
from app.core.logging import logger


class StorageRepository(abc.ABC):
    """
    Abstract interface for permanent report storage.
    Enables future cloud storage (e.g. S3-compatible) backends to seamlessly
    substitute database BLOB storage without changing finalization workflows.
    """

    @abc.abstractmethod
    def save_pdf(
        self,
        inspection_id: str,
        filename: str,
        pdf_bytes: bytes,
        sha256_hash: str,
        rulebook_version: str,
        rulebook_hash: str,
        created_by_id: int
    ) -> FinalizedReport:
        """Persists the verified PDF bytes and metadata permanently."""
        pass

    @abc.abstractmethod
    def get_pdf(self, inspection_id: str) -> Optional[Tuple[bytes, Dict[str, Any]]]:
        """Retrieves the stored PDF bytes and metadata for an inspection."""
        pass

    @abc.abstractmethod
    def get_metadata(self, inspection_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves stored metadata without loading full binary payload."""
        pass

    @abc.abstractmethod
    def has_report(self, inspection_id: str) -> bool:
        """Returns True if a permanent report already exists for this inspection."""
        pass


class MySQLBlobStorageRepository(StorageRepository):
    """
    MySQL-backed implementation of StorageRepository utilizing LONGBLOB storage
    within the finalized_reports table. Fully transactional and concurrency-guarded.
    """

    def __init__(self, db: Session):
        self.db = db

    def save_pdf(
        self,
        inspection_id: str,
        filename: str,
        pdf_bytes: bytes,
        sha256_hash: str,
        rulebook_version: str,
        rulebook_hash: str,
        created_by_id: int
    ) -> FinalizedReport:
        existing = self.db.query(FinalizedReport).filter(
            FinalizedReport.inspection_id == inspection_id
        ).first()

        if existing:
            # Report already exists; enforce immutability: do not overwrite
            logger.info(f"FinalizedReport already exists for inspection {inspection_id}; returning existing record.")
            return existing

        report = FinalizedReport(
            inspection_id=inspection_id,
            filename=filename,
            file_size=len(pdf_bytes),
            sha256_hash=sha256_hash,
            pdf_blob=pdf_bytes,
            rulebook_version=rulebook_version,
            rulebook_hash=rulebook_hash,
            created_by_id=created_by_id,
            created_at=datetime.now(timezone.utc)
        )
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)
        logger.info(f"Successfully saved FinalizedReport for inspection {inspection_id} ({len(pdf_bytes)} bytes, hash {sha256_hash[:8]}...)")
        return report

    def get_pdf(self, inspection_id: str) -> Optional[Tuple[bytes, Dict[str, Any]]]:
        report = self.db.query(FinalizedReport).filter(
            FinalizedReport.inspection_id == inspection_id
        ).first()
        if not report or not report.pdf_blob:
            return None

        metadata = {
            "id": report.id,
            "inspection_id": report.inspection_id,
            "filename": report.filename,
            "file_size": report.file_size,
            "sha256_hash": report.sha256_hash,
            "rulebook_version": report.rulebook_version,
            "rulebook_hash": report.rulebook_hash,
            "created_by_id": report.created_by_id,
            "created_at": report.created_at.isoformat() if report.created_at else None
        }
        return bytes(report.pdf_blob), metadata

    def get_metadata(self, inspection_id: str) -> Optional[Dict[str, Any]]:
        report = self.db.query(
            FinalizedReport.id,
            FinalizedReport.inspection_id,
            FinalizedReport.filename,
            FinalizedReport.file_size,
            FinalizedReport.sha256_hash,
            FinalizedReport.rulebook_version,
            FinalizedReport.rulebook_hash,
            FinalizedReport.created_by_id,
            FinalizedReport.created_at
        ).filter(
            FinalizedReport.inspection_id == inspection_id
        ).first()

        if not report:
            return None

        return {
            "id": report[0],
            "inspection_id": report[1],
            "filename": report[2],
            "file_size": report[3],
            "sha256_hash": report[4],
            "rulebook_version": report[5],
            "rulebook_hash": report[6],
            "created_by_id": report[7],
            "created_at": report[8].isoformat() if report[8] else None
        }

    def has_report(self, inspection_id: str) -> bool:
        count = self.db.query(FinalizedReport.id).filter(
            FinalizedReport.inspection_id == inspection_id
        ).count()
        return count > 0
