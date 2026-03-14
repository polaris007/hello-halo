## ADDED Requirements

### Requirement: 获取文件系统根路径

系统 SHALL 提供 API 返回服务端可用的文件系统根路径列表。

#### Scenario: Windows 系统返回盘符列表
- **WHEN** 服务端运行在 Windows 上，请求 `GET /api/v1/filesystem/roots`
- **THEN** 系统返回可用的磁盘盘符列表（如 `["C:\\", "D:\\", "E:\\"]`），每个条目包含 `path` 和 `name` 字段

#### Scenario: Linux/Mac 系统返回根目录
- **WHEN** 服务端运行在 Linux 或 Mac 上，请求 `GET /api/v1/filesystem/roots`
- **THEN** 系统返回 `[{ "path": "/", "name": "/" }]`

#### Scenario: 同时返回用户主目录
- **WHEN** 请求 `GET /api/v1/filesystem/roots`
- **THEN** 系统在根路径列表中额外包含当前运行用户的主目录（如 `{ "path": "/home/user", "name": "Home" }`），方便快速导航

#### Scenario: 需要认证
- **WHEN** 未认证用户请求 `GET /api/v1/filesystem/roots`
- **THEN** 系统返回 401 Unauthorized

### Requirement: 浏览服务端目录

系统 SHALL 提供 API 列出指定路径下的子目录。

#### Scenario: 列出子目录
- **WHEN** 请求 `GET /api/v1/filesystem/browse?path=/home/user/projects`
- **THEN** 系统返回该路径下所有子目录的列表，每个条目包含 `name`（目录名）和 `path`（完整路径）字段，按名称字母序排列

#### Scenario: 只返回目录不返回文件
- **WHEN** 请求浏览某路径
- **THEN** 系统只返回目录类型的条目，不返回文件

#### Scenario: 隐藏目录过滤
- **WHEN** 请求浏览某路径且未指定 `showHidden=true`
- **THEN** 系统不返回以 `.` 开头的隐藏目录

#### Scenario: 显示隐藏目录
- **WHEN** 请求浏览某路径且指定 `showHidden=true`
- **THEN** 系统返回包括以 `.` 开头的隐藏目录在内的所有子目录

#### Scenario: 路径不存在
- **WHEN** 请求浏览不存在的路径
- **THEN** 系统返回 400 错误，错误码为 `PATH_NOT_FOUND`

#### Scenario: 路径无读取权限
- **WHEN** 请求浏览当前用户无读取权限的路径
- **THEN** 系统返回 403 错误，错误码为 `PERMISSION_DENIED`

#### Scenario: 路径不是目录
- **WHEN** 请求浏览的路径指向一个文件而非目录
- **THEN** 系统返回 400 错误，错误码为 `NOT_A_DIRECTORY`

#### Scenario: 大目录限制
- **WHEN** 目录下的子目录数量超过 500
- **THEN** 系统只返回前 500 个子目录，并在响应中设置 `truncated: true`

#### Scenario: 需要认证
- **WHEN** 未认证用户请求浏览目录
- **THEN** 系统返回 401 Unauthorized

### Requirement: 前端文件夹选择器

系统 SHALL 在 Web 模式下提供可视化的文件夹选择器组件。

#### Scenario: 打开选择器
- **WHEN** 用户在创建空间对话框中点击"浏览"按钮
- **THEN** 系统弹出文件夹选择器对话框，显示服务端文件系统的目录结构

#### Scenario: 初始显示根路径
- **WHEN** 文件夹选择器打开
- **THEN** 系统显示文件系统根路径列表（Windows 显示盘符，Linux/Mac 显示根目录和用户主目录）

#### Scenario: 导航子目录
- **WHEN** 用户点击目录列表中的某个文件夹
- **THEN** 系统加载并显示该文件夹下的子目录列表，同时更新路径面包屑

#### Scenario: 返回上级目录
- **WHEN** 用户点击面包屑中的上级路径
- **THEN** 系统导航到对应的上级目录

#### Scenario: 选择文件夹
- **WHEN** 用户选中某个文件夹并点击"选择"按钮
- **THEN** 系统关闭选择器并将选中的完整路径返回给调用方

#### Scenario: 取消选择
- **WHEN** 用户点击"取消"按钮
- **THEN** 系统关闭选择器且不返回任何路径

