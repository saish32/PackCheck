from sqlalchemy.orm import Session
from app.core.database import engine, SessionLocal
from app.models import Base, User, UserRole, Inspection, InspectionHistory, TemporaryEvidence, ExtractedDeclaration, AuditLog
from app.core.security import get_password_hash
from app.core.logging import logger

DEMO_ACCOUNTS = [
    {
        "email": "admin@packcheck.local",
        "password": "PackCheck@Admin2026!",
        "full_name": "System Administrator",
        "role": UserRole.ADMIN,
    },
    {
        "email": "inspector@packcheck.local",
        "password": "PackCheck@Inspector2026!",
        "full_name": "Senior Field Inspector",
        "role": UserRole.INSPECTOR,
    },
    {
        "email": "supervisor@packcheck.local",
        "password": "PackCheck@Supervisor2026!",
        "full_name": "Compliance Supervisor",
        "role": UserRole.SUPERVISOR,
    },
    {
        "email": "rulemanager@packcheck.local",
        "password": "PackCheck@Rules2026!",
        "full_name": "Standards & Rule Manager",
        "role": UserRole.RULE_MANAGER,
    },
    {
        "email": "auditor@packcheck.local",
        "password": "PackCheck@Auditor2026!",
        "full_name": "Statutory Quality Auditor",
        "role": UserRole.AUDITOR,
    },
]


def init_database() -> None:
    """
    Initializes database schema creating missing tables only (checkfirst=True).
    Never drops or resets existing application data.
    Idempotently seeds demo accounts without overwriting existing passwords.
    """
    try:
        # Create missing tables safely
        Base.metadata.create_all(bind=engine, checkfirst=True)
        logger.info("Database schema checked/initialized (missing tables created).")

        # Ensure MySQL LONGBLOB sizing for finalized_reports
        try:
            with engine.connect() as conn:
                from sqlalchemy import text
                conn.execute(text("ALTER TABLE finalized_reports MODIFY COLUMN pdf_blob LONGBLOB NOT NULL"))
                conn.commit()
                logger.info("Verified finalized_reports.pdf_blob is LONGBLOB.")
        except Exception as alter_err:
            logger.debug(f"LONGBLOB verification/migration check: {alter_err}")

        # Seed demo accounts idempotently
        db: Session = SessionLocal()
        try:
            seeded_count = 0
            for acct in DEMO_ACCOUNTS:
                existing = db.query(User).filter(User.email == acct["email"]).first()
                if not existing:
                    hashed_pwd = get_password_hash(acct["password"])
                    user = User(
                        email=acct["email"],
                        hashed_password=hashed_pwd,
                        full_name=acct["full_name"],
                        role=acct["role"],
                        is_active=True
                    )
                    db.add(user)
                    seeded_count += 1
            
            if seeded_count > 0:
                db.commit()
                logger.info(f"Idempotently seeded {seeded_count} demo user accounts.")
            else:
                logger.info("Demo user accounts already exist; skipping seeding.")
        finally:
            db.close()
    except Exception as exc:
        logger.error(f"Database initialization error: {str(exc)}", exc_info=True)
        raise exc
