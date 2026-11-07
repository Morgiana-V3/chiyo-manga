# 前台 MCP 契约 v0.4.0

协议入口为 `scripts/mcp-bridge.mjs <bridge.json绝对路径>`，stdio JSON-RPC，一行一条消息；支持 initialize、notifications/initialized、ping、tools/list、tools/call。具体参数 schema 来自 `src/main/mcp.ts`，通过 tools/list 获取，不维护另一套业务模型。

| 工具                     | 作用                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| chiyo_get_context        | 当前工程、revision、素材与生成记录、方案、宿主路径/模式/目录、busy/editing |
| chiyo_view_image         | 真实素材 PNG 与元数据，预览最长边 1600 像素                                |
| chiyo_view_workspace     | 当前 Electron 可见工作区截图                                               |
| chiyo_import_image       | 导入真实本地图片；可传 family_id 创建候选版本                              |
| chiyo_propose            | 基于 expected_revision 验证动作并展示前台方案                              |
| chiyo_adopt_proposal     | 采纳方案，step_delay_ms 为 100–2000，默认 600                              |
| chiyo_frontend_action    | 人工共用的单步动作；需要 revision 和唯一 operation_id                      |
| chiyo_get_operation      | 读取编辑回执或生成记录；未找到不代表从未执行                               |
| chiyo_provider_status    | 核实 NovelPrompt 当前开发宿主并查询真实余额                                |
| chiyo_generate           | 单张生成或矩形局部重绘，需已有用户生成授权                                 |
| chiyo_recover_generation | 查询/恢复已有结果，绝不重放生成请求                                        |
| chiyo_export_page        | 当前 revision 页面导出到绝对 PNG 路径，不覆盖已有文件                      |

动作：layer.add/update/remove/order、selection.set、page.add/select/update、project.rename、asset.update、history.undo/redo。图层 ID、素材 ID、页面 ID 和操作 ID 为 UUID。坐标是页面像素；局部重绘区域为原图像素。更新仅包含想改动的字段；裁切 parentId=null 表示解除。

目录动作：`layer.add` 可创建 `kind=group`；`folderId` 表示同页文件夹，省略或 null 为页面根目录。`layer.move {id,targetId,placement}` 的 placement 为 above/below/inside（按前台显示顺序），inside 只能指向文件夹，targetId=null/inside 表示移到根目录最上方。移动文件夹带整个子树；保留画稿坐标与 parentId。`layer.order` 在同级排序。`layer.ungroup {id}` 解除分组并保留内容；`layer.remove` 删除文件夹包含后代，支持撤销。文件夹锁定/显隐向子层传递，不能通过子层动作绕开祖先锁定。layer.update 不接受 folderId，目录变更必须通过 layer.move。

协作流程：先 get_context 核实宿主 → view_image / view_workspace 亲自看图 → propose 展示与观察相符的具体方案 → 在用户任务授权内 adopt → 看执行结果并按新 revision 继续。使用合适延迟让用户能看清操作。不得使用脚本固定回答代替观察。

editing=true 时外部写入拒绝；busy=true 时等当前操作结束。陈旧 revision 拒绝，不能覆盖用户草稿。操作去重有限容量且属于当前打开工程，未知结果先查询、核对状态，不自动重试。导入和导出若连接断开同样先检查实际素材/文件。

referenceIds 只表示 Agent 上下文与素材来源；当前 NovelPrompt 生图 API 不传这些图片。绑定参考后生成必须 acknowledgeTextOnly=true，并明确这不是图像参考控制。sourceAssetId 表示本项目实际生成过的原图；局部重绘会向现有供应商传原图和矩形遮罩。所有生成候选先入库，不自动覆盖画稿。

`isError` 表示工具失败，不能据此假定远端生成未执行。生成 unknown 保留原操作编号；恢复优先读取已落盘回执，否则查询 NovelPrompt get_operation。不能自动恢复的记录保留查询结果供人工核对。

跨页粘贴：`layer.paste {sourceProjectId,layers,selectedId}` 将同一工程的一个完整复制快照原子插入当前页，形成一次撤销。layers 中每个图层使用新 UUID，内部 folderId/parentId 指向对应新 UUID；selectedId 必须属于本次插入。引用素材必须存在、目标目录不能锁定、仍受 500 图层上限和全工程编号唯一性约束。复用旧编号会被拒绝。人工的复制缓冲区是 renderer 的临时快照，不写入工程；Agent 从上下文捕获图层后也通过同一 layer.paste 动作提交，预检、采纳与撤销使用同一领域入口。复制文件夹包含完整子树；复制格框包含裁切到它的内容；单独复制裁切内容需一并复制隐藏的格框参照。`shared/layer-copy.ts` 提供统一快照与编号重映射逻辑。


### 视图与前台操作

- `chiyo_set_view`：tool 为 select/hand/panel/knife/nodes/pen/white；leftTab 为 assets/layers；rightTab 为 properties/generation/agent；zoom 为 0.05–4；fit、showGuides 为布尔值。只修改当前 Vue 视图，不产生撤销或脏标记。
- `chiyo_save_project {expected_revision,path?}`：省略 path 保存当前文件，新工程必须给出绝对 .chiyo 路径。不覆盖其他已有文件。共用 ProjectStore.save。
- `chiyo_close_window {expected_revision}`：仅在已保存、非 busy/editing 时正常关闭；延迟关闭前再次检查，不强制退出。
- `chiyo_canvas_drag {from,to,expected_revision,operation_id,shift?,step_delay_ms?}`：from/to 为页面像素坐标。先选择工具和对象、适合窗口，再按可见几何发起拖动。主进程发送真实 Electron 鼠标事件，经过现有 Vue 指针处理器和业务提交；16 步，默认每步 40 ms。可用于切格、节点、画笔或移动。超出可见画布拒绝。回执包括最终 revision 和可选 error；同一实例保留最近 128 个编号防止重复拖动。未知结果先读取上下文和活动记录，不能自动重试。重启后去重记录不保留。

### 分格与气泡几何

`panel.split {id,newPanelId,from,to,gap,childIds}`：切线采用页面像素坐标，格间距 gap 为 0–100 px，支持旋转格框。newPanelId 是新格框 UUID；childIds 为原裁切内容 ID 到新 UUID 的完整映射。保持原画稿坐标与素材引用，复制裁切内容到第二个格框；一次提交与撤销。锁定格框或裁切内容、缺失映射、切线不相交、退化多边形均拒绝。带裁切的文件夹暂不切分。新形状保存为 shape=polygon、vertices 为 3–32 个归一化顶点；限定凸多边形，节点拖动不得交叉。

气泡 `balloonStyle` 为 oval/organic/thought/shout/whisper/caption；`outline` 为八个归一化轮廓节点；`tails` 最多四条，每条包含归一化 tip、bend 和 width；`lobes` 最多三个，包含归一化 x/y/width/height 与独立 text。可通过 layer.update 编辑，人工控件与 Agent 共用同一动作。画布节点工具 N 编辑轮廓、尾尖、弯曲点和连体位置，K 拖动切格，Shift 限制水平/垂直切线。

`textPadding` 是像素边距；`autoFit` 默认启用，字号下限 8 px。超出空间时保留完整原文，前台提示，导出按气泡轮廓裁切。字体使用当前系统 Microsoft YaHei/sans-serif。旧文件缺少新字段时继续使用旧版气泡与文字渲染，不自动迁移。
