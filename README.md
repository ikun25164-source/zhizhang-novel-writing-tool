# 织章 · 本地优先的小说创作工作台

> 正文、结构、事件线、人物、地图放在同一个工作台里，数据留在本机，通过 WebDAV 自行同步。

织章是一个本地优先的小说写作工具：所有作品都存在本地文件夹里，不经过任何云端服务；需要多设备时，用自己的 WebDAV（坚果云、群晖等）同步。同一套前端可以跑在浏览器、Windows 桌面（Electron）和安卓手机（Capacitor）上。

## 下载安装

到 [Releases](https://github.com/ikun25164-source/zhizhang-novel-writing-tool/releases) 下载最新版本：

- `zhizhang-1.0.0-setup.exe`：Windows 安装版，带开始菜单 / 桌面快捷方式和卸载程序。
- `zhizhang-1.0.0-portable.exe`：Windows 单文件便携版，双击即用，免安装。
- `zhizhang-1.0.0.apk`：Android 安装包。

安装版与便携版共用 `%APPDATA%\织章\data` 数据目录，并占用同一个本地端口，不能同时运行。

## 功能

- **正文写作**：Tiptap 富文本编辑器、分卷 / 章节树、字数与状态（草稿 / 修订 / 完成）、自动保存与每日备份。
- **结构**：总纲 → 卷大纲 → 章纲三级树，与正文并排编辑、双向联动。
- **事件线**：多条泳道、分支事件、自定义历法与时间排序。
- **人物栏**：人物设定、关系、与正文 / 章纲的双向关联。
- **世界观地图**：多张地图、地点条目与层级。
- **全局搜索**：正文、纲目、事件、人物、地点一次搜到并跳转。
- **导出**：一键复制全文、按卷 / 章导出。
- **多端同步**：桌面与手机都支持 WebDAV，冲突时保留两份内容。
- **键盘操作**：全站方向键导航——`←/→` 循环切换视图，`↑/↓` 在列表与卡片间移动并即时切换，`Home/End` 跳到首尾，空格激活按钮式条目，`Esc` 关闭弹层；正文与输入框内保留原生光标。
- **响应式**：手机端抽屉与内嵌关联面板，编辑时自动隐藏无关界面。

## 技术栈

React 18 · TypeScript · Vite · Zustand · Tiptap / ProseMirror · Express（本地 API 与静态服务）· Electron · Capacitor（Android）

## 本地运行

```bash
npm install
npm run dev      # Vite :5173 + 本地 API :8787
```

生产模式（本地服务同时托管构建后的前端）：

```bash
npm run build
npm start        # http://localhost:8787
```

> 开发模式下写数据会写入项目根目录 `data/`，该目录已被 `.gitignore` 忽略。桌面端的数据位于 `%APPDATA%\织章\data`。

## 打包

- **Windows 桌面**：`npm run electron:build`，输出 NSIS 安装包与便携版。输出目录由 `package.json` 的 `build.directories.output` 控制。
- **Android**：准备好 `android/keystore.properties` 与签名文件（仓库不包含）后执行 `npm run android:build`。用 `ZHIZHANG_JAVA_HOME`（或 `JAVA_HOME`）指定 JDK，`ZHIZHANG_APK_OUT` 指定 APK 输出目录。

签名文件、`local.properties`、`data/`、`dist/` 都不会提交到仓库。

## 目录结构

```
src/         前端（视图、组件、store、工具）
server/      本地 HTTP API、存储与 WebDAV 同步
electron/    桌面壳（单实例、固定端口、数据目录）
android/     Capacitor 安卓工程
scripts/     开发、图标、打包脚本
public/      静态资源
```

## 键盘操作一览

| 按键 | 作用 |
| --- | --- |
| `←` / `→` | 切换视图；在表单 / 列表中水平移动焦点 |
| `↑` / `↓` | 在列表、卡片、菜单间移动；章节 / 人物 / 事件即时切换 |
| `Home` / `End` | 跳到当前列表（或弹窗）的首条 / 末条 |
| `空格` / `Enter` | 激活按钮、打开章节 / 作品 |
| `Esc` | 关闭菜单、抽屉、弹窗 |
| `Ctrl/Cmd + K` | 全局搜索 |
| `Ctrl/Cmd + S` | 立即保存 |

正文编辑器、文本域、下拉框和滑杆内保留系统原生的方向键行为；搜索框内按 `↓` 可直接进入结果列表。

## 许可

[MIT](./LICENSE)
