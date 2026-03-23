"""merge heads

Revision ID: 0d39df645aee
Revises: 096016f5e7e7, 19fe960c4538
Create Date: 2026-03-23 10:34:19.588252

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0d39df645aee'
down_revision = ('096016f5e7e7', '19fe960c4538')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass