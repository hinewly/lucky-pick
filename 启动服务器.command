#!/bin/bash
cd "$(dirname "$0")"
if lsof -i :8765 >/dev/null 2>&1; then
  echo "⚠️ 端口 8765 已被占用，先停掉"
  lsof -ti :8765 | xargs kill -9 2>/dev/null
  sleep 1
fi
echo "🚀 LuckyPick 服务器启动中..."
echo "📍 根目录：$(pwd)"
echo ""
python3 -m http.server 8765
