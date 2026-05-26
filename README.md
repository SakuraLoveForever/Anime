# 追番管理器

自定义看番追剧管理工具，支持多源搜索、DeepSeek AI 智能填充番剧信息。

# 画面预览

<img width="1864" height="995" alt="Clip_20260518_004804" src="https://github.com/user-attachments/assets/ee20b1fb-3088-4193-ad52-da9d974d7311" />

# 在线网页模式

[番剧管理](https://anime-tracker-0ptb.onrender.com/)

在线版完整支持搜索番剧、AI 智能填充、链接解析等全部功能，基于 **Firebase** 提供多用户云端同步。

> 首次访问 Render 可能需要等待 ~30 秒唤醒（免费实例休眠）。纯前端镜像站：[GitHub Pages](https://sakuraloveforever.github.io/Anime/)（无 AI 功能）

### 注册 / 登录

打开网页后，点击右上角 **🔑 登录** 按钮：

- 输入邮箱和密码，点击注册即可创建账号
- 注册后自动登录，所有数据保存在云端
- 后续登录同一账号即可跨设备同步番剧数据

### AI 功能

点击右上角 ⚙ → 填入你的 [DeepSeek API Key](https://platform.deepseek.com/api_keys) → 点击「🧪 测试」→ 保存。

- 每个人的 API Key 只保存在自己浏览器中，不会上传到服务器
- 添加番剧时点击「🤖 AI 填充」即可自动补全信息
- 支持一键「🔄 重新分类」批量修正番剧分类

### 云端功能

| 功能 | 说明 |
|------|------|
| 多用户隔离 | 每个账号拥有独立的番剧库、文件夹、自定义搜索源 |
| 自动同步 | 添加/删除/编辑番剧实时同步到 Firestore |
| 离线降级 | 网络异常时自动切换本地存储，恢复后重新同步 |
| 跨设备 | 登录同一账号即可在不同设备间使用 |

### 数据备份

点击右上角齿轮 ⚙ → 设置面板底部「数据管理」：

| 操作 | 说明 |
|------|------|
| 📥 导出数据 | 将所有番剧、收藏夹、搜索源、设置打包下载为 JSON 文件 |
| 📤 导入数据 | 选择备份文件恢复数据，在线模式下自动同步到云端 |

> 建议定期导出备份，方便迁移或恢复数据。

### 数据存储

- **Firebase Authentication** — 邮箱/密码登录认证
- **Cloud Firestore** — 番剧列表、文件夹、搜索源、偏好设置（按用户 UID 隔离）
- 首次登录后，本地存储的番剧数据会自动合并上传到云端

# 本地搭建
## 食用手册

### 准备工作

- 安装 [Node.js](https://nodejs.org/)（建议 18 以上版本）
- 准备一个 [DeepSeek API Key](https://platform.deepseek.com/api_keys)

### 安装 & 启动

```bash
# 1. 克隆项目
git clone <repo-url> && cd Anime

# 2. 安装依赖（只需一次）
npm install

# 3. 启动
# Windows: 双击 start.bat
# 其他: node server.js
```

### 配置 API Key

1. 打开浏览器访问 `http://localhost:3456`
2. 点击顶栏右侧 ⚙ 齿轮按钮
3. 粘贴你的 DeepSeek API Key（以 `sk-` 开头）
4. 点击「🔍 测试」验证连通性
5. 测试成功后点击「保存」

### 添加番剧

点击右上角「＋ 添加番剧」按钮：

- **手动输入** — 输入番剧名称，后端自动从 Bangumi / MyAnimeList / AniList 搜索并填充信息
- **AI 填充** — 先输入名称，再点击「🤖 AI 填充」让 DeepSeek 智能补全
- **粘贴链接** — 支持 Bangumi、MyAnimeList、AniList 等链接，自动抓取解析
- **自定义来源** — 左侧边栏可添加自己的番剧搜索网站

