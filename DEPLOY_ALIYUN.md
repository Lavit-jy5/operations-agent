# 阿里云服务器部署手册

这份手册适合当前项目的第一版内部试用部署：前端由 Nginx 提供静态页面，后端 FastAPI 在服务器本机 `127.0.0.1:8000` 常驻运行，Nginx 把 `/api/` 转发给后端。

## 推荐服务器

- 系统镜像：Ubuntu 22.04 LTS
- 配置：2 核 4G
- 带宽：3M-5M
- 安全组：先只放行 `22`、`80`，后续有域名和证书后再放行 `443`

## 服务器初始化

登录服务器后执行：

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx unzip curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

检查版本：

```bash
python3 --version
node --version
npm --version
nginx -v
```

## 上传项目

第一版可以把项目放到：

```text
/opt/operations-agent
```

建议不要上传这些目录：

```text
frontend/node_modules
frontend/dist
backend/.venv
backend/__pycache__
backend/app/**/__pycache__
```

## 后端配置

进入后端目录：

```bash
cd /opt/operations-agent/backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
```

编辑 `/opt/operations-agent/backend/.env`：

```text
APP_NAME=运营智能体 API
APP_ENV=production
FRONTEND_ORIGIN=http://你的服务器公网IP

WIND_API_MODE=mock

LLM_PROVIDER=bailian
DASHSCOPE_API_KEY=你的百炼APIKey
LLM_MODEL=qwen-plus
VISION_MODEL=qwen3.7-plus
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_TIMEOUT_SECONDS=180
```

注意：真实 API Key 只写在服务器 `.env`，不要提交到代码，也不要放前端。

先手动验证后端：

```bash
cd /opt/operations-agent/backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开一个终端检查：

```bash
curl http://127.0.0.1:8000/api/health
```

能返回 `ok` 或 `degraded` 就说明后端起来了。

## 后端常驻服务

复制服务文件：

```bash
sudo cp /opt/operations-agent/deploy/operations-agent.service.example /etc/systemd/system/operations-agent.service
sudo chown -R www-data:www-data /opt/operations-agent
sudo systemctl daemon-reload
sudo systemctl enable operations-agent
sudo systemctl start operations-agent
```

查看状态：

```bash
sudo systemctl status operations-agent
```

查看日志：

```bash
sudo journalctl -u operations-agent -f
```

## 前端打包

进入前端目录：

```bash
cd /opt/operations-agent/frontend
npm install
```

创建生产环境配置：

```bash
cp .env.example .env
```

编辑 `/opt/operations-agent/frontend/.env`：

```text
VITE_API_BASE_URL=/api
```

打包并复制到 Nginx 目录：

```bash
npm run build
sudo mkdir -p /var/www/operations-agent
sudo cp -r dist/* /var/www/operations-agent/
sudo chown -R www-data:www-data /var/www/operations-agent
```

## Nginx 配置

复制配置：

```bash
sudo cp /opt/operations-agent/deploy/nginx.operations-agent.conf.example /etc/nginx/sites-available/operations-agent
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/operations-agent /etc/nginx/sites-enabled/operations-agent
sudo nginx -t
sudo systemctl reload nginx
```

浏览器访问：

```text
http://你的服务器公网IP
```

## 每次更新项目

本地改完后，同步到服务器，然后执行：

```bash
cd /opt/operations-agent/backend
.venv/bin/python -m pip install -r requirements.txt
sudo systemctl restart operations-agent

cd /opt/operations-agent/frontend
npm install
npm run build
sudo cp -r dist/* /var/www/operations-agent/
sudo systemctl reload nginx
```

## 上线前安全清单

- 阿里云安全组只开放必要端口：`22`、`80`，有 HTTPS 后再开 `443`
- 百炼 API Key 只放后端 `.env`
- 不上传本地 `.env`
- 不上传 `node_modules`、`.venv`
- 上传文件大小由 Nginx `client_max_body_size 25m` 限制
- 如果公网给同事使用，下一步建议加登录密码或限制公司出口 IP

## 常见问题

如果网页能打开但生成失败，先看后端日志：

```bash
sudo journalctl -u operations-agent -f
```

如果提示连接不到后端，检查：

```bash
sudo systemctl status operations-agent
curl http://127.0.0.1:8000/api/health
sudo nginx -t
```

如果图片上传失败，检查 Nginx 配置里的：

```text
client_max_body_size 25m;
```

如果模型调用超时，把 `LLM_TIMEOUT_SECONDS` 调大，例如：

```text
LLM_TIMEOUT_SECONDS=180
```
