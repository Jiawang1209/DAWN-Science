/**
 * 坞的「产物」格（spec 2026-08-26-产物 §5）：本会话生成了什么，实时列出来，点一个能看。
 * 只有清单与预览两个视图；版本 / 来源 / 批注在下一轮。
 */
import { useEffect, useRef, useState } from "react"
import type { Artifact } from "../protocol/index.js"
import type { ArtifactList } from "./state/catalog.js"
import { Button, EmptyState, Loader } from "./primitives.js"
import { FilePreview, type FileContent } from "./files.js"
import { t, tf } from "./i18n/index.js"

export function ArtifactsPanel({
  data,
  readFile,
  onOpenInFiles,
  onDownload,
  onOpenExternally,
  onInsertReference,
  focus,
  onReload,
}: {
  data: ArtifactList | undefined
  readFile: (path: string) => Promise<FileContent>
  onOpenInFiles: (path: string) => void
  /**
   * 下载 = 远端拉到本机，本地文件没有这一说（与文件格同一契约）。
   * 缺省时不画下载：清单行不给那颗 ⤓，预览头也不转给 `FilePreview`。
   */
  onDownload?: ((path: string) => void) | undefined
  onOpenExternally: (path: string) => void
  onInsertReference?: ((path: string) => void) | undefined
  /**
   * 外面（产物条）点了某个产物：直接进它的预览。
   * `nonce` 每次点击都要变——同一个 path 从「回到清单」再点回来也得能重新打开，
   * 光看 `path` 没变不会触发（effect 只挂在 `nonce` 上）。
   */
  focus?: { path: string; nonce: number } | undefined
  /** 清单取失败时「重试」按这个；缺省就不给那颗 */
  onReload?: (() => void) | undefined
}) {
  const [看的, 设看的] = useState<string | undefined>(undefined)
  const [内容, 设内容] = useState<FileContent | undefined>(undefined)
  const [读错, 设读错] = useState<string | undefined>(undefined)
  const [重试次数, 设重试次数] = useState(0)

  /**
   * `readFile` 常常是父组件每次渲染新建的内联函数（`(p) => client.readFile(p)`）。
   * 挂进下面那个 effect 的依赖数组会导致它在每次父组件渲染时都被判定为「变了」，
   * 于是重新发起一次读取——用 ref 存住最新的一份，effect 只在真正该重跑时才跑。
   */
  const readFileRef = useRef(readFile)
  useEffect(() => {
    readFileRef.current = readFile
  })

  useEffect(() => {
    if (focus) 设看的(focus.path)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只认 nonce：同一个 path 再点一次也要能重新打开
  }, [focus?.nonce])

  useEffect(() => {
    if (!看的) return
    let 活 = true
    设内容(undefined)
    设读错(undefined)
    readFileRef
      .current(看的)
      .then((c) => {
        if (活) 设内容(c)
      })
      .catch((e: unknown) => {
        if (活) 设读错(e instanceof Error ? e.message : String(e))
      })
    return () => {
      // 读到一半用户已经点了「回到清单」或换看别的文件：迟到的内容/错误不许再冒出来
      活 = false
    }
    // 重试次数只用来强制重跑这个 effect——同一个 看的 也要能再读一遍
  }, [看的, 重试次数])

  if (!data) return <Loader label={t("正在取产物清单")} />
  // **取失败要出声**（规格 7.5）：与「还在取」分开，否则转圈转到天荒地老
  if (data.error) {
    return (
      <EmptyState
        title={t("取不到产物清单")}
        description={data.error}
        {...(onReload ? { action: <Button size="sm" onClick={onReload}>{t("重试")}</Button> } : {})}
      />
    )
  }

  if (看的) {
    return (
      <div className="artifacts-pane">
        <header className="artifacts-head">
          <Button variant="ghost" size="sm" onClick={() => 设看的(undefined)}>
            {t("回到清单")}
          </Button>
          <span className="name">{看的}</span>
          <Button variant="ghost" size="sm" onClick={() => onOpenInFiles(看的)}>
            {t("在文件里定位")}
          </Button>
        </header>
        {读错 ? (
          <EmptyState
            title={t("读不到这个文件")}
            description={读错}
            action={
              <Button size="sm" onClick={() => 设重试次数((n) => n + 1)}>
                {t("重试")}
              </Button>
            }
          />
        ) : (
          <FilePreview
            path={看的}
            content={内容}
            onOpenExternally={onOpenExternally}
            {...(onDownload ? { onDownload } : {})}
          />
        )}
      </div>
    )
  }

  if (data.artifacts.length === 0 && data.unknown.length === 0) {
    return <EmptyState title={t("这段会话还没有生成文件")} description={t("agent 新建的文件会实时出现在这里。")} />
  }

  const 组 = new Map<string, Artifact[]>()
  for (const a of data.artifacts) {
    const i = a.path.lastIndexOf("/")
    const dir = i < 0 ? "" : a.path.slice(0, i + 1)
    组.set(dir, [...(组.get(dir) ?? []), a])
  }

  return (
    <div className="artifacts-pane">
      {data.unknown.length > 0 ? <p className="caveat">{tf("另有 {0} 次运行产出未知", data.unknown.length)}</p> : null}
      {[...组.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dir, list]) => (
          <section key={dir || "."} className="artifacts-group">
            <h4 className="artifacts-group-title">
              <span>{dir || t("（工作区根）")}</span>
              <span className="count">{list.length}</span>
            </h4>
            <ul className="artifacts-list">
              {list.map((a) => (
                <li key={a.path} className={`artifact-row${a.exists === false ? " gone" : ""}`}>
                  <Button
                    variant="ghost"
                    size="inline"
                    className="artifact-open"
                    aria-label={a.path}
                    disabled={a.exists === false}
                    onClick={() => 设看的(a.path)}
                  >
                    <span className="name">{a.path.slice(dir.length)}</span>
                    <span className="kind-tag">{a.kind.toUpperCase()}</span>
                    {a.exists === false ? <span className="caveat">{t("已不存在")}</span> : null}
                  </Button>
                  <span className="artifact-actions">
                    {onDownload ? (
                      <Button
                        variant="ghost"
                        size="inline"
                        aria-label={tf("下载 {0}", a.path)}
                        disabled={a.exists === false}
                        onClick={() => onDownload(a.path)}
                      >
                        ⤓
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="inline" aria-label={tf("在文件里定位 {0}", a.path)} onClick={() => onOpenInFiles(a.path)}>
                      ⌖
                    </Button>
                    {onInsertReference ? (
                      <Button
                        variant="ghost"
                        size="inline"
                        aria-label={tf("把 {0} 插成引用", a.path)}
                        onClick={() => onInsertReference(a.path)}
                      >
                        @
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}
