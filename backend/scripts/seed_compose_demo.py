
import json
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.config import UPLOAD_DIR
from app.database import engine
from scripts.apply_district1_catalog import (
    ASSETS,
    apply,
    load_manifest,
    read_asset,
)


def main():
    bundle = load_manifest()

    # Reject an incomplete or outdated catalog.
    if len(bundle["places"]) != 15:
        raise RuntimeError("Expected exactly 15 District 1 places")

    if sum(len(p["guides"]) for p in bundle["places"]) != 60:
        raise RuntimeError("Expected exactly 60 guides")

    if sum(len(c["gallery"]) for c in bundle["content"]) != 30:
        raise RuntimeError("Expected exactly 30 gallery photos")

    names = {p["name"] for p in bundle["places"]}
    if not set(bundle["journey"]["stops"]).issubset(names):
        raise RuntimeError("Journey contains missing places")

    # Validate every bundled image before changing the database.
    for place in bundle["places"]:
        read_asset(place["image"], ASSETS)

    for item in bundle["content"]:
        for photo in item["gallery"]:
            read_asset(photo, ASSETS)

    with Session(engine) as session:
        with session.begin():
            conn = session.connection()

            if conn.dialect.name != "postgresql":
                raise RuntimeError("PostgreSQL is required")

            tables = inspect(conn).get_table_names()
            required = {"alembic_version", "users", "places",
                        "guide_contents", "journeys"}

            if not required.issubset(set(tables)):
                raise RuntimeError("Run Alembic migrations first")

            quote = conn.dialect.identifier_preparer.quote

            # Prevent another transaction from changing the
            # database while checking and creating demo data.
            conn.exec_driver_sql(
                "LOCK TABLE " +
                ", ".join(quote(t) for t in tables) +
                " IN ACCESS EXCLUSIVE MODE"
            )

            # Never seed an existing database with business data.
            for table in tables:
                if table == "alembic_version":
                    continue

                exists = conn.exec_driver_sql(
                    f"SELECT 1 FROM {quote(table)} LIMIT 1"
                ).first()

                if exists:
                    print(
                        f"SKIPPED: existing data in {table}; "
                        "database left unchanged."
                    )
                    return

            result, created, obsolete = apply(
                session,
                bundle,
                Path(UPLOAD_DIR),
            )

            if result["delete"] or result["upgrade"] or obsolete:
                raise RuntimeError("Unexpected changes in fresh demo")

    print(json.dumps({
        "status": "SEEDED",
        "places": len(bundle["places"]),
        "guides": 60,
        "photos": 45,
        "journeys": 1,
    }))


if __name__ == "__main__":
    main()
