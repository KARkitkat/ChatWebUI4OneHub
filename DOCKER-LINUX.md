# Docker 部署指南 - Linux 服务器

适用于 **Linux 服务器部署**，使用 `docker-compose.linux.yml`。默认按 **Linux amd64（x86_64）** 环境；兼容旧版 docker-compose（无 `platform`、无 `condition: service_healthy` 等）。

---

## 一、对应文件

| 项目     | 文件 |
|----------|------|
| Compose  | `docker-compose.linux.yml` |
| 启动脚本 | `docker-start-linux.sh` |

---

## 二、环境要求

- Docker
- Docker Compose（建议 1.x，支持 version 3.3 即可）

---

## 三、使用启动脚本（推荐）

在项目根目录执行：

```bash
# 赋予执行权限（仅首次）
chmod +x docker-start-linux.sh

# 启动所有容器
./docker-start-linux.sh start

# 首次部署：初始化数据库表结构
./docker-start-linux.sh setup

# 其他命令
./docker-start-linux.sh status   # 查看状态
./docker-start-linux.sh stop     # 停止
./docker-start-linux.sh restart  # 重启
./docker-start-linux.sh logs     # 查看日志（-f 持续）
```

---

## 四、手动命令

若不用脚本，可手动执行：

```bash
# 启动（必须指定 -f）
docker-compose -f docker-compose.linux.yml up -d

# 首次部署：初始化数据库
docker-compose -f docker-compose.linux.yml exec php php setup.php

# 停止
docker-compose -f docker-compose.linux.yml down
```

> **注意**：Linux 上请始终使用 `-f docker-compose.linux.yml`，不要用默认的 `docker-compose.yml`（为 Mac 设计，含 platform 等语法）。

---

## 五、镜像与组件

| 组件  | 镜像/版本 |
|-------|------------|
| MySQL | mysql:8.0 |
| Nginx | nginx:1.15 |
| PHP   | topai-php:7.3-fpm（自建 Dockerfile） |

无 `platform` 限制，使用宿主机架构。PHP 依赖 MySQL，但 compose 未使用 `condition: service_healthy`，若 MySQL 启动较慢，可先等待几秒再执行 `setup`。

---

## 六、持久化与访问

- **MySQL 数据**：匿名卷 `mysql_data`，`down` 不会删除数据。
- **项目代码**：当前目录挂载到容器。

| 访问项 | 地址/说明 |
|--------|------------|
| 应用   | http://服务器IP 或 配置的域名 |
| MySQL  | 宿主机 3306（或容器内 mysql:3306），root / 见 compose 中 `MYSQL_ROOT_PASSWORD` |

---

## 七、可选配置

在项目根目录创建 `.env` 可覆盖默认配置。容器内 DB 已通过 compose 的 `environment` 配置，一般无需改。

---

## 八、与 Mac 版差异摘要

| 项目           | Mac (docker-compose.yml)        | Linux (docker-compose.linux.yml) |
|----------------|----------------------------------|-----------------------------------|
| platform       | 无（M1 用原生 arm64 避免 io_setup 等） | 无，**目标环境为 amd64**          |
| MySQL 健康检查 | 有 start_period、condition      | 有 healthcheck，无 start_period   |
| PHP depends_on | condition: service_healthy      | 仅 depends_on: mysql              |
| 数据卷名       | 命名卷 openai_chat_mysql_data   | 匿名卷 mysql_data                 |

其他用法与 Mac 版一致，以本指南和 `docker-start-linux.sh` 为准。

---

## 九、Linux 测试与架构说明

- **默认假设**：部署/测试环境为 **Linux amd64（x86_64）**，不指定 `platform` 时即使用本机架构。
- **若在 Linux 上测试时需指定 amd64**（例如在 arm64 机器上构建、要跑 amd64 镜像）：在 `docker-compose.linux.yml` 中为 `php`、`nginx` 服务增加 `platform: linux/amd64`，与 Mac 版曾用写法一致。
- **若出现与架构相关的错误**（如某镜像无 arm64 版）：同样可为对应服务添加 `platform: linux/amd64` 后重试。
