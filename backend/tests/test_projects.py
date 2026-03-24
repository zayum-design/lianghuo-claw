import pytest
import uuid
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.project import Project
from models.timeline import ProjectTimeline
from main import app
from core.dependencies import get_current_user


# Mock user ID for testing
MOCK_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


def override_get_current_user():
    """Override dependency to return mock user."""
    return {"id": str(MOCK_USER_ID)}


@pytest.fixture
def client():
    """Test client with overridden dependencies."""
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_projects_empty(client: TestClient, db_session: AsyncSession):
    """Test listing projects when user has none."""
    response = client.get("/api/v1/projects")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["data"] == []


@pytest.mark.asyncio
async def test_create_project(client: TestClient, db_session: AsyncSession):
    """Test creating a new project."""
    payload = {
        "name": "Test Project",
        "resolution_width": 1920,
        "resolution_height": 1080,
        "fps": 30.0,
    }
    response = client.post("/api/v1/projects", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Project"
    assert data["resolution_width"] == 1920
    assert data["status"] == "draft"
    assert "id" in data

    # Verify project exists in DB
    stmt = select(Project).where(Project.id == uuid.UUID(data["id"]))
    result = await db_session.execute(stmt)
    project = result.scalar_one_or_none()
    assert project is not None
    assert project.user_id == MOCK_USER_ID

    # Verify timeline was created
    timeline_stmt = select(ProjectTimeline).where(ProjectTimeline.project_id == project.id)
    timeline_result = await db_session.execute(timeline_stmt)
    timeline = timeline_result.scalar_one_or_none()
    assert timeline is not None
    assert timeline.version == 1


@pytest.mark.asyncio
async def test_get_project(client: TestClient, db_session: AsyncSession):
    """Test retrieving a project by ID."""
    # First create a project
    project = Project(
        user_id=MOCK_USER_ID,
        name="Test Get Project",
        resolution_width=1280,
        resolution_height=720,
        fps=25.0,
        status="draft",
    )
    db_session.add(project)
    await db_session.flush()
    project_id = project.id

    response = client.get(f"/api/v1/projects/{project_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(project_id)
    assert data["name"] == "Test Get Project"


@pytest.mark.asyncio
async def test_update_project(client: TestClient, db_session: AsyncSession):
    """Test updating a project."""
    project = Project(
        user_id=MOCK_USER_ID,
        name="Old Name",
        resolution_width=1920,
        resolution_height=1080,
        fps=30.0,
        status="draft",
    )
    db_session.add(project)
    await db_session.flush()
    project_id = project.id

    payload = {"name": "Updated Name", "description": "New description"}
    response = client.put(f"/api/v1/projects/{project_id}", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["description"] == "New description"

    # Verify update in DB
    stmt = select(Project).where(Project.id == project_id)
    result = await db_session.execute(stmt)
    updated = result.scalar_one()
    assert updated.name == "Updated Name"
    assert updated.description == "New description"


@pytest.mark.asyncio
async def test_delete_project(client: TestClient, db_session: AsyncSession):
    """Test deleting a project."""
    project = Project(
        user_id=MOCK_USER_ID,
        name="To Delete",
        resolution_width=1920,
        resolution_height=1080,
        fps=30.0,
        status="draft",
    )
    db_session.add(project)
    await db_session.flush()
    project_id = project.id

    response = client.delete(f"/api/v1/projects/{project_id}")
    assert response.status_code == 204

    # Verify project is deleted
    stmt = select(Project).where(Project.id == project_id)
    result = await db_session.execute(stmt)
    deleted = result.scalar_one_or_none()
    assert deleted is None


@pytest.mark.asyncio
async def test_duplicate_project(client: TestClient, db_session: AsyncSession):
    """Test duplicating a project."""
    # Create source project with timeline
    source_project = Project(
        user_id=MOCK_USER_ID,
        name="Source Project",
        resolution_width=1920,
        resolution_height=1080,
        fps=30.0,
        status="draft",
    )
    db_session.add(source_project)
    await db_session.flush()
    source_timeline = ProjectTimeline(
        project_id=source_project.id,
        timeline_data={
            "id": str(uuid.uuid4()),
            "fps": 30.0,
            "resolution": {"width": 1920, "height": 1080},
            "duration_ms": 0,
            "tracks": [],
        },
        version=1,
    )
    db_session.add(source_timeline)
    await db_session.flush()

    payload = {"name": "Duplicated Project"}
    response = client.post(f"/api/v1/projects/{source_project.id}/duplicate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Source Project (副本)"
    assert data["id"] != str(source_project.id)

    # Verify duplicate project exists
    stmt = select(Project).where(Project.id == uuid.UUID(data["id"]))
    result = await db_session.execute(stmt)
    dup = result.scalar_one()
    assert dup is not None
    assert dup.user_id == MOCK_USER_ID

    # Verify timeline duplicated
    timeline_stmt = select(ProjectTimeline).where(ProjectTimeline.project_id == dup.id)
    timeline_result = await db_session.execute(timeline_stmt)
    timeline = timeline_result.scalar_one()
    assert timeline is not None
    assert timeline.version == 1