#!/usr/bin/env bash
# TopAI Docker 启动脚本 - Mac（含 M1）
# 使用 docker-compose.yml，适用于本地开发

set -e
cd "$(dirname "$0")"
COMPOSE_FILE="docker-compose.yml"

usage() {
  echo "用法: $0 {start|stop|restart|status|setup|logs}"
  echo "  start   - 启动所有容器（后台）"
  echo "  stop    - 停止所有容器"
  echo "  restart - 重启所有容器"
  echo "  status  - 查看容器状态"
  echo "  setup   - 执行数据库初始化 setup.php（首次部署必做）"
  echo "  logs    - 查看所有服务日志（-f 持续输出）"
  exit 1
}

case "${1:-start}" in
  start)
    echo "[Mac] 使用 $COMPOSE_FILE 启动..."
    docker-compose -f "$COMPOSE_FILE" up -d
    echo "启动完成。应用: http://localhost"
    echo "首次部署请执行: $0 setup"
    ;;
  stop)
    docker-compose -f "$COMPOSE_FILE" down
    echo "已停止（MySQL 数据卷保留）。"
    ;;
  restart)
    docker-compose -f "$COMPOSE_FILE" restart
    echo "已重启。"
    ;;
  status)
    docker-compose -f "$COMPOSE_FILE" ps
    ;;
  setup)
    echo "等待 MySQL 就绪..."
    MYSQL_PASS="ERkpcRnKym5AvQHWmhYN"
    for i in $(seq 1 45); do
      if docker-compose -f "$COMPOSE_FILE" exec -T mysql mysqladmin ping -h localhost -uroot -p"$MYSQL_PASS" 2>/dev/null; then
        echo "MySQL 已就绪。"
        break
      fi
      if [ "$i" -eq 45 ]; then
        echo "错误: MySQL 未能在约 90 秒内就绪，请先执行 $0 start 并稍后再试。"
        exit 1
      fi
      sleep 2
    done
    echo "执行数据库初始化..."
    docker-compose -f "$COMPOSE_FILE" exec php php setup.php
    echo "初始化完成。"
    ;;
  logs)
    docker-compose -f "$COMPOSE_FILE" logs "${2:--f}"
    ;;
  *)
    usage
    ;;
esac
