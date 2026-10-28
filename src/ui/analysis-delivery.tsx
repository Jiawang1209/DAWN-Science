import { ArtifactHistoryPanel } from './artifact-history.js'
import { ProjectFilePicker } from './project-file-picker.js'
import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useStore } from "@nanostores/react";
import { ArtifactsPanel } from "./artifacts.js";
import { artifactEntries } from "./artifact-list.js";
import { Button, EmptyState, Loader } from "./primitives.js";
import {
  FilePreview,
  canExpandFilePreview,
  type FileContent,
} from "./files.js";
import { 类型图标 } from "./files.js";
import { 文件类按名字 } from "./file-kind.js";
import type { WorkbenchClient } from "./client.js";
import {
  DeliveryCreateSchema,
  DeliveryPlanSchema,
  type DeliveryRecord,
  type DeliveryPlan,
} from "../protocol/delivery.js";
import {
  $deliveryViews,
  beginDelivery,
  deliveryView,
  setDeliveryView,
} from "./state/delivery.js";
import { t, tf } from "./i18n/index.js";
type Props = ComponentProps<typeof ArtifactsPanel> & {
  sessionId: string;
  scopeKey: string;
  client: WorkbenchClient;
  readOnly?: boolean | undefined;
};
type Catalog = {
  supported: boolean;
  reason?: string;
  records: DeliveryRecord[];
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const deliveryStateLabel = (s: DeliveryRecord["state"]) =>
  ({
    generating: t("正在整理"),
    organized: t("已整理"),
    partial: t("已整理（有缺口）"),
    failed: t("整理失败"),
  })[s];
export const verificationLabel = (s: DeliveryRecord["verification"]["state"]) =>
  ({
    not_run: t("未运行验证"),
    awaiting_confirmation: t("待确认运行"),
    running: t("独立验证中"),
    passed: t("选定输出重跑通过"),
    partial: t("部分验证"),
    failed: t("运行验证失败"),
  })[s];
export function AnalysisDeliveryPanel(p: Props) {
  const [evidenceView,setEvidenceView]=useState<{path?:string}|undefined>()
  const [moreOpen,setMoreOpen]=useState(false)
  const [projectFilesOpen, setProjectFilesOpen] = useState(false)
  useEffect(()=>{setEvidenceView(undefined);setMoreOpen(false);setProjectFilesOpen(false)},[p.scopeKey])
  const views = useStore($deliveryViews),
    view = views.get(p.scopeKey) ?? deliveryView(p.scopeKey);
  const [catalog, setCatalog] = useState<Catalog>(),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  const [validationFooter, setValidationFooter] = useState<HTMLElement | null>(
    null,
  );
  const generation = useRef(0),
    identity = useRef(p.scopeKey);
  identity.current = p.scopeKey;
  const lifetime = useRef(0);
  const activeRequest = useRef<{ scope: string; token: number } | undefined>(
    undefined,
  );
  useEffect(() => {
    lifetime.current++;
    return () => {
      lifetime.current++;
    };
  }, [p.scopeKey]);
  const root = useRef<HTMLElement>(null),
    restore = useRef<string | undefined>(undefined);
  const update = (patch: Parameters<typeof setDeliveryView>[1]) =>
    setDeliveryView(p.scopeKey, patch);
  const current = catalog?.records.find((r) => r.id === view.recordId);
  useEffect(() => {
    setCatalog(undefined);
    setError(undefined);
    setBusy(false);
  }, [p.scopeKey]);
  const outstanding =
    Boolean(view.pendingId) ||
    catalog?.records.some(
      (r) => r.state === "generating" || r.verification.state === "running",
    );
  useEffect(() => {
    let live = true;
    const gen = ++generation.current;
    const load = async () => {
      try {
        const result = await p.client.get<Catalog>("listAnalysisDeliveries", {
          sessionId: p.sessionId,
        });
        if (live && gen === generation.current) {
          setCatalog(result);
          const pending = deliveryView(p.scopeKey).pendingId;
          if (pending) {
            const r = result.records.find((r) => r.id === pending);
            if (
              r &&
              r.state !== "generating" &&
              r.verification.state !== "running"
            )
              setDeliveryView(p.scopeKey, { pendingId: undefined });
            else if (
              !r &&
              !(
                activeRequest.current?.scope === p.scopeKey &&
                activeRequest.current?.token === lifetime.current
              )
            ) {
              setDeliveryView(p.scopeKey, {
                pendingId: undefined,
                page: "records",
              });
              setError(t("未找到本次交付记录，请查看已有记录或重新整理。"));
            }
          }
        }
      } catch (e) {
        if (live && gen === generation.current) setError(message(e));
      }
    };
    void load();
    const timer = outstanding
      ? setInterval(() => void load(), 1200)
      : undefined;
    return () => {
      live = false;
      generation.current++;
      if (timer) clearInterval(timer);
    };
  }, [p.scopeKey, p.sessionId, p.client, reload, outstanding]);
  useEffect(() => {
    if (p.focus) update({ page: "files", file: undefined });
  }, [p.focus?.nonce]);
  useLayoutEffect(() => {
    const body = root.current?.querySelector(".delivery-body");
    if (body) body.scrollTop = 0;
  }, [view.page, view.recordId]);
  useLayoutEffect(() => {
    if (!view.file && restore.current) {
      const buttons = root.current?.querySelectorAll<HTMLButtonElement>(
        "[data-delivery-file]",
      );
      [...(buttons ?? [])]
        .find((b) => b.dataset.deliveryFile === restore.current)
        ?.focus();
      restore.current = undefined;
    }
  }, [view.file]);
  const close = () => {
    restore.current = view.file;
    update({ file: undefined });
  };
  const invoke = async (action: () => Promise<DeliveryRecord>) => {
    const scope = p.scopeKey,
      token = lifetime.current;
    activeRequest.current = { scope, token };
    setBusy(true);
    setError(undefined);
    try {
      const record = await action();
      if (identity.current !== scope || token !== lifetime.current) return;
      setCatalog((c) => ({
        ...c,
        supported: c?.supported ?? true,
        records: [
          record,
          ...(c?.records ?? []).filter((r) => r.id !== record.id),
        ],
      }));
      update({
        page: "detail",
        recordId: record.id,
        pendingId: undefined,
        file: undefined,
      });
    } catch (e) {
      if (identity.current === scope && token === lifetime.current) {
        setError(message(e));
        update({ pendingId: undefined });
      }
    } finally {
      if (identity.current === scope && token === lifetime.current) {
        activeRequest.current = undefined;
        setBusy(false);
        setReload((n) => n + 1);
      }
    }
  };
  const start = () => {
    const request = {
      requestId: crypto.randomUUID(),
      name: view.name.trim(),
      paths: view.selected,
      references: view.references
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      mode: view.mode,
      ...(view.retained?.length?{retained:view.retained.filter(r=>view.selected.includes(r.path))}:{}),
    };
    const valid = DeliveryCreateSchema.safeParse(request);
    if (!valid.success) {
      setError(valid.error.issues.map((i) => i.message).join("；"));
      return;
    }
    update({
      page: "detail",
      recordId: request.requestId,
      pendingId: request.requestId,
    });
    void invoke(() =>
      p.client.get<DeliveryRecord>("createAnalysisDelivery", {
        sessionId: p.sessionId,
        ...request,
      }),
    );
  };
  const entries = artifactEntries(p.data),
    candidates = [
      ...new Set([
        ...entries.filter((a) => a.exists !== false).map((a) => a.path),
        ...view.candidates,
      ]),
    ];
  const allowed = Boolean(catalog?.supported) && !p.readOnly;
  const open = (path: string) => {
    restore.current = undefined;
    update({ file: path });
  };
  const recordFiles = (r: DeliveryRecord) =>
    [...r.files].sort(
      (a, b) =>
        [
          "interpretation",
          "readme",
          "script",
          "result",
          "manifest",
          "verification",
        ].indexOf(a.role) -
        [
          "interpretation",
          "readme",
          "script",
          "result",
          "manifest",
          "verification",
        ].indexOf(b.role),
    );
  if (view.file)
    return (
      <section
        ref={root}
        className="analysis-delivery delivery-preview"
        aria-label={t("交付文件预览")}
      >
        <header className="delivery-header">
          <Button variant="ghost" size="sm" onClick={close}>
            {t("交付详情")}
          </Button>
        </header>
        <DeliveryPreview
          path={view.file}
          readFile={p.readFile}
          onClose={close}
          onLocate={p.onOpenInFiles}
          onOpenExternally={p.onOpenExternally}
        />
      </section>
    );
  return (
    <section
      ref={root}
      className="analysis-delivery"
      aria-label={t("分析交付")}
    >
      <header className="delivery-header">
        {view.page === "files" ? (
          <>
            <strong>{t("结果")}</strong>
            <div className="artifact-page-actions">
              <Button variant="ghost" size="sm" aria-label={t("历史")} aria-pressed={Boolean(evidenceView)} onClick={()=>setEvidenceView({})}>{t("历史")}</Button>
              <details className="artifact-more-menu" open={moreOpen} onToggle={e=>setMoreOpen(e.currentTarget.open)}>
                <summary aria-label={t("产物操作菜单")}>{t("更多")}</summary>
                {moreOpen ? <div className="artifact-more-menu-body">
                  <Button variant="ghost" size="sm" disabled={!allowed||busy} onClick={()=>{setMoreOpen(false);setEvidenceView(undefined);beginDelivery(p.scopeKey);setError(undefined)}}>{t("整理交付")}</Button>
                  <Button variant="ghost" size="sm" onClick={()=>{setMoreOpen(false);update({page:"records"})}}>{tf("交付记录 · {0}",catalog?.records.length??0)}</Button>
                </div>:null}
              </details>
            </div>
          </>
        ) : view.page === "records" ? (
          <>
            <div>
              <strong>{t("本次分析产物")}</strong>
              <span className="hint">
                {t("查看结果，或整理成可复用的交付")}
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={!allowed || busy}
              onClick={() => {
                beginDelivery(p.scopeKey);
                setError(undefined);
              }}
            >
              {t("整理交付")}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                update({
                  page:
                    view.page === "options"
                      ? "select"
                      : view.page === "verify"
                        ? "detail"
                        : "files",
                  file: undefined,
                })
              }
            >
              {t("返回")}
            </Button>
            <strong>
              {view.page === "select"
                ? t("选择交付内容")
                : view.page === "options"
                  ? t("整理设置")
                  : view.page === "verify"
                    ? t("确认运行验证")
                    : (current?.name ?? t("正在整理"))}
            </strong>
          </>
        )}
      </header>
      {view.page === "records" ? (
        <nav className="delivery-tabs" aria-label={t("产物视图")}>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={false}
            onClick={() => update({ page: "files" })}
          >
            {t("文件清单")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={view.page === "records"}
            onClick={() => update({ page: "records" })}
          >
            {tf("交付记录 · {0}", catalog?.records.length ?? 0)}
          </Button>
        </nav>
      ) : null}
      {error ? (
        <div className="delivery-error" role="alert">
          {error}
          <Button
            variant="text"
            size="xs"
            onClick={() => setReload((n) => n + 1)}
          >
            {t("重试")}
          </Button>
        </div>
      ) : null}
      {catalog?.reason ? (
        <p className="hint delivery-notice">{catalog.reason}</p>
      ) : null}
      <div className="delivery-body">
        {view.page === "files" ? (
          <>
            {evidenceView ? <ArtifactHistoryPanel key={p.scopeKey} sessionId={p.sessionId} client={p.client} paths={artifactEntries(p.data).map(a=>a.path)} readOnly={p.readOnly} onClose={()=>setEvidenceView(undefined)} onUseForDelivery={group=>{beginDelivery(p.scopeKey,group.members.map(m=>m.observation.path));update({name:group.name,retained:group.members.map(m=>({path:m.observation.path,retainedId:group.id,memberId:m.id,sha256:m.sha256}))});setEvidenceView(undefined)}} /> : <ArtifactsPanel {...p} renderPreviewActions={path=><ArtifactHistoryPanel key={`${p.scopeKey}:${path}`} sessionId={p.sessionId} client={p.client} paths={artifactEntries(p.data).map(a=>a.path)} path={path} readOnly={p.readOnly} onClose={()=>{}}/>} />}
          </>
        ) : view.page === "select" ? (
          <>
            {!projectFilesOpen ? <><p className="hint">
              {t("只采用你选定的文件；同名候选和草稿不会自动认定为最终结果。")}
            </p>
            <Button variant="outline" size="sm" disabled={!allowed} onClick={() => setProjectFilesOpen(true)}>{t("从项目添加文件")}</Button></> : null}
            {projectFilesOpen ? <ProjectFilePicker key={p.scopeKey} sessionId={p.sessionId} client={p.client} selected={view.selected} onClose={() => setProjectFilesOpen(false)} onAdd={paths => {
              if (!allowed) return
              if (new Set([...view.selected, ...paths]).size > 60) { setError(t("每份交付最多选择 60 个文件")); return }
              update({ candidates: [...new Set([...view.candidates, ...paths])], selected: [...new Set([...view.selected, ...paths])] })
              setProjectFilesOpen(false)
            }} /> : null}
            {!projectFilesOpen ? <div
              className="delivery-selection"
              role="group"
              aria-label={t("交付文件选择")}
            >
              {candidates.map((path) => (
                <label key={path} className="delivery-choice-row">
                  <input
                    type="checkbox"
                    checked={view.selected.includes(path)}
                    disabled={projectFilesOpen || !allowed || (view.selected.length >= 60 && !view.selected.includes(path))}
                    onChange={(e) =>
                      update({
                        selected: e.target.checked
                          ? [...view.selected, path]
                          : view.selected.filter((x) => x !== path),
                      })
                    }
                  />
                  <类型图标 类={文件类按名字(path, "file")} />
                  <span>
                    <strong>{path.split("/").pop()}</strong>
                    <small>{path}</small>
                  </span>
                </label>
              ))}
            </div> : null}
            {!projectFilesOpen && !candidates.length ? (
              <EmptyState
                title={t("还没有可选择的产物")}
                description={t("可从项目添加已有脚本、图片、表格和说明。")}
              />
            ) : null}
          </>
        ) : view.page === "options" ? (
          <>
            <section className="delivery-box">
              <h3>{t("交付位置")}</h3>
              <label>
                {t("交付名称")}
                <input
                  className="control"
                  value={view.name}
                  maxLength={80}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder={t("例如：草地回归分析")}
                />
              </label>
              <p className="delivery-path">
                outputs/delivery/{view.name || t("本次名称")}/
              </p>
              <p className="hint">
                {t("新建独立目录；同名时另存，不覆盖原文件。")}
              </p>
              <p>{tf("已选 {0} 个文件", view.selected.length)}</p>
            </section>
            <section className="delivery-box">
              <h3>{t("整理方式")}</h3>
              <label className="delivery-radio">
                <input
                  type="radio"
                  name="delivery-mode"
                  checked={view.mode === "organize"}
                  onChange={() => update({ mode: "organize" })}
                />
                <span>
                  <strong>{t("仅整理")}</strong>
                  <small>
                    {t(
                      "读取已有结果，生成脚本、运行说明和结果解读；不运行分析。",
                    )}
                  </small>
                </span>
              </label>
              <label className="delivery-radio">
                <input
                  type="radio"
                  name="delivery-mode"
                  checked={view.mode === "validate"}
                  onChange={() => update({ mode: "validate" })}
                />
                <span>
                  <strong>{t("整理并验证")}</strong>
                  <small>
                    {t("先整理，再核对运行方案并启动独立进程；保留当前内核。")}
                  </small>
                </span>
              </label>
            </section>
            <section className="delivery-box">
              <h3>{t("输入引用（可选）")}</h3>
              <label>
                <span className="hint">
                  {t(
                    "每行一个工作区内相对路径；只读取必要证据，不复制原始输入。",
                  )}
                </span>
                <textarea
                  className="control"
                  rows={3}
                  value={view.references}
                  onChange={(e) => update({ references: e.target.value })}
                  placeholder="data/raw/observations.csv"
                />
              </label>
            </section>
            <p className="hint">
              {t(
                "交付包含 README、结果解读、选定结果与可整理的脚本。缺失依据会明确标注。",
              )}
            </p>
          </>
        ) : view.page === "records" ? (
          <>
            {!catalog && !error ? (
              <Loader label={t("正在整理")} />
            ) : catalog?.records.length ? (
              catalog.records.map((r) => (
                <Button
                  key={r.id}
                  variant="ghost"
                  size="card-compact"
                  className="delivery-record"
                  onClick={() => update({ page: "detail", recordId: r.id })}
                >
                  <strong>{r.name}</strong>
                  <span>
                    {deliveryStateLabel(r.state)} ·{" "}
                    {verificationLabel(r.verification.state)}
                  </span>
                  <small>{r.createdAt.replace("T", " ").slice(0, 16)}</small>
                </Button>
              ))
            ) : (
              <EmptyState
                title={t("还没有交付记录")}
                description={t("从文件清单选择结果，开始整理第一份交付。")}
              />
            )}
            <Button
              variant="text"
              size="sm"
              onClick={() => setReload((n) => n + 1)}
            >
              {t("刷新记录")}
            </Button>
          </>
        ) : view.page === "verify" && current ? (
          <DeliveryVerification
            key={current.id}
            record={current}
            footer={validationFooter}
            draft={
              view.verificationDraft?.recordId === current.id
                ? view.verificationDraft
                : undefined
            }
            onDraft={(draft) =>
              update({ verificationDraft: { ...draft, recordId: current.id } })
            }
            busy={busy}
            allowed={allowed}
            onPreview={open}
            onRun={(plan, tolerance) => {
              update({ pendingId: current.id });
              void invoke(() =>
                p.client.get<DeliveryRecord>("verifyAnalysisDelivery", {
                  sessionId: p.sessionId,
                  id: current.id,
                  plan,
                  tolerance,
                  outputsReviewed: true,
                }),
              );
            }}
          />
        ) : current ? (
          <>
            <section className="delivery-box delivery-status">
              <div>
                <span>{t("交付整理")}</span>
                <strong data-state={current.state}>
                  {deliveryStateLabel(current.state)}
                </strong>
              </div>
              <div>
                <span>{t("运行验证")}</span>
                <strong data-state={current.verification.state}>
                  {verificationLabel(current.verification.state)}
                </strong>
              </div>
              <p className="hint">{current.verification.note}</p>
              <small className="delivery-path">{current.directory}</small>
            </section>
            {current.error ? (
              <p role="alert" className="delivery-error">
                {current.error}
              </p>
            ) : null}
            <div className="delivery-read-first">
              {current.files.find((f) => f.role === "interpretation") ? (
                <Button
                  variant="primary"
                  size="sm"
                  data-delivery-file={
                    current.files.find((f) => f.role === "interpretation")!.path
                  }
                  onClick={() =>
                    open(
                      current.files.find((f) => f.role === "interpretation")!
                        .path,
                    )
                  }
                >
                  {t("阅读结果解读")}
                </Button>
              ) : null}
              {current.files.find((f) => f.role === "readme") ? (
                <Button
                  variant="outline"
                  size="sm"
                  data-delivery-file={
                    current.files.find((f) => f.role === "readme")!.path
                  }
                  onClick={() =>
                    open(current.files.find((f) => f.role === "readme")!.path)
                  }
                >
                  {t("查看运行说明")}
                </Button>
              ) : null}
            </div>
            {current.plan && current.state !== "generating" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !allowed || busy || current.verification.state === "running"
                }
                onClick={() => update({ page: "verify" })}
              >
                {current.verification.state === "not_run"
                  ? t("继续设置运行验证")
                  : current.verification.state === "awaiting_confirmation"
                    ? t("确认运行验证")
                    : t("查看或重跑验证")}
              </Button>
            ) : null}
            {current.gaps.length ? (
              <details className="delivery-box">
                <summary>{tf("未确认事项 · {0}", current.gaps.length)}</summary>
                <ul>
                  {current.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <section className="delivery-box">
              <h3>{t("交付文件")}</h3>
              <ul className="delivery-file-list">
                {recordFiles(current).map((f) => (
                  <li key={f.path}>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-delivery-file={f.path}
                      onClick={() => open(f.path)}
                    >
                      <类型图标 类={文件类按名字(f.path, "file")} />
                      <span>
                        <strong>{f.path.split("/").pop()}</strong>
                        <small>
                          {f.path.slice(current.directory.length + 1)}
                        </small>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
            {current.verification.checks?.length ? (
              <section className="delivery-box">
                <h3>{t("输出比较记录")}</h3>
                {current.verification.checks.map((c, i) => (
                  <div key={i} className="delivery-check">
                    <strong>{c.path}</strong>
                    <span>{c.note}</span>
                  </div>
                ))}
              </section>
            ) : null}
          </>
        ) : (
          <div className="delivery-wait">
            <Loader label={t("正在整理")} />
            <p>{t("正在生成交付文件，请稍候。")}</p>
          </div>
        )}
      </div>
      {view.page === "verify" && current ? (
        <footer
          ref={setValidationFooter}
          className="delivery-validation-controls"
        />
      ) : null}
      {view.page === "select" && !projectFilesOpen ? (
        <footer className="delivery-footer">
          <span>{tf("已选 {0} 个文件", view.selected.length)}</span>
          <Button
            variant="primary"
            size="sm"
            disabled={!view.selected.length || !allowed}
            onClick={() => update({ page: "options" })}
          >
            {t("下一步")}
          </Button>
        </footer>
      ) : view.page === "options" ? (
        <footer className="delivery-footer">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ page: "files" })}
          >
            {t("取消")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={
              !view.name.trim() || !view.selected.length || !allowed || busy
            }
            onClick={start}
          >
            {view.mode === "organize" ? t("开始整理") : t("整理并准备验证")}
          </Button>
        </footer>
      ) : null}
      {busy ||
      current?.state === "generating" ||
      current?.verification.state === "running" ? (
        <footer className="delivery-footer">
          <span className="hint">{t("处理中，记录会保留在当前会话")}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const id = view.pendingId ?? current?.id;
              if (id)
                void p.client
                  .get("cancelAnalysisDelivery", { sessionId: p.sessionId, id })
                  .then(() => setReload((n) => n + 1))
                  .catch((e) => setError(message(e)));
            }}
          >
            {t("停止")}
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
function DeliveryPreview(p: {
  path: string;
  readFile: Props["readFile"];
  onClose: () => void;
  onLocate: (path: string) => void;
  onOpenExternally: (path: string) => void;
}) {
  const [content, setContent] = useState<FileContent>(),
    [error, setError] = useState<string>(),
    [reading, setReading] = useState(false);
  useEffect(() => {
    let live = true;
    setContent(undefined);
    setError(undefined);
    void p.readFile(p.path).then(
      (c) => {
        if (live) setContent(c);
      },
      (e) => {
        if (live) setError(message(e));
      },
    );
    return () => {
      live = false;
    };
  }, [p.path, p.readFile]);
  return error ? (
    <EmptyState
      title={t("读不到这个文件")}
      description={error}
      action={
        <Button size="sm" onClick={p.onClose}>
          {t("交付详情")}
        </Button>
      }
    />
  ) : (
    <FilePreview
      path={p.path}
      content={content}
      readFile={p.readFile}
      onOpenFile={p.onLocate}
      onOpenExternally={p.onOpenExternally}
      onClosePreview={p.onClose}
      readingExpanded={reading && canExpandFilePreview(content)}
      onToggleReading={() => setReading((v) => !v)}
      navigation={{ onBack: p.onClose, onLocate: () => p.onLocate(p.path) }}
    />
  );
}
function DeliveryVerification(p: {
  footer: HTMLElement | null;
  draft?: { plan: string; tolerance: string } | undefined;
  onDraft: (draft: { plan: string; tolerance: string }) => void;
  record: DeliveryRecord;
  busy: boolean;
  allowed: boolean;
  onPreview: (path: string) => void;
  onRun: (plan: DeliveryPlan, tolerance: number) => void;
}) {
  const [plan, setPlan] = useState(
      p.draft?.plan ?? JSON.stringify(p.record.plan, null, 2),
    ),
    [reviewed, setReviewed] = useState(false),
    [tolerance, setTolerance] = useState(p.draft?.tolerance ?? "0.000000001");
  let parsed: DeliveryPlan | undefined, error: string | undefined;
  try {
    parsed = DeliveryPlanSchema.parse(JSON.parse(plan));
  } catch (e) {
    error = message(e);
  }
  const tol = Number(tolerance),
    valid = Number.isFinite(tol) && tol >= 0 && tol <= 0.01;
  return (
    <>
      <section className="delivery-box">
        <h3>{t("独立运行方案")}</h3>
        <p className="hint">
          {t(
            "使用设置中已配置的解释器；先阅读整理脚本，确认所有输出使用输出目录参数。",
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={!parsed}
          onClick={() =>
            parsed && p.onPreview(`${p.record.directory}/${parsed.script}`)
          }
        >
          {t("核对整理脚本")}
        </Button>
        {parsed ? (
          <>
            <p className="delivery-path">
              {parsed.language === "python" ? "Python" : "R"} · {parsed.script}
            </p>
            <p className="delivery-path">{parsed.args.join(" ")}</p>
            <p>{tf("将核对 {0} 项输出", parsed.comparisons.length)}</p>
            {parsed.comparisons.map((item, index) => (
              <div className="delivery-check" key={index}>
                <strong>{item.source}</strong>
                <span className="delivery-path">→ {item.output}</span>
              </div>
            ))}
            <p className="hint">{parsed.note}</p>
          </>
        ) : null}
        <details>
          <summary>{t("调整运行参数")}</summary>
          <label>
            {t("脚本、参数与比较范围")}
            <textarea
              className="control"
              rows={16}
              value={plan}
              spellCheck={false}
              onChange={(e) => {
                setPlan(e.target.value);
                p.onDraft({ plan: e.target.value, tolerance });
                setReviewed(false);
              }}
            />
          </label>
        </details>
        <p className="hint">
          {t(
            "{workspace} 为原工作区输入，{output} 为本次全新验证目录。不会重启或清空当前内核。",
          )}
        </p>
        <label>
          {t("数值比较容差")}
          <input
            className="control"
            type="number"
            step="any"
            min="0"
            max="0.01"
            value={tolerance}
            onChange={(e) => {
              setTolerance(e.target.value);
              p.onDraft({ plan, tolerance: e.target.value });
              setReviewed(false);
            }}
          />
        </label>
        <p className="hint">
          {t(
            "按既定行序完整比较；文本、整数与样本量精确匹配，小数使用容差。图像与科学含义仍需人工核对。",
          )}
        </p>
      </section>
      {error ? (
        <p className="delivery-error" role="alert">
          {t("运行方案格式不完整，请核对。")}
        </p>
      ) : null}
      <p className="hint">
        {t("临时目录与缓存已单独设置；这是独立进程，不是强制文件系统沙箱。")}
      </p>
      {p.footer
        ? createPortal(
            <>
              <label className="delivery-radio">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                <span>
                  {t("已核对脚本、输入和输出范围，允许启动这次独立运行。")}
                </span>
              </label>
              <Button
                variant="primary"
                size="sm"
                disabled={
                  !parsed || !valid || !reviewed || p.busy || !p.allowed
                }
                onClick={() => parsed && p.onRun(parsed, tol)}
              >
                {t("启动独立验证")}
              </Button>
            </>,
            p.footer,
          )
        : null}
    </>
  );
}
