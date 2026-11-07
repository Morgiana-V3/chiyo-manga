# 架构

`src/shared/model.ts` 定义工程、素材、图层、生成记录与动作契约；`actions.ts` 是纯领域动作。局部更新的 schema 移除创建默认值，避免属性编辑覆盖未提交字段。

`src/main/project-store.ts` 是唯一可写工程状态。人工 IPC 和 MCP 共用此入口、revision 检查、锁定规则、操作去重和撤销历史。Renderer 仅维护选择工具、缩放和未提交的拖动预览。方案按步骤显示，整体进入一次撤销历史；执行期间阻止其他写入。生成回执和其素材不随排版撤销消失。

`src/main/generation.ts` 管理真实生成执行；`novel-prompt.ts` 通过现有宿主本地命名管道连接。凭据只在 NovelPrompt 内使用。请求发送前保存环境与余额，返回后保存原始回执并将 PNG 导入素材。图片版本使用独立 ID 和 SHA-256，采用状态不改写已绑定的具体版本。

`.chiyo` 为 ZIP：`project.json` 和 `assets/<uuid>.png`。打开时校验模型、交叉引用与哈希；保存写入临时文件后替换。自动恢复保留上一份 `.bak`，素材库缓存不自动删除用户文件。内存撤销最多 40 步、操作去重最多 512 条、活动最多 200 条、方案最多 30 条。工程最多 100 页、每页 500 对象、1000 素材、500 生成记录；图片最大 30 MB、8000 万像素。

Electron 使用 contextIsolation、sandbox 与窄 preload API。Renderer 无 Node/文件系统能力；图片通过校验 UUID 的 `chiyo://asset/` 读取。MCP 使用本机随机端口和随机 Bearer token，拒绝带 Origin 的请求；stdio 入口从当前实例描述文件读取地址，不在日志中输出 token。描述文件属于本机用户数据，勿共享。

SVG 为画布、效果及文字的统一渲染基础，裁切几何由 `PanelClips.vue` 共享。人工和 MCP 导出共用当前 Renderer 的渲染函数，将素材内嵌后栅格化，主进程写入 PNG 的 DPI。导出移除选框与辅助线。Less 集中定义紧凑工作台布局和状态样式。

图层目录以 `kind=group` 与可选 `folderId` 表达；既有 `parentId` 仍专用于漫画格裁切。工程保留单一扁平存储，`shared/layers.ts` 统一目录查询、继承锁定/显隐和子树排序。存储按从后到前排列，每个文件夹后紧随完整子树，前台列表反向展示同级节点。拖动与属性修改目录均通过 `layer.move`；循环引用、跨页目录和超过深度上限的移动拒绝。旧文件缺少 folderId 时视为根目录。

`LayerArtwork.vue` 递归渲染同一目录模型，供画布、缩略图与导出共用；文件夹不绘制占位矩形。`LayerTree.vue` 只保存折叠和拖动反馈，不维护第二套图层数据。`canvas-viewport.ts` 只维护视图偏移和临时抓手状态，缩放通过 `update:zoom` 同步，围绕指针位置保持锚点；导航不创建业务动作或撤销记录。

图层复制缓冲区只保存一个脱离工程的临时快照，切换工程或重启清空，不持有第二套可编辑文档；复制不修改 revision、dirty 或撤销栈。`shared/layer-copy.ts` 统一收集目录/裁切依赖并重映射编号，`layer.paste` 经 actions.ts 原子校验和插入，同人工/MCP 共用，一次撤销完整移除。画稿引用复用同工程素材；不宣称跨工程或系统剪贴板互通。


`shared/panel-geometry.ts` 是格框轮廓、旋转坐标变换、凸多边形校验与半平面切分的唯一几何入口。`panel-actions.ts` 原子复制裁切依赖，所有新 ID 由调用方提供，方案预检不会生成另一套编号。画布预览、缩略图、PanelClips 与导出都使用同一几何。`shared/balloon-geometry.ts` 用 MIT 依赖 polygon-clipping 联合主体、连体与曲线尾巴，避免内部描边；新字段均可选，保持旧工程外观。

`canvas-geometry.ts` 只计算拖动预览补丁，松手经 layer.update 提交一次；取消不写入。`balloon-text.ts` 使用实际系统字体测量并二分查找可容纳字号，避免长对白逐字号遍历。样式控件使用 Less。

MCP 视图操作调用当前 Renderer 的窄函数与已有 Vue refs；`frontend-input.ts` 只向当前 BrowserWindow 发送鼠标输入，不建立编辑器状态。画布操作回执最多 128 条。所有工程改动最终仍由 ProjectStore 执行。MCP 必须在加载 Renderer 前建立，使前端加载失败时仍能读取真实工程上下文、保存与正常关闭。
