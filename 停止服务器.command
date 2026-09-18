#!/bin/bash
# LuckyPick 停止脚本 - 双击运行
echo "🛑 停止 LuckyPick 服务器"
lsof -ti :8765 2>/dev/null | xargs -I {} kill -9 {} 2>/dev/null
if lsof -i :8765 >/dev/null 2>&1; then
  echo "❌ 停止失败，请手动操作"
else
  echo "✅ 已停止"
fi
