# 江尘 · 一束光，从智利到北京

> 在线预览：https://gitgpt-jpg.github.io/

科技感个人主页第二版。点状画布世界地图上，一束光从智利飞向北京（真实航线走向：经欧洲上空），点击两端可以进入我在那里的经历。

## 技术

纯 HTML + CSS + JavaScript，无框架、无构建步骤、无外部依赖：

- 开场是 WebGL2 实时渲染的全景地球（NASA [Blue Marble](https://visibleearth.nasa.gov/images/57735/the-blue-marble-land-surface-ocean-color-sea-ice-and-clouds) 24000 × 12000 底图，Wikimedia Commons 转载；云层与城市夜灯取自 [Solar System Scope](https://www.solarsystemscope.com/textures/) 8K 贴图（CC BY 4.0，Wikimedia Commons 转载），着色器内做云影、柔和晨昏线、薄大气边缘和胶片式色调映射；圣地亚哥和北京各有一个定位标记。镜头不缩放：地球停在智利·圣地亚哥，直接转向中国·北京，随后虚化、数字化成点阵，再展开为平面点状地图并衔接航线。宽屏加载 8192 像素日面和 4096 像素云图，其余用 4096 和 2048；纹理由 `tools/build-globe-textures.py` 生成。地名使用马善政书法体（[Ma Shan Zheng](https://github.com/google/fonts/tree/main/ofl/mashanzheng)，SIL OFL 1.1），已裁剪成只含地名字形的 `assets/caption-calligraphy.woff2`。没有 WebGL2 时回退到预渲染海报（`tools/render-orbit.py`，不含云层与定位标记）。支持跳过与减少动态效果。
- Canvas 手绘点状世界地图（Miller 投影 + 点阵采样）
- 光弧航线：三层辉光 + 流光动画，按两地时区实时显示「光行时间」
- 响应式：宽屏展示地图全景，窄屏自动切换为卡片模式
- 磨砂玻璃质感介绍卡、标签防遮挡自适应布局
- 内置测试：`node --test`

## 本地预览

```bash
python3 -m http.server 47613
# 浏览器打开 http://127.0.0.1:47613/
```

## 部署

纯静态文件，由 GitHub Pages 托管 `main` 分支，推送到仓库即自动更新。
