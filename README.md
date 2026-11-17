# edge-proxy-eo

GuEarth（咕咕地球）基于 **腾讯 EdgeOne Maker Node Functions** 的 Serverless 镜像代理服务。

采用**固定路由映射**解决方案，对底图瓦片、ArcGIS 3D 地形、USGS 全球地震数据与 `models.dev` 模型元数据目录等海外服务提供边缘缓存与合规镜像转发。

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
│   │   └── proxy.js
│   ├── tiles/
│   │   ├── osm/[z]/[x]/[y].js
│   │   ├── esri/[z]/[y]/[x].js
│   │   ├── opentopo/[z]/[x]/[y].js
│   │   └── viirs/[date]/[z]/[y]/[x].js
│   ├── arcgis/
│   │   ├── index.js                               # GET /arcgis?f=json
│   │   └── [[tile]].js                            # GET /arcgis/tile/{z}/{y}/{x}
│   └── datasets/
│       └── earthquakes.js                         # GET /datasets/earthquakes
└── test/
    ├── parse.spec.js
    ├── upstream.spec.js
    └── proxy.spec.js
```


## 开发与测试


```bash
npm test
```

使用 EdgeOne CLI 本地调试或部署：

```bash
npx edgeone pages dev
```
