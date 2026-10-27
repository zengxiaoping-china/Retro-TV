# Retro-TV

一个基于 Electron 的桌面版复古 CRT 电视模拟器

---

# 复古电视模拟器（Retro TV）

一个基于 Electron 的桌面版复古 CRT 电视模拟器：木质机身、透明无边框窗口、可自定义频道与播放列表，并带有开机/关机、切台雪花、扫描线等 CRT 效果。

## 功能概览

- **复古外观**：木质电视框、玻璃反光、扫描线与 RGB 荫罩效果
- **无边框透明窗口**：只保留电视本体；右上角提供最小化、关闭、置顶按钮（鼠标靠近时淡入）
- **频道系统**
  - 画布频道：彩色测试图、雪花信号
  - 播放列表频道：可放视频或音乐，一个频道可包含多个条目
- **频道设置（齿轮按钮 / 快捷键 `S`）**
  - 新增、删除频道，修改频道名
  - 切换频道类型（画布 / 播放列表）与画布预设
  - 播放列表中添加/移除本地媒体文件
- **播放策略**
  - 刚进入频道：从列表内**随机**选择条目，并随机选择播放起止时间（保持原有策略）
  - 频道内：按列表**顺序循环**播放，播完自动切到下一条，末尾回绕
  - 顺序切换的条目一律**从 0 开始**播放
- **MKV 音频兼容**：检测 Chromium 无法解码的音轨（如 AC3 / DTS / EAC3），自动用 ffmpeg 把音频转为 AAC（视频流直接复制），并缓存转码结果
- **画面效果**：6 种画面效果（正常、黑白、CRT 黑白、CRT 彩色、复古胶片、赛博朋克）
- **品牌与比例**：7 种电视品牌外观、7 种屏幕比例（4:3 / 16:9 / 21:9 / 1:1 / 3:4 / 9:16 / 自动）
- **动画效果**：开机亮线展开、关机画面收束为亮线再缩成发光点、切台雪花铺满整屏
- **数据持久化**：频道、播放列表、音量、效果、品牌、比例、上次频道等自动保存

## 快捷键

| 按键 | 功能 |
| --- | --- |
| `P` | 开机 / 关机 |
| `↑` / `↓` | 上一个 / 下一个频道 |
| `←` / `→` | 音量 -5 / +5 |
| `E` | 切换画面效果 |
| `B` | 切换品牌 |
| `A` | 切换屏幕比例 |
| `F` | 进入 / 退出全屏（也可双击屏幕切换；`ESC` 退出） |
| `O` | 选择本地视频/音乐并新建播放列表频道 |
| `S` | 打开频道设置 |
| `空格` | 暂停 / 继续当前播放 |
| `1`–`9` | 直接跳到对应频道 |

设置弹窗打开时，仅响应 `ESC`（关闭弹窗），其余快捷键被屏蔽。

## 运行与打包

环境要求：Node.js 18+（建议 20+），Windows / macOS / Linux（目前仅在 Windows 上验证）。

```bash
npm install

npm start        # 启动应用
npm run dev      # 以 --inspect=5858 启动，便于调试主进程
npm run pack     # 打包为未压缩目录（electron-builder --dir）
npm run dist     # 生成安装包（Windows 为 NSIS）
```

打包配置位于 `package.json` 的 `build` 字段，输出目录为 `dist/`。

## 目录结构

```
TV/
├─ package.json               # 项目信息、脚本、electron-builder 配置
├─ .gitignore
├─ src/
│  ├─ main.js                 # 主进程：窗口、全屏、持久化、文件选择、MKV 音频转码
│  ├─ preload.js              # contextBridge 暴露的安全 API（window.tvAPI）
│  └─ renderer/
│     ├─ index.html           # 页面结构（电视框、屏幕、控制面板、设置弹窗）
│     ├─ styles.css           # 外观、CRT 动画、雪花、设置弹窗样式
│     └─ renderer.js          # 频道/播放/设置/快捷键/画布绘制等全部交互逻辑
└─ node_modules/
```

## 数据持久化

保存位置（Windows）：

```
%APPDATA%\retro-tv\retro-tv-data.json
```

本机示例：

```
C:\Users\<用户名>\AppData\Roaming\retro-tv\retro-tv-data.json
```

- 内容包含 `channels`（频道及播放列表）与 `settings`（音量、效果、品牌、比例、上次频道）两部分。
- 修改设置后约 300ms 防抖保存；关闭窗口前会同步写入，避免最后一次改动丢失。
- 写入采用“临时文件 + 原子重命名”，避免写入失败导致配置损坏。
- 删除该文件即可恢复默认频道与默认设置。

## MKV 音频说明

Chromium 内核无法解码 AC3、DTS、EAC3、TrueHD 等音轨，因此这类 MKV 会出现“有画面无声音”。本项目在主进程中做了兜底：

1. 用 `ffprobe` 读取音轨编码；
2. 若存在浏览器不支持的音频编码，用 `ffmpeg` 转封装：视频流 `copy`，音频转 AAC（192k）；
3. 转码结果缓存到 `%APPDATA%\retro-tv\media-cache\`，按“文件路径 + 大小 + 修改时间”命名，后续直接复用；
4. 若找不到 ffmpeg/ffprobe，界面会提示“未找到 ffmpeg，MKV 音频无法转换”，视频仍可正常播放（无声）。

依赖系统 PATH 中的 `ffmpeg` 与 `ffprobe`，也可通过环境变量指定：

```
RETRO_TV_FFMPEG=D:\path\to\ffmpeg.exe
RETRO_TV_FFPROBE=D:\path\to\ffprobe.exe
```

## 媒体格式

- 视频：MP4 / WEBM / OGV / MOV / MKV / AVI / M4V / MPEG / MPG
- 音频：MP3 / WAV / FLAC / M4A / AAC / OPUS / WMA / OGA / OGG

实际能否播放取决于 Chromium 的解码能力；不支持的音轨可借助上面的 ffmpeg 方案处理。

## 技术要点

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，渲染进程通过 `preload.js` 暴露的 `window.tvAPI` 调用主进程能力
- 透明窗口在 Windows 上不支持原生全屏，因此采用“保存窗口 bounds → 铺满显示器 → 退出时恢复”的自定义全屏
- 窗口为无边框透明样式（`frame: false`、`transparent: true`），电视框外的区域完全透明
- 页面启用了 CSP，仅允许加载本地媒体、`blob:` 与内置示例视频域名 `commondatastorage.googleapis.com`

## 已知限制

- 默认频道中的“大雄兔 / 梦境之间 / 烈焰追踪”使用在线示例视频，需要联网才能播放
- AC3/DTS 等 MKV 音频转码依赖外部 ffmpeg/ffprobe
- 转码缓存不会自动清理，长期使用后可手动删除 `media-cache` 目录
- 全屏、透明窗口等行为目前主要在 Windows 上验证
