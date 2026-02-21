# Docker 容器化部署说明

## 两份 Compose 与对应脚本、指南

| 环境 | Compose 文件 | 启动脚本 | 详细指南 |
|------|--------------|----------|----------|
| **Mac（含 M1）** 本地开发 | `docker-compose.yml` | `./docker-start-mac.sh` | [DOCKER-MAC.md](DOCKER-MAC.md) |
| **Linux** 服务器部署 | `docker-compose.linux.yml` | `./docker-start-linux.sh` | [DOCKER-LINUX.md](DOCKER-LINUX.md) |

- **Mac**：在项目根目录执行 `./docker-start-mac.sh start`，首次部署再执行 `./docker-start-mac.sh setup`。详见 [DOCKER-MAC.md](DOCKER-MAC.md)。
- **Linux**：在项目根目录执行 `./docker-start-linux.sh start`，首次部署再执行 `./docker-start-linux.sh setup`。详见 [DOCKER-LINUX.md](DOCKER-LINUX.md)。

## 环境要求

- Docker
- Docker Compose

## 镜像版本

| 组件 | 版本 |
|------|------|
| MySQL | 8.0 |
| Nginx | 1.15 |
| PHP | 7.3-fpm |

> 注：PHP 官方镜像 `php:7.3.4-fpm` 已标记为 inactive，故使用 `php:7.3-fpm`（7.3.x 系列，兼容 7.3.4）。

## 持久化存储

- **MySQL 数据**：使用命名卷 `openai_chat_mysql_data`，数据持久化在 Docker 卷中
- **项目文件**：使用 bind mount 挂载当前目录到容器，本地修改即时生效

## 快速启动（汇总）

**Mac：** `./docker-start-mac.sh start` → 首次：`./docker-start-mac.sh setup`  
**Linux：** `./docker-start-linux.sh start` → 首次：`./docker-start-linux.sh setup`  

或手动：Mac 用 `docker-compose up -d`，Linux 用 `docker-compose -f docker-compose.linux.yml up -d`；初始化均为 `exec php php setup.php`。详见上方对应指南。

## 访问

- 应用：http://localhost
- 数据库：localhost:3306（root / 密码见各 compose 中 MYSQL_ROOT_PASSWORD）

## 停止

```bash
docker-compose down
```

> 使用 `docker-compose down` 不会删除 MySQL 数据卷，数据会保留。

## 环境变量（可选）

在项目根目录创建 `.env` 可覆盖默认配置：

```env
# 数据库（容器内默认已配置，一般无需修改）
DB_HOST=mysql
DB_PORT=3306
DB_NAME=openai_chat
DB_USER=root
DB_PASS=ERkpcRnKym5AvQHWmhYN
```

本地开发（非 Docker）时，不设置 `DB_HOST` 即可使用默认 `127.0.0.1`。
