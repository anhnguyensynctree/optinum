# Source: https://github.com/rogeriosantos/dnchub-app/issues/20
# Co-authored by: jurjans and Claude (per commit history)
#
# Gap: DB migration correctly renames drivers → employees and driver_id → employee_id
# across all tables. Code was updated to match. But README still documents the old
# endpoint (/api/v1/drivers) and old terminology ("Driver PIN authentication").
# Developers following the README hit 404 on every request — config drift, not code bug.
#
# This is a params-renamed + config-drift-across-files failure: the rename was applied
# in code and schema but the AI did not traverse to documentation artifacts.

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Rename core table: drivers → employees
    op.rename_table("drivers", "employees")

    # fuel_entries: driver_id → employee_id
    with op.batch_alter_table("fuel_entries") as batch_op:
        batch_op.alter_column(
            "driver_id",
            new_column_name="employee_id",
            existing_type=sa.Integer(),
            nullable=False,
        )

    # trips: driver_id → employee_id
    with op.batch_alter_table("trips") as batch_op:
        batch_op.alter_column(
            "driver_id",
            new_column_name="employee_id",
            existing_type=sa.Integer(),
            nullable=False,
        )

    # tickets: driver_id → employee_id
    with op.batch_alter_table("tickets") as batch_op:
        batch_op.alter_column(
            "driver_id",
            new_column_name="employee_id",
            existing_type=sa.Integer(),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("tickets") as batch_op:
        batch_op.alter_column("employee_id", new_column_name="driver_id",
                               existing_type=sa.Integer(), nullable=False)
    with op.batch_alter_table("trips") as batch_op:
        batch_op.alter_column("employee_id", new_column_name="driver_id",
                               existing_type=sa.Integer(), nullable=False)
    with op.batch_alter_table("fuel_entries") as batch_op:
        batch_op.alter_column("employee_id", new_column_name="driver_id",
                               existing_type=sa.Integer(), nullable=False)
    op.rename_table("employees", "drivers")
