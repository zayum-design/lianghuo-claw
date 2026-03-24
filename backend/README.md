# Lianghuo Claw 后端

FastAPI 构建的异步后端 API，支持视频编辑项目的素材管理、时间线编辑和导出功能。

## 技术栈

- **FastAPI** - 异步 Web 框架
- **PostgreSQL** - 主数据库
- **Redis** - 缓存与消息队列
- **MinIO** - 对象存储（S3 兼容）
- **Celery** - 异步任务处理
- **SQLAlchemy** - ORM
- **Alembic** - 数据库迁移

## 部署方式

### 方式一：Docker 部署（推荐）

```bash
# 复制环境变量配置
cp .env.example .env

# 启动所有服务
make dev

# 查看日志
make logs

# 执行数据库迁移
make migrate

# 停止服务
make stop
```

**Docker 模式 Makefile 命令：**

| 命令 | 说明 |
|------|------|
| `make dev` | 启动所有 Docker 服务 |
| `make stop` | 停止所有服务 |
| `make logs` | 查看 API 日志 |
| `make migrate` | 执行数据库迁移 |
| `make makemigrations msg="xxx"` | 创建新迁移 |
| `make shell` | 进入 API 容器 |
| `make test` | 运行测试 |
| `make clean` | 清理所有数据（⚠️ 危险） |

---

### 方式二：完全本地部署（无 Docker）

#### 1. 创建 Conda 环境

**推荐**：使用 Conda 管理 Python 环境，避免依赖冲突。

```bash
# 创建名为 lianghuo 的 Python 3.12 环境
conda create -n lianghuo python=3.12 -y

# 激活环境
conda activate lianghuo

# 验证 Python 版本
python --version  # 应显示 Python 3.12.x
```

后续所有操作都应在 `lianghuo` 环境中执行。

#### 2. 安装系统依赖

**macOS:**
```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis

# 创建数据库
createdb lianghuo
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql redis-server python3-pip python3-venv
sudo systemctl start postgresql redis
sudo -u postgres createdb lianghuo
```

#### 2. 安装 MinIO（文件存储）

**选项 A - 二进制运行:**
```bash
# macOS
brew install minio
mkdir -p ~/minio-data
minio server ~/minio-data --console-address :9001
```

**选项 B - Docker 只启动 MinIO:**
```bash
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -v minio_data:/data \
  minio/minio server /data --console-address :9001
```

#### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件（本地开发示例）：
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/lianghuo
REDIS_URL=redis://localhost:6379/0
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
CORS_ORIGINS=http://localhost:5173
DEBUG=true
```

#### 4. 安装 Python 依赖

**确保已激活 `lianghuo` conda 环境：**
```bash
conda activate lianghuo
```

**使用 pip（标准方式）:**
```bash
pip install -e .
```

**使用 uv（更快）:**
```bash
pip install uv
uv pip install -e .
```

#### 5. 初始化数据库

```bash
alembic upgrade head
```

#### 6. 启动服务

```bash
# 终端 1：启动 API 服务
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 终端 2：启动 Celery Worker（处理异步任务）
celery -A tasks worker -l info -Q default,media,export
```

访问 http://localhost:8000/api/docs 查看 API 文档。

---

### 方式三：混合部署（依赖服务用 Docker，应用本地运行）

```bash
# 确保在 lianghuo conda 环境中
conda activate lianghuo

# 只启动 PostgreSQL、Redis、MinIO
docker-compose up -d postgres redis minio

# 本地安装 Python 依赖
pip install uv
uv pip install -e .

# 配置 .env 使用本地连接
# DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/lianghuo

# 运行迁移
alembic upgrade head

# 启动服务
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## 开发指南

### 数据库迁移

```bash
# 创建新迁移
alembic revision --autogenerate -m "描述变更"

# 应用迁移
alembic upgrade head

# 回滚到上一版本
alembic downgrade -1
```

### 运行测试

```bash
pytest -v
```

### 代码检查与格式化

```bash
# 检查
ruff check .
black --check .

# 修复
ruff check --fix .
black .
```

---

## 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | - | PostgreSQL 连接 URL |
| `REDIS_URL` | - | Redis 连接 URL |
| `MINIO_ENDPOINT` | - | MinIO 服务端点 |
| `MINIO_ACCESS_KEY` | - | MinIO 访问密钥 |
| `MINIO_SECRET_KEY` | - | MinIO 密钥 |
| `MINIO_SECURE` | false | 是否使用 HTTPS |
| `SENTRY_DSN` | - | Sentry 错误监控（可选） |
| `CORS_ORIGINS` | - | 允许的跨域来源 |
| `DEBUG` | true | 调试模式 |
| `MOCK_USER_ID` | - | 模拟用户 ID |

---

## 故障排除

### ModuleNotFoundError: No module named 'xxx'

确保已激活 `lianghuo` conda 环境：
```bash
conda activate lianghuo
pip install -e .
```

### 数据库连接错误

检查 PostgreSQL 是否运行：
```bash
# macOS
brew services list | grep postgresql

# Linux
sudo systemctl status postgresql
```

检查数据库是否存在：
```bash
psql -l | grep lianghuo
```

### Redis 连接错误

检查 Redis 是否运行：
```bash
redis-cli ping  # 应返回 PONG
```

### MinIO 连接错误

检查 MinIO 是否可访问：
```bash
curl http://localhost:9000/minio/health/live
```

访问 http://localhost:9001 使用 minioadmin/minioadmin 登录控制台。

### uv command not found

如果使用 Docker 部署，不需要本地安装 uv。

如果本地开发：
```bash
pip install uv
```

