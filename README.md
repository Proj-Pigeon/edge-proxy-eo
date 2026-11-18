# edge-proxy-eo

GuEarth（咕咕地球）基于 **腾讯 EdgeOne Maker Node Functions** 的 Serverless 镜像代理服务。

采用**固定路由映射**解决方案，对底图瓦片、ArcGIS 3D 地形、USGS 全球地震数据、`models.dev` 模型元数据目录以及 **Hazel 自动更新源**（含 GitHub Releases 安装包完整流式镜像）等海外服务提供边缘缓存与合规镜像转发。

## 项目结构

```text
edge-proxy-eo/
├── edgeone.json                                   # EdgeOne Maker 配置
├── package.json                                   # ESM 配置与测试脚本
├── cloud-functions/                               # Node Functions 路由目录
│   ├── index.js
│   ├── health.js
│   ├── modelsdev.js
│   ├── lib/
│   │   ├── proxy.js
│   │   └── hazel.js
│   ├── tiles/
│   │   ├── osm/[z]/[x]/[y].js
│   │   ├── esri/[z]/[y]/[x].js
│   │   ├── opentopo/[z]/[x]/[y].js
│   │   └── viirs/[date]/[z]/[y]/[x].js
│   ├── arcgis/
│   │   ├── index.js                               # GET /arcgis?f=json
│   │   └── [[tile]].js                            # GET /arcgis/tile/{z}/{y}/{x}
│   ├── datasets/
│   │   └── earthquakes.js                         # GET /datasets/earthquakes
│   ├── update/
│   │   └── [platform]/
│   │       └── [version]/
│   │           ├── index.js                       # GET /update/{platform}/{version}
│   │           └── RELEASES.js                    # GET /update/{platform}/{version}/RELEASES
│   └── download/
│       ├── index.js                               # GET /download
│       └── [platform]/
│           ├── index.js                           # GET /download/{platform}
│           └── [[file]].js                        # GET /download/{platform}/{tag}/{file}
└── test/
    ├── hazel.spec.js
    ├── parse.spec.js
    ├── upstream.spec.js
    ├── proxy.spec.js
    └── run.js
```

## Hazel 自动更新源镜像

上游更新服务器：`https://guearth-updater.isla.fan`（底层安装包托管于 GitHub Releases `Proj-Pigeon/GuEarth`）。

| 路由 | 说明 | 缓存策略 |
|---|---|---|
| `GET /update/{platform}/{version}` | 检查更新元数据；上游返回 `204` 时原样透传 `204`，返回 `200` 时将 JSON 中的 `url` 改写为本代理 `/download/...` 地址 | `s-maxage=300`（5 分钟） |
| `GET /update/{platform}/{version}/RELEASES` | Squirrel.Windows `RELEASES` 清单；透传 `204`，返回 `200` 时将其中的 GitHub `.nupkg` 链接改写为本代理 `/download/...` 地址 | `s-maxage=300`（5 分钟） |
| `GET /download` | 按客户端 `User-Agent` 识别平台；拦截上游 `302` 跳转并改写 `Location` 指向本代理 `/download/auto/{tag}/{file}` | `no-store`（按 UA 变化） |
| `GET /download/{platform}` | 最新安装包入口；拦截上游 `302` 跳转并改写 `Location` 指向本代理 `/download/{platform}/{tag}/{file}` | `s-maxage=300`（5 分钟） |
| `GET /download/{platform}/{tag}/{file}` | 流式转发 GitHub Releases 安装包字节流，供国内客户端全程走 EdgeOne 边缘下载 | `s-maxage=2592000`（30 天） |

### 客户端接入方式

由于采用了与上游完全一致的顶层路由路径，GuEarth 客户端只需把更新源域名从 `https://guearth-updater.isla.fan` 替换为本代理域名（路径不变）：

```js
// Electron autoUpdater (Hazel) 示例
autoUpdater.setFeedURL({
  url: `https://<你的代理域名>/update/${process.platform}/${app.getVersion()}`,
});
```

## 开发与测试


```bash
npm test
```

使用 EdgeOne CLI 本地调试或部署：

```bash
npx edgeone pages dev
```