#### Scenario: 加载状态
- **WHEN** 目录内容正在加载
- **THEN** 系统显示加载指示器

#### Scenario: 手动输入路径
- **WHEN** 用户在路径输入框中手动输入路径并按回车
- **THEN** 系统尝试加载该路径下的目录列表

#### Scenario: 切换隐藏目录显示
- **WHEN** 用户点击"显示隐藏文件夹"开关
- **THEN** 系统重新加载当前目录，包含或排除隐藏目录

#### Scenario: 新建目录
- **WHEN** 用户在浏览目录时点击"新建文件夹"按钮，输入文件夹名称并确认
- **THEN** 系统在当前目录下创建新文件夹，创建成功后刷新目录列表并自动选中新建的文件夹

#### Scenario: 新建目录名称冲突
- **WHEN** 用户输入的新建文件夹名称与当前目录下已有文件夹同名
- **THEN** 系统显示错误提示"文件夹已存在"，不创建目录

#### Scenario: 新建目录权限不足
- **WHEN** 用户在无写入权限的目录下尝试新建文件夹
- **THEN** 系统显示错误提示"没有写入权限"

### Requirement: 创建空间支持自定义路径

系统 SHALL 在 Web 模式下创建空间时支持指定服务端自定义路径作为工作目录。

#### Scenario: 使用自定义路径创建空间（路径已存在）
- **WHEN** 用户创建空间时指定了 `customPath` 且该路径在服务端已存在
- **THEN** 系统验证路径可读后创建空间，将 `customPath` 记录为空间的工作目录

#### Scenario: 自定义路径不存在时自动创建
- **WHEN** 用户创建空间时指定的 `customPath` 在服务端不存在
- **THEN** 系统尝试自动创建该目录（包括中间目录），创建成功后将其记录为空间的工作目录

#### Scenario: 自定义路径自动创建失败
- **WHEN** 用户创建空间时指定的 `customPath` 不存在且自动创建失败（例如父目录不可写）
- **THEN** 系统返回 400 错误，错误码为 `PATH_CREATE_FAILED`，包含失败原因

#### Scenario: 不使用自定义路径创建空间
- **WHEN** 用户创建空间时未指定 `customPath`
- **THEN** 系统使用默认路径创建空间（行为不变）

#### Scenario: 自定义路径名称建议
- **WHEN** 用户选择了自定义路径
- **THEN** 前端自动提取目录名作为空间名称的建议值（如路径 `/home/user/my-project` 建议名称为 `my-project`）

### Requirement: 选择后路径可编辑

系统 SHALL 允许用户在选择文件夹后手动编辑路径，或直接输入完整路径而不使用选择器。

#### Scenario: 选择后手动编辑路径
- **WHEN** 用户通过文件夹选择器选择了一个路径后
- **THEN** 创建空间对话框中显示该路径的文本输入框，用户可以直接修改路径内容

#### Scenario: 直接输入完整路径
- **WHEN** 用户在创建空间对话框中选择"自定义文件夹"选项后
- **THEN** 用户可以直接在路径输入框中输入完整路径，无需打开文件夹选择器

#### Scenario: 手动输入的路径不存在
- **WHEN** 用户手动输入了一个不存在的路径并创建空间
- **THEN** 系统自动创建该目录并正常创建空间（与"自定义路径不存在时自动创建"场景一致）

#### Scenario: 路径输入与选择器联动
- **WHEN** 用户在路径输入框中手动修改了路径
- **THEN** 系统使用修改后的路径作为 `customPath` 参数，而非选择器之前选择的路径

### Requirement: 服务端创建目录

系统 SHALL 提供 API 在服务端创建目录。

#### Scenario: 成功创建目录
- **WHEN** 请求 `POST /api/v1/filesystem/mkdir` 并指定 `path` 参数
- **THEN** 系统在服务端创建该目录（包括必要的中间目录），返回创建后的完整路径

#### Scenario: 目录已存在
- **WHEN** 请求创建的目录路径已存在
- **THEN** 系统返回 400 错误，错误码为 `DIR_ALREADY_EXISTS`

#### Scenario: 父目录无写入权限
- **WHEN** 请求创建目录但父目录无写入权限
- **THEN** 系统返回 403 错误，错误码为 `PERMISSION_DENIED`

#### Scenario: 需要认证
- **WHEN** 未认证用户请求创建目录
- **THEN** 系统返回 401 Unauthorized
