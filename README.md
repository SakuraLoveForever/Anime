# 追番管理器

自定义看番追剧管理工具，支持多源搜索、DeepSeek AI 智能填充、多封面管理。

## 画面预览

<img width="1864" height="995" alt="Clip_20260518_004804" src="https://github.com/user-attachments/assets/ee20b1fb-3088-4193-ad52-da9d974d7311" />

## 在线网页模式

[番剧管理](https://anime-tracker-0ptb.onrender.com/)

在线版完整支持搜索番剧、AI 智能填充、链接解析等全部功能，基于 **Supabase** 提供多用户云端同步。

> 首次访问 Render 可能需要等待 ~30 秒唤醒（免费实例休眠）。

### 注册 / 登录

打开网页后，点击右上角 **🔐 登录** 按钮：

- 输入用户名和密码，点击注册即可创建账号
- 注册后自动登录，所有数据保存在云端
- 后续登录同一账号即可跨设备同步番剧数据

### AI 功能

点击右上角 ⚙ → 填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys)（或自定义 API 地址）→ 点击「🧪 测试」→ 保存。

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

## 本地搭建

本地版是一个 Node.js + Express 服务，前端静态文件也由这个服务提供，**不需要单独启动前端开发服务器，也不需要执行 `npm run build`**。

### 准备工作

- 安装 [Node.js](https://nodejs.org/) **20 或更高版本**。当前 Supabase 依赖要求 Node.js 20+；安装后重新打开终端。
- 安装 Git（或者在 GitHub 页面下载 ZIP 并解压）。
- DeepSeek API Key **不是启动必需项**，只有使用 AI 填充、智能推荐等功能时才需要。

先确认 Node.js 和 npm 已安装：

```bash
node --version
npm --version
```

### 安装依赖

在项目根目录执行（根目录应能看到 `package.json`、`server.js` 和 `start.bat`）：

```bash
# 克隆项目
git clone https://github.com/SakuraLoveForever/Anime.git
cd Anime

# 安装依赖
npm install
```

#### npm 12 报 EALLOWREMOTE 的处理方法

本仓库的 `package-lock.json` 使用了 `registry.npmmirror.com` 的依赖下载地址。npm 12 默认将 `allow-remote` 设为 `none`；如果你本机的 npm registry 是 `registry.npmjs.org`，npm 可能会把锁文件中的镜像 tarball 误判为“远程依赖”，并报如下错误：

```text
npm error code EALLOWREMOTE
npm error Fetching packages of type "remote" have been disabled
npm error Refusing to fetch "tslib@https://registry.npmmirror.com/..."
```

优先使用与锁文件一致的镜像执行安装（只影响本次命令）：

```bash
npm install --registry=https://registry.npmmirror.com/ --no-audit --no-fund
```

如果你必须使用 npm 官方源，也可以在确认仓库和锁文件可信后临时允许远程 tarball：

```bash
npm install --allow-remote=all --no-audit --no-fund
```

检查当前 npm 配置：

```bash
npm config get registry
npm config get allow-remote
```

`tslib` 是 `@supabase/supabase-js` 的传递依赖，不需要单独执行 `npm install tslib`。如果安装被中断，修复 registry 配置后重新执行上面的安装命令即可。

### 启动服务

#### Windows（推荐先用终端启动）

在项目根目录打开 PowerShell 或命令提示符：

```powershell
npm start
```

看到以下提示后，保持这个窗口不要关闭：

```text
Anime tracker backend running at http://localhost:3456
Open http://localhost:3456 in your browser
```

然后打开浏览器访问：

<http://localhost:3456/>

也可以双击项目根目录的 `start.bat`。它会启动 Node.js 服务并自动打开浏览器；如果窗口一闪而过，请改用 `npm start`，这样可以直接看到启动报错。

#### Linux / macOS

```bash
npm start
# 或使用 Node.js 的监听模式
npm run dev
```

### 启动故障排查

#### 浏览器显示 `ERR_CONNECTION_REFUSED`

这表示 `3456` 端口没有服务监听，通常是服务没有启动或启动后报错，不是页面本身的问题。回到启动服务的终端，确认没有 `Cannot find module`、`EADDRINUSE` 等错误。

Windows PowerShell 可检查端口：

```powershell
Get-NetTCPConnection -LocalPort 3456 -State Listen
```

能看到监听记录后，再访问 `http://localhost:3456/`。也可以直接检查 HTTP 响应：

```powershell
Invoke-WebRequest http://localhost:3456/ -UseBasicParsing
```

如果提示找不到模块，回到项目根目录重新安装依赖；如果提示端口已占用，关闭占用该端口的旧 Node.js 服务后再执行 `npm start`。

#### 修改端口

如果 `3456` 已被其他程序使用，可临时换一个端口：

```powershell
$env:PORT=3457
npm start
```

然后访问 <http://localhost:3457/>。使用自定义端口时不要双击 `start.bat`，因为它固定打开 `3456`。

### 配置 API Key

1. 打开浏览器访问 `http://localhost:3456`
2. 点击顶栏右侧 ⚙ 齿轮按钮
3. 粘贴你的 DeepSeek API Key（以 `sk-` 开头）
4. 点击「🧪 测试」验证连通性
5. 测试成功后点击「保存」

### 添加番剧

点击顶栏「＋ 添加番剧」按钮：

- **手动输入** — 输入番剧名称，后端自动从 Bangumi / MyAnimeList / AniList 搜索并填充信息
- **AI 填充** — 先输入名称，再点击「🤖 AI 填充」让 DeepSeek 智能补全
- **粘贴链接** — 支持 Bangumi、MyAnimeList、AniList 等链接，自动抓取解析
- **批量添加** — 点击「📋 批量添加」，一行一个名字快速录入
- **自定义来源** — 左侧边栏可添加自己的番剧搜索网站
