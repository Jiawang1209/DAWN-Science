import { useEffect, useRef, useState } from "react"
import type { WorkbenchClient } from "./client.js"
import type {
  ArtifactObservation,
  RetainedResult,
} from "../protocol/artifact-history.js"
import { Button, Loader } from "./primitives.js"
import { FilePreview, type FileContent } from "./files.js"
import { t, tf } from "./i18n/index.js"
import {
  ArtifactDisclosure,
  ArtifactSourceDetails,
  artifactSourceSummary,
  artifactTime,
  type ArtifactSource,
} from "./artifact-source.js"

type Props = {
  sessionId: string
  client: WorkbenchClient
  paths: string[]
  path?: string | undefined
  readOnly?: boolean | undefined
  onClose: () => void
  onUseForDelivery?: ((group: RetainedResult) => void) | undefined
}
type History = {
  supported: boolean
  reason?: string
  observations: ArtifactObservation[]
}
type Retained = {
  supported: boolean
  reason?: string
  results: RetainedResult[]
  limits?: { fileBytes: number; groupBytes: number; projectBytes: number }
}
const output = (o: ArtifactObservation) =>
  ["write", "changed", "late_capture"].includes(o.relation)
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function ArtifactHistoryPanel(p: Props) {
  return p.path ? (
    <ResultControls key={`${p.sessionId}:${p.path}`} {...p} path={p.path} />
  ) : (
    <RetainedHistory key={p.sessionId} {...p} />
  )
}
function ResultControls(p: Props & { path: string }) {
  const [history, setHistory] = useState<History>(),
    [retained, setRetained] = useState<Retained>(),
    [source, setSource] = useState<ArtifactSource>(),
    [selected, setSelected] = useState<string>(),
    [error, setError] = useState<string>(),
    [notice, setNotice] = useState<string>(),
    [currentState, setCurrentState] = useState<string>(),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState<string>(),
    [name, setName] = useState(""),
    [note, setNote] = useState(""),
    [picked, setPicked] = useState([p.path]),
    [historyEnd, setHistoryEnd] = useState(false)
  const epoch = useRef(0),
    pending = useRef<{ id: string; cancelled: boolean } | undefined>(undefined)
  useEffect(() => {
    const token = ++epoch.current
    setHistory(undefined)
    setRetained(undefined)
    setSource(undefined)
    setError(undefined)
    setNotice(undefined)
    setHistoryEnd(false)
    setCurrentState(undefined)
    void Promise.all([
      p.client.get<History>("getArtifactHistory", {
        sessionId: p.sessionId,
        path: p.path,
      }),
      p.client.get<Retained>("listRetainedResults", { sessionId: p.sessionId }),
    ])
      .then(async ([h, r]) => {
        const latest = h.observations.find(output)
        let checked: string | undefined
        if (
          h.supported &&
          latest?.sha256 &&
          r.results.some((g) =>
            g.members.some(
              (m) =>
                m.observation.id === latest.id && m.sha256 === latest.sha256,
            ),
          )
        ) {
          try {
            checked = (
              await p.client.get<{ state: string }>("checkArtifactCurrent", {
                sessionId: p.sessionId,
                observationId: latest.id,
              })
            ).state
          } catch (e) {
            if (token === epoch.current) setError(message(e))
            checked = "failed"
          }
        }
        if (token !== epoch.current) return
        setCurrentState(checked)
        setHistory(h)
        setRetained(r)
        setSelected(latest?.id)
      })
      .catch((e) => {
        if (token === epoch.current) setError(message(e))
      })
    return () => {
      epoch.current++
    }
  }, [p.sessionId, p.path, p.client, reload])
  useEffect(() => {
    let active = true
    const token = epoch.current
    if (!selected) {
      setSource(undefined)
      return
    }
    setSource(undefined)
    void p.client
      .get<ArtifactSource>("getArtifactSource", {
        sessionId: p.sessionId,
        observationId: selected,
      })
      .then((r) => {
        if (active && token === epoch.current) setSource(r)
      })
      .catch((e) => {
        if (active && token === epoch.current) setError(message(e))
      })
    return () => {
      active = false
    }
  }, [p.sessionId, p.client, selected, reload])
  const observation = history?.observations.find((o) => o.id === selected),
    latest = history?.observations.find(output)
  const alreadySaved = Boolean(
    latest &&
      currentState === "matched" &&
      retained?.results.some((g) =>
        g.members.some(
          (m) => m.observation.id === latest.id && m.sha256 === latest.sha256,
        ),
      ),
  )
  const reason = history?.reason ?? retained?.reason
  const ready = Boolean(
    history && retained && history.supported && retained.supported,
  )
  const save = async (group = false, captureCurrent = false) => {
    if (pending.current || !ready || p.readOnly) return
    const token = epoch.current,
      id = crypto.randomUUID(),
      request = { id, cancelled: false }
    pending.current = request
    setRequestId(id)
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const paths = group ? picked : [p.path]
      if (!paths.length) throw Error(t("请先选择要保留的结果"))
      const observations = await Promise.all(
        paths.map(async (path) =>
          path === p.path
            ? latest
            : (
                await p.client.get<History>("getArtifactHistory", {
                  sessionId: p.sessionId,
                  path,
                })
              ).observations.find(output),
        ),
      )
      if (token !== epoch.current || request.cancelled) return
      const autoName = `${p.path.split("/").pop()} · ${artifactTime(new Date().toISOString())}`
      if (
        captureCurrent ||
        (paths.length === 1 &&
          (currentState === "changed" || !observations[0]?.sha256))
      ) {
        await p.client.get("captureAndRetainCurrent", {
          sessionId: p.sessionId,
          path: paths[0],
          requestId: id,
          name: group && name.trim() ? name.trim() : autoName,
          note: group ? note : "",
        })
      } else {
        if (observations.some((o) => !o?.sha256))
          throw Error(t("部分文件没有完整哈希，请分别留存当前内容"))
        await p.client.get("retainArtifactResults", {
          sessionId: p.sessionId,
          requestId: id,
          name: group && name.trim() ? name.trim() : autoName,
          note: group ? note : "",
          members: observations.map((o) => ({
            observationId: o!.id,
            sha256: o!.sha256,
          })),
        })
      }
      if (token === epoch.current) setReload((n) => n + 1)
    } catch (e) {
      if (token === epoch.current) setError(message(e))
    } finally {
      if (pending.current === request) pending.current = undefined
      if (token === epoch.current) {
        setBusy(false)
        setRequestId(undefined)
      }
    }
  }
  const cancel = async () => {
    if (!pending.current) return
    pending.current.cancelled = true
    const token = epoch.current
    try {
      await p.client.get("cancelArtifactRetention", {
        sessionId: p.sessionId,
        requestId: pending.current.id,
      })
    } catch (e) {
      if (token === epoch.current) setError(message(e))
    }
  }
  return (
    <section
      className="artifact-result-controls"
      aria-label={t("结果保留与来源")}
    >
      <div className="artifact-result-actions">
        <p className="hint artifact-source-summary">
          {reason ??
            (currentState === "changed"
              ? t("文件已更新，生成过程未记录")
              : history?.observations.length
                ? artifactSourceSummary(source)
                : history
                  ? t("生成过程未记录，保留时只保存当前文件")
                  : t("正在读取来源记录"))}
        </p>
        {!p.readOnly && (!history || !reason) ? (
          <Button
            variant="primary"
            size="sm"
            aria-label={t("保留当前结果")}
            disabled={!ready || busy || alreadySaved}
            onClick={() => void save()}
          >
            {busy ? t("正在保留…") : alreadySaved ? t("已保留") : t("保留")}
          </Button>
        ) : null}
        {requestId ? (
          <Button variant="ghost" size="sm" onClick={() => void cancel()}>
            {t("中止留存")}
          </Button>
        ) : null}
      </div>
      {alreadySaved ? (
        <p role="status" className="hint">
          {t("副本已保存，可在历史中打开")}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="field-error">
          {error}
          {error.includes("当前文件已变化") ? (
            <>
              <p>{t("文件已更新，可另存此刻内容，原记录不变")}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void save(false, true)}
              >
                {t("保留更新内容")}
              </Button>
            </>
          ) : null}
          <Button
            variant="text"
            size="xs"
            disabled={busy}
            onClick={() => setReload((n) => n + 1)}
          >
            {t("刷新记录")}
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="hint">
          {notice}
        </p>
      ) : null}
      <div className="artifact-result-details">
        <ArtifactDisclosure
          label={t("详细来源")}
          onOpenChange={(open) => {
            if (!open) setSelected(latest?.id)
          }}
        >
          {(history?.observations.filter(output).length ?? 0) > 0 ? (
            <label>
              {t("来源记录")}
              <select
                className="control"
                aria-label={t("来源记录")}
                value={selected ?? ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {history!.observations.filter(output).map((o) => (
                  <option key={o.id} value={o.id}>
                    {artifactTime(o.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!historyEnd && (history?.observations.length ?? 0) >= 50 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                const token = epoch.current
                void p.client
                  .get<History>("getArtifactHistory", {
                    sessionId: p.sessionId,
                    path: p.path,
                    offset: history?.observations.length ?? 0,
                  })
                  .then((h) => {
                    if (token !== epoch.current) return
                    setHistory((old) =>
                      old
                        ? {
                            ...old,
                            observations: [
                              ...old.observations,
                              ...h.observations,
                            ],
                          }
                        : h,
                    )
                    setHistoryEnd(h.observations.length < 50)
                  })
                  .catch((e) => {
                    if (token === epoch.current) setError(message(e))
                  })
              }}
            >
              {t("较早来源")}
            </Button>
          ) : null}
          <ArtifactSourceDetails source={source} />
          {observation ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                const token = epoch.current
                void p.client
                  .get<{ note: string }>("checkArtifactCurrent", {
                    sessionId: p.sessionId,
                    observationId: observation.id,
                  })
                  .then((r) => {
                    if (token === epoch.current) setNotice(r.note)
                  })
                  .catch((e) => {
                    if (token === epoch.current) setError(message(e))
                  })
              }}
            >
              {t("核对当前文件")}
            </Button>
          ) : null}
        </ArtifactDisclosure>
        {!p.readOnly && ready ? (
          <ArtifactDisclosure label={t("更多保留选项")}>
            <div className="artifact-retain-form">
              <label>
                {t("留存名称")}
                <input
                  className="control"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
              </label>
              <label>
                {t("留存备注")}
                <textarea
                  className="control"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={4000}
                  rows={2}
                />
              </label>
              <span className="hint">{t("同时保留其他结果")}</span>
              {[...new Set([p.path, ...p.paths])].slice(0, 50).map((path) => (
                <label className="artifact-retain-choice" key={path}>
                  <input
                    type="checkbox"
                    checked={picked.includes(path)}
                    onChange={(e) =>
                      setPicked((old) =>
                        e.target.checked
                          ? [...old, path]
                          : old.filter((x) => x !== path),
                      )
                    }
                  />
                  {path}
                </label>
              ))}
              <p className="hint">
                {t("仅保存选定结果及来源记录，原始输入数据不自动复制")}
                {retained?.limits
                  ? tf(
                      "；上限：单文件 {0} MiB，每组 {1} MiB，每项目 {2} MiB",
                      Math.floor(retained.limits.fileBytes / 1048576),
                      Math.floor(retained.limits.groupBytes / 1048576),
                      Math.floor(retained.limits.projectBytes / 1048576),
                    )
                  : ""}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !picked.length}
                onClick={() => void save(true)}
              >
                {t("组合留存")}
              </Button>
            </div>
          </ArtifactDisclosure>
        ) : null}
      </div>
    </section>
  )
}
function RetainedHistory(p: Props) {
  const [groups, setGroups] = useState<RetainedResult[]>(),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>(),
    [confirm, setConfirm] = useState<string>(),
    [preview, setPreview] = useState<{
      group: RetainedResult
      memberId: string
      path: string
      content: FileContent
    }>()
  const epoch = useRef(0),
    selection = useRef(0)
  useEffect(() => {
    const token = ++epoch.current
    setGroups(undefined)
    setPreview(undefined)
    setError(undefined)
    setBusy(false)
    setConfirm(undefined)
    void p.client
      .get<Retained>("listRetainedResults", { sessionId: p.sessionId })
      .then((r) => {
        if (token === epoch.current) {
          setGroups(r.results)
          setMore(r.results.length === 50)
          if (!r.supported) setError(r.reason)
        }
      })
      .catch((e) => {
        if (token === epoch.current) setError(message(e))
      })
    return () => {
      epoch.current++
      selection.current++
    }
  }, [p.sessionId, p.client])
  const open = async (group: RetainedResult, memberId: string) => {
    const token = epoch.current,
      choice = ++selection.current
    setError(undefined)
    setPreview(undefined)
    setBusy(true)
    try {
      const r = await p.client.get<{ path: string; content: FileContent }>(
        "readRetainedArtifact",
        { sessionId: p.sessionId, retainedId: group.id, memberId },
      )
      if (token === epoch.current && choice === selection.current)
        setPreview({ group, memberId, ...r })
    } catch (e) {
      if (token === epoch.current && choice === selection.current)
        setError(message(e))
    } finally {
      if (token === epoch.current && choice === selection.current)
        setBusy(false)
    }
  }
  const remove = async (group: RetainedResult) => {
    const token = epoch.current
    setBusy(true)
    setError(undefined)
    try {
      await p.client.get("deleteRetainedResult", {
        sessionId: p.sessionId,
        retainedId: group.id,
        confirmed: true,
      })
      if (token === epoch.current) {
        setGroups((old) => old?.filter((g) => g.id !== group.id))
        setConfirm(undefined)
      }
    } catch (e) {
      if (token === epoch.current) setError(message(e))
    } finally {
      if (token === epoch.current) setBusy(false)
    }
  }
  const member = preview?.group.members.find((m) => m.id === preview.memberId)
  return (
    <section className="artifact-history-panel" aria-label={t("已保留版本")}>
      <header className="artifact-evidence-toolbar">
        <Button variant="ghost" size="sm" onClick={p.onClose}>
          {t("回到产物")}
        </Button>
        <strong>{t("已保留版本")}</strong>
      </header>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
      {preview && member ? (
        <div className="artifact-retained-preview">
          <header className="artifact-evidence-toolbar">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                selection.current++
                setPreview(undefined)
                setError(undefined)
              }}
            >
              {t("版本列表")}
            </Button>
            <strong>{preview.group.name}</strong>
          </header>
          <p className="hint">
            {t("正在查看留存副本，工作区当前文件可能不同")}
          </p>
          <FilePreview
            path={preview.path}
            content={preview.content}
            onClosePreview={() => setPreview(undefined)}
          />
          <ArtifactDisclosure label={t("详细来源")}>
            <ArtifactSourceDetails
              source={{
                observation: member.observation,
                execution: member.execution,
                inputs: member.inputs,
              }}
            />
          </ArtifactDisclosure>
        </div>
      ) : (
        <>
          {!groups && !error ? <Loader label={t("正在读取来源记录")} /> : null}
          {groups?.length === 0 ? (
            <p className="hint">{t("还没有保留的版本，打开结果后点击保留")}</p>
          ) : null}
          <div className="artifact-retained-groups">
            {groups?.map((group) => (
              <article
                className="artifact-retained-group"
                key={group.id}
                aria-label={tf("留存版本 {0}", group.name)}
              >
                <div className="artifact-version-heading">
                  <strong>{group.name}</strong>
                  <time dateTime={group.createdAt}>
                    {artifactTime(group.createdAt)}
                  </time>
                </div>
                {group.note ? <p className="hint">{group.note}</p> : null}
                {group.members.map((m) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    key={m.id}
                    aria-label={tf("打开已保留文件 {0}", m.observation.path)}
                    disabled={busy}
                    onClick={() => void open(group, m.id)}
                  >
                    {m.observation.path.split("/").pop()}
                  </Button>
                ))}
                {!p.readOnly ? (
                  <ArtifactDisclosure label={t("版本操作")}>
                    {p.onUseForDelivery ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => p.onUseForDelivery?.(group)}
                      >
                        {t("从副本制作交付包")}
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setConfirm(group.id)}
                    >
                      {t("移除留存副本")}
                    </Button>
                    {confirm === group.id ? (
                      <div className="artifact-delete-confirm">
                        <p>{t("仅删除应用内留存副本，工作区原文件保留。")}</p>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          onClick={() => void remove(group)}
                        >
                          {t("确认移除副本")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setConfirm(undefined)}
                        >
                          {t("取消")}
                        </Button>
                      </div>
                    ) : null}
                  </ArtifactDisclosure>
                ) : null}
              </article>
            ))}
          </div>
          {more ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                const token = epoch.current
                setBusy(true)
                void p.client
                  .get<Retained>("listRetainedResults", {
                    sessionId: p.sessionId,
                    offset: groups?.length ?? 0,
                  })
                  .then((r) => {
                    if (token === epoch.current) {
                      setGroups((old) => [
                        ...(old ?? []),
                        ...r.results.filter(
                          (g) => !old?.some((o) => o.id === g.id),
                        ),
                      ])
                      setMore(r.results.length === 50)
                    }
                  })
                  .catch((e) => {
                    if (token === epoch.current) setError(message(e))
                  })
                  .finally(() => {
                    if (token === epoch.current) setBusy(false)
                  })
              }}
            >
              {t("往期留存")}
            </Button>
          ) : null}
          {busy ? <Loader label={t("正在读取已保留文件")} /> : null}
        </>
      )}
    </section>
  )
}
