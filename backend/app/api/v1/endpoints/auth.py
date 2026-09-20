from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User, UserRole
from app.schemas.user import UserLogin, Token, UserOut
from app.api.deps import get_current_user, create_audit_entry
from app.core.config import settings

router = APIRouter()


@router.post("/login", response_model=Token, summary="Authenticate User")
async def login(login_data: UserLogin, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == login_data.email).first()
    if not user or not verify_password(login_data.password, user.hashed_password):
        # Audit failed login attempt
        create_audit_entry(
            db=db,
            action="login_failed",
            user=None,
            resource_type="auth",
            details=f"Failed login attempt for email: {login_data.email}",
            request=request
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    access_token = create_access_token(data={"sub": user.email, "role": user.role.value})

    # Audit successful login
    create_audit_entry(
        db=db,
        action="login_success",
        user=user,
        resource_type="auth",
        details=f"User {user.email} successfully logged in as {user.role.value}",
        request=request
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.model_validate(user)
    )


@router.post("/logout", summary="Log Out Current User")
async def logout(request: Request, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Audit logout event
    create_audit_entry(
        db=db,
        action="logout",
        user=current_user,
        resource_type="auth",
        details=f"User {current_user.email} logged out",
        request=request
    )
    return {"status": "success", "message": "Successfully logged out. Client token cleared."}


@router.get("/me", response_model=UserOut, summary="Get Current Authenticated Profile")
async def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
