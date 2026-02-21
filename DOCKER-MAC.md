# Docker 部署指南 - Mac（含 M1）

适用于 **Mac 本地开发**，使用 `docker-compose.yml`，支持 M1 等 ARM 机型（通过 `platform: linux/amd64`）。

---

## 一、对应文件

| 项目     | 文件 |
|----------|------|
| Compose  | `docker-compose.yml` |
| 启动脚本 | `docker-start-mac.sh` |

---

## 二、环境要求

- Docker Desktop for Mac
- Docker Compose（随 Docker Desktop 安装）

---

## 三、使用启动脚本（推荐）

在项目根目录执行：

```bash
# 赋予执行权限（仅首次）
chmod +x docker-start-mac.sh

# 启动所有容器
./docker-start-mac.sh start

# 首次部署：初始化数据库表结构
./docker-start-mac.sh setup

# 其他命令
./docker-start-mac.sh status   # 查看状态
./docker-start-mac.sh stop     # 停止
./docker-start-mac.sh restart  # 重启
./docker-start-mac.sh logs     # 查看日志（-f 持续）
```

---

## 四、手动命令

若不用脚本，可手动执行：

```bash
# 启动
docker-compose -f docker-compose.yml up -d

# 首次部署：初始化数据库
docker-compose -f docker-compose.yml exec php php setup.php

# 停止
docker-compose -f docker-compose.yml down
```

---

## 五、镜像与组件

| 组件  | 镜像/版本 |
|-------|------------|
| MySQL | mysql:8.0 |
| Nginx | nginx:1.15 (linux/amd64) |
| PHP   | topai-php:7.3-fpm (自建 Dockerfile, linux/amd64) |

PHP 镜像由 `docker/php/Dockerfile` 构建。MySQL 使用健康检查，PHP 会在 MySQL 就绪后再启动。

---

## 六、持久化与访问

- **MySQL 数据**：命名卷 `openai_chat_mysql_data`，`down` 不会删除。
- **项目代码**：当前目录挂载到容器，改代码即时生效。

| 访问项 | 地址/说明 |
|--------|------------|
| 应用   | http://localhost |
| MySQL  | localhost:3306，root / 见 compose 中 `MYSQL_ROOT_PASSWORD` |

---

## 七、可选配置

在项目根目录创建 `.env` 可覆盖默认配置（如数据库密码等）。参见 `.env.example`。  
容器内 DB 已通过 compose 的 `environment` 配置，一般无需改。

---

## 八、常见问题

- **端口占用**：确保本机 80、3306 未被占用。
- **M1 构建慢**：因使用 `platform: linux/amd64`，首次构建可能较慢，属正常现象。
