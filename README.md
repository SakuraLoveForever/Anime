# 追番管理器

自定义看番追剧管理工具，支持多源搜索、DeepSeek AI 智能填充番剧信息。

# 画面预览

<img width="1864" height="995" alt="Clip_20260518_004804" src="https://github.com/user-attachments/assets/ee20b1fb-3088-4193-ad52-da9d974d7311" />


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

