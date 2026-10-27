#!/usr/bin/env bash
# 史地 PlaceLore 测试版一键部署到 VPS(实测部署路径见 docs/部署.md)
#
# 用法:
#   ./scripts/deploy.sh <user@host> [选项]
# 选项:
#   --ssh-port 22          SSH 端口
#   --dir /opt/placelore   服务器部署目录(data/ 与 prod.env 在该目录下,跨部署保留)
#   --app-port 3000        应用监听端口
#
# 流程:rsync 源码(排除 node_modules/.next/data/密钥) → 服务器 npm ci + build
#      → 组装 prod.env(.env + 绝对 DB_PATH) → systemd 常驻(无 sudo 退化为 nohup)
#      → 健康检查(首页 200 重试)
set -euo pipefail

HOST="${1:-}"; [ -n "$HOST" ] || { sed -n '2,12p' "$0"; exit 1; }
shift
SSH_PORT=22 DEPLOY_DIR=/opt/placelore APP_PORT=3000
while [ $# -gt 0 ]; do
  case "$1" in
    --ssh-port) SSH_PORT="$2"; shift 2 ;;
    --dir) DEPLOY_DIR="$2"; shift 2 ;;
    --app-port) APP_PORT="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\033[36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

SSH="ssh -p $SSH_PORT -o BatchMode=yes $HOST"
RSYNC_SSH="ssh -p $SSH_PORT"
SRC_DIR="$DEPLOY_DIR/src"

# ---------- 0. 前置检查 ----------
step "前置检查"
[ -f .env ] || die "本地缺 .env(需含 DEEPSEEK_API_KEY 与 TIANDITU 两个 key)"
command -v rsync >/dev/null || die "本地缺 rsync"
$SSH true 2>/dev/null || die "SSH 连不上 $HOST(:$SSH_PORT)"
REMOTE_NODE=$($SSH 'command -v node >/dev/null 2>&1 && node -v || echo NO_NODE')
[ "$REMOTE_NODE" = "NO_NODE" ] && die "服务器没装 Node(需 ≥20):建议 fnm/nvm 安装后重试"
ok "SSH 通 / 远端 Node $REMOTE_NODE"

# ---------- 1. 同步源码(保留服务器 data/ 与 prod.env) ----------
step "rsync 源码 → $HOST:$SRC_DIR"
$SSH "mkdir -p '$DEPLOY_DIR/data'"
rsync -az --delete -e "$RSYNC_SSH" \
  --exclude node_modules --exclude .next --exclude data \
  --exclude '.env*' --exclude '*.log' --exclude .DS_Store \
  ./ "$HOST:$SRC_DIR/"
ok "源码同步完成(data/ 与密钥不受影响)"

# ---------- 2. 密钥与运行环境(prod.env = 本地 .env + 绝对 DB_PATH) ----------
step "组装 prod.env"
cat .env | $SSH "cat > '$DEPLOY_DIR/.env.upload'"
$SSH "cd '$DEPLOY_DIR' && { cat .env.upload; echo \"DB_PATH=$DEPLOY_DIR/data/shidi.db\"; echo 'NODE_ENV=production'; } > prod.env && chmod 600 prod.env .env.upload && rm .env.upload"
ok "prod.env 就绪(DB_PATH=$DEPLOY_DIR/data/shidi.db)"

# ---------- 3. 服务器构建(在目标平台编译原生模块) ----------
step "远端 npm ci + build(首次约 2-4 分钟)"
$SSH "cd '$SRC_DIR' && ( [ -d node_modules ] || npm ci --silent ) && npm run build --silent && cp -r .next/static .next/standalone/.next/static && ( [ -d public ] && cp -r public .next/standalone/public || true )"
ok "构建完成"

# ---------- 4. 常驻服务(systemd,无 sudo 退化为 nohup) ----------
step "启动/重启服务(端口 $APP_PORT)"
if $SSH 'sudo -n true 2>/dev/null'; then
  NODE_BIN=$($SSH 'command -v node')
  $SSH "sudo tee /etc/systemd/system/placelore.service >/dev/null <<EOF
[Unit]
Description=PlaceLore (shi-di history research)
After=network.target

[Service]
WorkingDirectory=$SRC_DIR
EnvironmentFile=$DEPLOY_DIR/prod.env
Environment=PORT=$APP_PORT HOSTNAME=0.0.0.0
ExecStart=$NODE_BIN $SRC_DIR/.next/standalone/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload && sudo systemctl enable --now placelore >/dev/null 2>&1; sudo systemctl restart placelore"
  ok "systemd 服务 placelore 已重启(开机自启)"
else
  $SSH "cd '$DEPLOY_DIR' && kill \$(cat run.pid 2>/dev/null) 2>/dev/null || true; cd '$SRC_DIR' && (setsid env PORT=$APP_PORT HOSTNAME=0.0.0.0 node --env-file='$DEPLOY_DIR/prod.env' .next/standalone/server.js >> '$DEPLOY_DIR/run.log' 2>&1 & echo \$! > '$DEPLOY_DIR/run.pid')"
  ok "nohup 常驻已重启(pid 见 $DEPLOY_DIR/run.pid,日志 run.log)"
fi

# ---------- 5. 健康检查 ----------
step "健康检查(首页 200)"
for i in $(seq 1 30); do
  CODE=$($SSH "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$APP_PORT/ 2>/dev/null" || echo 000)
  [ "$CODE" = "200" ] && { ok "http://127.0.0.1:$APP_PORT/ → 200"; break; }
  [ "$i" = 30 ] && die "健康检查失败(最后状态码 $CODE),查日志: $SSH journalctl -u placelore -n 50 --no-pager 或 $DEPLOY_DIR/run.log"
  sleep 1
done

echo
ok "部署完成 → http://$HOST:$APP_PORT (绑定域名后走反代,注意 docs/部署.md 的 SSE 参数)"
echo "  · 数据文件:$DEPLOY_DIR/data/shidi.db(备份它 = 备份全部任务/报告/缓存)"
echo "  · 后续更新:重跑本脚本即可(data 与密钥不动)"
