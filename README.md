# 运营智能体

这是一个前后端分离的运营内容智能体，用于把运营材料、图片、参考文档、人工补充要求和结构化提示词生成专业、克制、可复核的热点内容。

当前产品主流程收敛为：

- 热点异动：一句话需求、材料正文、字数和写作要求，一键生成异动草稿
- 热点文章：先搭建文章工作台，维护主题、材料、角度和长文提示词
- Skills：按业务板块管理内置写作能力，如热点异动 Skills、热点文章 Skills
- 提示词模板：维护通用系统提示词，并按热点异动/热点文章分别维护标题提示词和输出模板

推荐使用流程：

```text
热点异动：
一句话需求
→ 生成结构化用户提示词
→ 粘贴或上传文本材料
→ 正式生成热点异动

热点文章：
填写文章主题、目标读者、文章角度
→ 粘贴新闻/研报/Wind/产品材料
→ 按热点文章模板组织长文
→ 使用热点文章 Skills 做事实、产品和合规约束
```

当前支持的材料输入：

- 直接粘贴文字材料
- 上传并提取 `.txt`
- 上传并提取 `.md`
- 上传并提取 `.docx`
- 上传 `.jpg`、`.png`、`.webp` 等图片，并通过百炼视觉模型提取图片文字、图表和数据

模板分工：

- 通用系统提示词：约束所有板块的事实边界、材料来源和合规红线。
- 板块标题提示词：热点异动、热点文章分别维护标题生成规则。
- 热点异动输出模板：规定主推方案、备选方案、撰写说明和自查清单。
- 热点文章输出模板：规定标题开场、热点解读、后市展望、相关产品、互动收尾和风险披露。
- Skills：按业务板块规定写作判断、数据核验、产品承接和合规红线。
- 产品范围：正文和相关产品段只允许出现国泰基金出品或管理的基金产品；其他基金公司产品必须剔除。

Wind 能力不再作为前端查询台展示。后续如果需要，可作为智能体的后台工具，用于少量数据复核或补充，而不是替代 Wind 终端。

## 项目结构

```text
wind-hot-brief-app/
  frontend/   React + Vite 前端
  backend/    FastAPI 后端
```

## 后端启动

需要 Python 3.9+。如果虚拟环境创建过程中按了 `Ctrl+C`，`.venv` 可能只创建了一半，重新执行 `python3 -m venv .venv` 即可补齐。

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
cp .env.example .env
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

## 前端启动

```bash
cd frontend
npm install
npm run dev
```

默认前端会请求：

```text
http://localhost:8000/api
```

如果后端地址变化，可以在 `frontend/.env` 里配置：

```text
VITE_API_BASE_URL=http://localhost:8000/api
```

## 阿里云部署

已经整理了第一版服务器部署手册和示例配置：

- [DEPLOY_ALIYUN.md](./DEPLOY_ALIYUN.md)
- [deploy/nginx.operations-agent.conf.example](./deploy/nginx.operations-agent.conf.example)
- [deploy/operations-agent.service.example](./deploy/operations-agent.service.example)

## 百炼大模型配置

后端已按百炼 OpenAI 兼容接口封装好。复制 `backend/.env.example` 为 `backend/.env` 后，填写：

```text
LLM_PROVIDER=bailian
DASHSCOPE_API_KEY=你的百炼APIKey
LLM_MODEL=qwen-plus
VISION_MODEL=qwen3.7-plus
BAILIAN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

填好 Key 并重启后端后，运营智能体会把题材、系统提示词、标题提示词、输出模板、用户提示词、字数要求、上传文件名、已启用 Skills 和材料上下文一起传给模型。

## 后续接入点

- 快报生成：`backend/app/services/llm_service.py`
- 一句话需求补全：`backend/app/services/prompt_service.py`
- 百炼 OpenAI 兼容客户端：`backend/app/services/bailian_client.py`
- 材料文本提取：`backend/app/services/material_service.py`
- Wind 后台工具预留：`backend/app/services/wind_service.py`
- Skills 运行时目录：`backend/app/skills/`
- 热点异动技能包：`backend/app/skills/hotspot_movement/`
- 热点文章技能包：`backend/app/skills/hotspot_article/`
- 数据/材料校验：`backend/app/services/validation_service.py`
- 日志记录：`backend/app/services/log_service.py`
