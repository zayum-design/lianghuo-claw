"""create export_tasks table

Revision ID: 096016f5e7e7
Revises: 680ffb3d0404
Create Date: 2026-03-23 10:31:57.266624

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '096016f5e7e7'
down_revision = '680ffb3d0404'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'export_tasks',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True),
                  primary_key=True,
                  server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  nullable=False, index=True),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  nullable=False, index=True),
        sa.Column('status', sa.String(50), nullable=False,
                  server_default='queued', default='queued'),
        sa.Column('progress', sa.Integer, nullable=False,
                  server_default='0', default=0),
        sa.Column('format', sa.String(50), nullable=False,
                  server_default='mp4', default='mp4'),
        sa.Column('resolution_width', sa.Integer, nullable=True),
        sa.Column('resolution_height', sa.Integer, nullable=True),
        sa.Column('fps', sa.Float, nullable=True),
        sa.Column('video_bitrate_kbps', sa.Integer, nullable=False,
                  server_default='4000', default=4000),
        sa.Column('output_key', sa.Text, nullable=True),
        sa.Column('download_url', sa.Text, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('started_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('completed_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False,
                  server_default=sa.text('now()')),
        sa.Index('ix_export_tasks_user_status', 'user_id', 'status'),
    )


def downgrade() -> None:
    op.drop_table('export_tasks')