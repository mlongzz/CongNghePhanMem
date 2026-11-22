
import os
from sqlalchemy.orm import Session
from pwdlib import PasswordHash

from app.database import engine
from app.models.user import User
from app.schemas.user import UserCreate

password_hash = PasswordHash.recommended()


def main():
    # Only allow automatic accounts in local demo mode.
    if (
        os.getenv("APP_ENV") != "development"
        or os.getenv("DEMO_ACCOUNTS_ENABLED") != "true"
    ):
        print("SKIPPED: demo accounts disabled")
        return

    admin_email = os.getenv("DEMO_ADMIN_EMAIL", "").strip().lower()
    admin_password = os.getenv("DEMO_ADMIN_PASSWORD", "")
    guest_email = os.getenv("DEMO_GUEST_EMAIL", "").strip().lower()
    guest_password = os.getenv("DEMO_GUEST_PASSWORD", "")

    if not all([
        admin_email, admin_password,
        guest_email, guest_password
    ]):
        raise RuntimeError("Missing demo account configuration")

    if admin_email == guest_email:
        raise RuntimeError("Demo emails must be different")

    # Validate with the existing application rules.
    admin = UserCreate(
        email=admin_email,
        password=admin_password,
        full_name="Demo Admin",
        language="vi"
    )
    guest = UserCreate(
        email=guest_email,
        password=guest_password,
        full_name="Demo Khach",
        language="vi"
    )

    with Session(engine) as db:
        with db.begin():
            # Never change or overwrite existing accounts.
            if db.query(User).first() is not None:
                print("SKIPPED: users already exist")
                return

            db.add_all([
                User(
                    email=admin.email,
                    password_hash=password_hash.hash(admin.password),
                    full_name=admin.full_name,
                    language="vi",
                    role="admin"
                ),
                User(
                    email=guest.email,
                    password_hash=password_hash.hash(guest.password),
                    full_name=guest.full_name,
                    language="vi",
                    role="user"
                )
            ])

    print("CREATED: Admin and Guest accounts")


if __name__ == "__main__":
    main()
