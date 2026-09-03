# 追番管理器

自定义看番追剧管理工具，支持多源搜索、DeepSeek AI 智能填充、多封面管理。

## 画面预览

<img width="1864" height="995" alt="Clip_20260518_004804" src="https://github.com/user-attachments/assets/ee20b1fb-3088-4193-ad52-da9d974d7311" />

## 在线网页模式

[番剧管理](https://anime-tracker-0ptb.onrender.com/)

在线版完整支持搜索番剧、AI 智能填充、链接解析等全部功能，基于 **Supabase** 提供多用户云端同步。

> 首次访问 Render 可能需要等待 ~30 秒唤醒（免费实例休眠）。页面会自动检测并重试后端，唤醒成功后会自动更新为“后端已连接”，无需手动点击。

### 自动保活（可选）

仓库内置了两个 GitHub Actions 定时任务：

- `render-keepalive.yml` 每 10 分钟请求 Render 的 `/health`，尽量减少免费实例休眠后的首次等待；
- `supabase-keepalive.yml` 每 12 小时查询一次 Supabase REST 接口，尽量避免 Free 项目因数据库活动不足而自动暂停。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 值 |
|------|------|
| `SUPABASE_URL` | 你的 Supabase 项目 URL，例如 `https://项目引用.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase 的 anon/publishable key |
| `RENDER_HEALTH_URL` | 可选；如果不是 README 中的默认部署地址，再填你的 `/health` 地址 |

这里只需要 anon/publishable key，**不要填写 `service_role` 或 `sb_secret` key**。定时任务是尽量保持活跃，不是服务可用性保证；如果 Supabase 已经暂停，需要先在 Supabase Dashboard 中手动 Resume。Supabase 官方也建议升级到付费计划来彻底避免因低活跃自动暂停。

### 注册 / 登录

打开网页后，点击右上角 **🔐 登录** 按钮：

- 输入邮箱和密码，点击注册即可创建账号
- 注册后自动登录，所有数据保存在云端
- 后续登录同一账号即可跨设备同步番剧数据

### AI 功能

点击右上角 ⚙ → 填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys) → 选择模型 → 点击「🧪 测试」→ 保存。API 地址默认使用 `https://api.deepseek.com`。

- **DeepSeek Chat**（`deepseek-chat`）— 通用快捷模型，速度快、成本低，适合日常补全使用（默认）；
- **DeepSeek V4 Flash**（`deepseek-v4-flash`）— 速度快、成本低，推荐日常使用；
- **DeepSeek V4 Pro**（`deepseek-v4-pro`）— 复杂推理和信息整理质量更高；
- **DeepSeek V4 Flash Vision（实验版）**（`deepseek-v4-flash-vision-exp`）— 支持图片输入。当前项目的 AI 补全流程仍以文字为主，选择该模型不会自动上传封面图片。

> 「一键AI补全」只对**缺失信息**的番剧执行，用有限并发同时补全，并只在全部结束后保存/渲染一次。**文字（简介/分类/评分/标签/集数）优先由 DeepSeek 生成**（模型报错时自动回退到 `deepseek-chat`，避免卡在无效模型上）；**封面通过 AniList 获取，且 AniList 会在 AI 缺数据时兜底补齐动画信息**，实测其它源在当前网络下不可用（已移除）。批量速度显著提升。

模型名称和能力以 [DeepSeek 官方模型文档](https://api-docs.deepseek.com/quick_start/pricing) 为准；Vision 的图片输入格式见 [官方 Vision 文档](https://api-docs.deepseek.com/guides/vision/)。

- 每个人的 API Key 只保存在自己浏览器中，不会上传到服务器
- 添加番剧时点击「🤖 AI 填充」自动补全信息
- 番剧卡片上的「AI」按钮可强制重新搜索并覆盖全部字段
- 顶栏「🤖 一键AI补全」批量为缺失信息的番剧补充数据
- 顶栏「🔄 重新分类」批量 AI 重新识别番剧分类
- 顶栏「🎯 智能推荐」根据番剧口味推荐相似作品

### 封面管理

- **多封面支持**：每部番剧可存储多张封面图片，随时切换
- 顶栏「🎨 探索更多封面」一键为全部或选中番剧搜索封面（新封面替换旧的可选项，当前主封面保留）
- 编辑弹窗（左键卡片）和详情弹窗（右键卡片）均可获取封面并点击切换
- 支持上传自定义封面图片

### 卡片视图模式

- **展开模式**：完整卡片（封面、标签、进度条、评分）
- **精简模式**：紧凑列表（仅番名、进度、评分），点击排序栏 📋 按钮切换

### 数据备份

点击右上角齿轮 ⚙ → 设置面板底部「数据管理」：

| 操作 | 说明 |
|------|------|
| 📥 导出数据 | 将所有番剧、收藏夹、搜索源、设置打包下载为 JSON 文件 |
| 📤 导入数据 | 选择备份文件恢复数据，在线模式下自动同步到云端 |

> 建议定期导出备份，方便迁移或恢复数据。

### 数据存储

- **Supabase Auth** — 用户名/密码登录认证
- **Supabase Database** — 番剧列表、文件夹、搜索源（按用户隔离）
- 首次登录后，本地存储的番剧数据会自动合并上传到云端

## 本地搭建（最简单方式）

本地版只需要 Node.js。前端文件已经包含在项目中，不需要单独启动前端，也不需要执行构建命令。

### 第一次使用

1. 安装 [Node.js 20+](https://nodejs.org/)，安装后重新打开终端。
2. 下载项目：
   - 熟悉 Git：执行 `git clone https://github.com/SakuraLoveForever/Anime.git`，然后进入 `Anime` 文件夹；
   - 不熟悉 Git：在 GitHub 点击 **Code → Download ZIP**，解压后打开项目文件夹。
3. 双击项目根目录的 **`start.bat`**。

`start.bat` 会自动检查 Node.js、自动安装依赖、启动服务，并在服务准备好后打开浏览器。第一次启动需要等待一会儿，之后直接双击即可。

打开地址：<http://localhost:3456/>

### 离线版登录多个账号

本地部署不需要 Supabase 也可以登录。打开页面后，点击右上角 **🔐 登录**，使用“用户名 + 密码”注册本地账号；在账号菜单中可以退出或切换其他账号。

- 同一台电脑、同一个浏览器可以注册多个本地账号。
- 每个账号的番剧、收藏夹、搜索记录、主题、精简模式和 API Key 都是独立的。
- 第一次注册时，如果之前保存过未登录数据，程序会询问是否迁移到新账号。
- 本地账号只保存在当前浏览器，不是云端账号；清除浏览器数据、更换浏览器或换电脑后不会自动带过去。
- 如果项目配置了 Supabase，选择在线模式时仍使用邮箱云端账号；没有 Supabase 配置时会自动使用本地账号。

### 其他启动方式

如果不使用 `start.bat`，也可以在包含 `package.json` 和 `server.js` 的项目根目录执行：

```bash
npm install
npm start
```

启动后不要关闭终端窗口；停止服务按 `Ctrl+C` 即可。

### 常见问题

- **浏览器显示 `ERR_CONNECTION_REFUSED`**：服务没有启动。重新双击 `start.bat`，或在项目根目录执行 `npm start`。
- **提示找不到 Node.js 或 npm**：重新安装 Node.js 20+，然后重新打开终端。
- **提示端口 `3456` 已被占用**：关闭已经运行的旧服务后，再启动 `start.bat`。
- **依赖安装失败**：确认网络正常后重新双击 `start.bat`；脚本会继续补齐缺失依赖。
- **显示“后端未连接”**：页面会自动持续检测；如果刚部署的在线后端正在唤醒，请等待状态自动更新，也可以点击状态文字立即重试。

### 配置 API Key

1. 打开浏览器访问 `http://localhost:3456`
2. 点击顶栏右侧 ⚙ 齿轮按钮
3. 粘贴你的 DeepSeek API Key（以 `sk-` 开头）
4. 选择要使用的 DeepSeek 模型（默认 DeepSeek Chat）
5. 点击「🧪 测试」验证连通性
6. 测试成功后点击「保存」

如果是已有的 Supabase 项目，需要在 Supabase SQL Editor 中执行一次以下迁移，为账号设置增加模型字段：

```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS api_model text DEFAULT 'deepseek-chat';
```

### 添加番剧

点击顶栏「＋ 添加番剧」按钮：

- **手动输入** — 输入番剧名称，后端自动从 Bangumi / MyAnimeList / AniList 搜索并填充信息
- **AI 填充** — 先输入名称，再点击「🤖 AI 填充」让 DeepSeek 智能补全
- **粘贴链接** — 支持 Bangumi、MyAnimeList、AniList 等链接，自动抓取解析
- **批量添加** — 点击「📋 批量添加」，一行一个名字快速录入
- **自定义来源** — 左侧边栏可添加自己的番剧搜索网站
