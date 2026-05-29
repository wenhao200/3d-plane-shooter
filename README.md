# ✈️ 3D Plane Shooter

一款卡通风格的 3D 飞机射击游戏，使用 Three.js 构建。

## 🎮 游戏操作

| 按键 | 功能 |
|------|------|
| **W A S D** | 移动飞机 |
| **SPACE** | 射击 / 开始游戏 / 重新开始 |

## 🎯 游戏玩法

- **敌人系统**：消灭迎面而来的普通敌机和精英大飞机
- **火力升级**：收集橙色道具 🔥 提升火力等级
  - Lv.1：单发子弹
  - Lv.2：双发子弹
  - Lv.3：三发散弹
- **生命恢复**：收集绿色十字道具 ❤️ 恢复生命
- **难度递进**：随时间推移，敌人更快、更强、更密集
- **无限模式**：挑战最高分！

## 🛠️ 技术栈

- **Three.js** - 3D 渲染
- 原生 JavaScript ES Module
- 纯前端，可直接在浏览器中运行

## 🚀 本地运行

```bash
# 使用任意 HTTP 服务器
python3 -m http.server 8080
# 或
npx serve
```

浏览器打开 `http://localhost:8080` 即可游玩。

## 📦 部署到 GitHub Pages

游戏已设计为纯静态页面，可直接部署到 GitHub Pages：

1. 在 GitHub 上创建仓库 `3d-plane-shooter`
2. 推送代码到 `main` 分支
3. 在仓库 Settings → Pages 中启用 GitHub Pages
4. 访问 `https://wenhao200.github.io/3d-plane-shooter`

## 🎨 特点

- 卡通风格低多边形 3D 飞机模型
- 第三人称跟随摄像机
- 粒子爆炸特效
- 连击系统
- 云端动态背景
- 自动难度递进
