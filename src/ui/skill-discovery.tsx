import { useEffect, useRef, useState } from "react";
import { Button, Loader } from "./primitives.js";
import { t, tf } from "./i18n/index.js";
import type {
  SkillCandidate,
  SkillCatalog,
  SkillInstall,
  SkillOrigin,
  SkillPreview,
  SkillPreviewFile,
} from "../protocol/skill-discovery.js";

export interface SkillDiscoveryActions {
  search: (query: string, source?: string) => Promise<SkillCatalog>;
  inspect: (url: string, ref?: string) => Promise<SkillCatalog>;
  preview: (skill: SkillCandidate) => Promise<SkillPreview>;
  readFile: (previewId: string, path: string) => Promise<SkillPreviewFile>;
  discard: (previewId: string) => Promise<unknown>;
  install: (
    previewId: string,
    to: "global" | "project",
  ) => Promise<SkillInstall>;
  origin: (filePath: string) => Promise<{ origin?: SkillOrigin }>;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
function OriginFields({ origin }: { origin: SkillOrigin }) {
  return (
    <dl className="skill-source-fields">
      <dt>{t("仓库")}</dt>
      <dd>{origin.repository}</dd>
      <dt>{t("来源链接")}</dt>
      <dd>
        <code>{origin.sourceUrl}</code>
      </dd>
      <dt>{t("分支或标签")}</dt>
      <dd>{origin.ref}</dd>
      <dt>{t("完整提交")}</dt>
      <dd>
        <code>{origin.commit}</code>
      </dd>
      <dt>{t("技能目录")}</dt>
      <dd>
        <code>{origin.path || "/"}</code>
      </dd>
      <dt>{t("安装时间")}</dt>
      <dd>{origin.installedAt}</dd>
      <dt>{t("内容校验值")}</dt>
      <dd>
        <code>{origin.packageSha256}</code>
      </dd>
      <dt>{t("运行验证")}</dt>
      <dd>{t("DAWN 运行未验证")}</dd>
    </dl>
  );
}
export function SkillOriginDetails({
  filePath,
  actions,
}: {
  filePath: string;
  actions: SkillDiscoveryActions;
}) {
  const [open, setOpen] = useState(false),
    [origin, setOrigin] = useState<SkillOrigin>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const show = async () => {
    if (open) {
      generation.current++;
      setOpen(false);
      setBusy(false);
      return;
    }
    setOpen(true);
    setBusy(true);
    setError("");
    const current = ++generation.current;
    try {
      const result = await actions.origin(filePath);
      if (current === generation.current) setOrigin(result.origin);
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  };
  return (
    <div className="skill-origin">
      <Button
        variant="text"
        size="inline"
        aria-expanded={open}
        onClick={() => void show()}
      >
        {open ? t("收起安装来源") : t("查看安装来源")}
      </Button>
      {open ? (
        <div className="skill-origin-detail">
          {busy ? (
            <Loader label={t("读取来源记录")} />
          ) : error ? (
            <p role="alert" className="caveat">
              {error}
            </p>
          ) : origin ? (
            <>
              <OriginFields origin={origin} />
              <p className="hint">
                {t("此记录描述安装时的来源，本地修改未重新核验。")}
              </p>
            </>
          ) : (
            <p className="hint">{t("没有在线安装来源记录。")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SkillDiscoveryPanel({
  actions,
  hasProject,
  onInstalled,
}: {
  actions: SkillDiscoveryActions;
  hasProject: boolean;
  onInstalled: () => void;
}) {
  const [query, setQuery] = useState(""),
    [source, setSource] = useState(""),
    [url, setUrl] = useState(""),
    [ref, setRef] = useState("");
  const [catalog, setCatalog] = useState<SkillCatalog>(),
    [preview, setPreview] = useState<SkillPreview>(),
    [file, setFile] = useState<SkillPreviewFile>();
  const [busy, setBusy] = useState<"search" | "preview" | "file" | "install">(),
    [error, setError] = useState(""),
    [installed, setInstalled] = useState<SkillInstall>(),
    [to, setTo] = useState<"global" | "project">("global");
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!preview) return;
    detailRef.current?.focus({ preventScroll: true });
    detailRef.current?.scrollIntoView?.({ block: "start" });
  }, [preview?.previewId]);
  const generation = useRef(0),
    activePreview = useRef<string | undefined>(undefined),
    actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(
    () => () => {
      generation.current++;
      if (activePreview.current)
        void actionsRef.current.discard(activePreview.current).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (!hasProject) setTo("global");
  }, [hasProject]);
  const clearPreview = () => {
    if (activePreview.current)
      void actions.discard(activePreview.current).catch(() => {});
    activePreview.current = undefined;
    setPreview(undefined);
    setFile(undefined);
    setInstalled(undefined);
  };
  const cancel = () => {
    generation.current++;
    setBusy(undefined);
  };
  const search = async (link = false) => {
    const current = ++generation.current;
    clearPreview();
    setBusy("search");
    setError("");
    try {
      const result = link
        ? await actions.inspect(url.trim(), ref.trim() || undefined)
        : await actions.search(query.trim(), source || undefined);
      if (current === generation.current) setCatalog(result);
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) setBusy(undefined);
    }
  };
  const select = async (skill: SkillCandidate) => {
    const current = ++generation.current;
    clearPreview();
    setBusy("preview");
    setError("");
    try {
      const result = await actions.preview(skill);
      if (current !== generation.current) {
        void actions.discard(result.previewId).catch(() => {});
        return;
      }
      activePreview.current = result.previewId;
      setPreview(result);
      setFile({
        path: "SKILL.md",
        bytes: new TextEncoder().encode(result.body).length,
        text: result.body,
      });
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) setBusy(undefined);
    }
  };
  const read = async (path: string) => {
    if (!preview) return;
    const current = ++generation.current;
    setBusy("file");
    setError("");
    setFile(undefined);
    try {
      const result = await actions.readFile(preview.previewId, path);
      if (current === generation.current) setFile(result);
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) setBusy(undefined);
    }
  };
  const install = async () => {
    if (!preview) return;
    const current = ++generation.current;
    setBusy("install");
    setError("");
    try {
      const result = await actions.install(preview.previewId, to);
      if (current === generation.current) {
        setInstalled(result);
        onInstalled();
      }
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) setBusy(undefined);
    }
  };
  return (
    <section className="skill-discovery" aria-label={t("发现技能")}>
      <p className="hint">
        {t("搜索收录的公开技能源，或粘贴 GitHub 链接选择单个技能。")}
      </p>
      <form
        className="skill-discovery-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="grow">
          {t("搜索在线技能")}
          <input
            className="control"
            type="search"
            aria-label={t("搜索在线技能")}
            value={query}
            placeholder={t("输入技能名称或用途关键词")}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          {t("技能源")}
          <select
            className="control"
            aria-label={t("技能源")}
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">{t("全部收录来源")}</option>
            {(catalog?.sources ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={Boolean(busy)}
        >
          {t("检索技能源")}
        </Button>
      </form>
      <form
        className="skill-discovery-form"
        onSubmit={(e) => {
          e.preventDefault();
          void search(true);
        }}
      >
        <label className="grow">
          {t("GitHub 链接")}
          <input
            className="control"
            type="url"
            aria-label={t("GitHub 链接")}
            placeholder="https://github.com/owner/repository/tree/main/skills/example"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label>
          {t("分支或标签（可选）")}
          <input
            className="control"
            aria-label={t("分支或标签（可选）")}
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          size="sm"
          type="submit"
          disabled={Boolean(busy) || !url.trim()}
        >
          {t("解析链接")}
        </Button>
      </form>
      {busy ? (
        <div className="skill-discovery-progress" role="status">
          <Loader
            label={busy === "install" ? t("正在安装技能") : t("正在加载技能")}
          />
          {busy !== "install" ? (
            <Button variant="text" size="inline" onClick={cancel}>
              {t("放弃加载")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="caveat">
          {error}
        </p>
      ) : null}
      {catalog ? (
        <>
          <p className="hint">
            {tf(
              "本次范围：{0}",
              (catalog.searchedSources ?? catalog.sources)
                .map((s) => s.label)
                .join("、") || t("指定的 GitHub 链接"),
            )}
          </p>
          {catalog.problems.map((problem, index) => (
            <p className="caveat" role="status" key={index}>
              {problem}
            </p>
          ))}
          {!catalog.skills.length ? (
            <p>{t("没有匹配的技能，请尝试其他关键词或直接粘贴链接。")}</p>
          ) : (
            <ul className="skill-discovery-results">
              {catalog.skills.map((skill) => (
                <li key={skill.key}>
                  <div>
                    <strong>{skill.name}</strong>
                    <span className="tag">{skill.sourceLabel}</span>
                    <p>{skill.description}</p>
                    <code>
                      {skill.repository}/{skill.path}
                    </code>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={Boolean(busy)}
                    aria-label={tf("预览 {0}", skill.name)}
                    onClick={() => void select(skill)}
                  >
                    {t("查看详情")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {preview ? (
        <section
          ref={detailRef}
          tabIndex={-1}
          className="skill-discovery-detail"
          aria-label={t("技能详情")}
        >
          <div className="skill-discovery-detail-head">
            <h2>{preview.skill.name}</h2>
            <Button
              variant="text"
              size="inline"
              disabled={busy === "install"}
              onClick={() => {
                cancel();
                clearPreview();
              }}
            >
              {t("关闭详情")}
            </Button>
          </div>
          <p>{preview.skill.description}</p>
          <div className="skill-discovery-badges">
            <span className="tag">
              {preview.skill.format === "valid"
                ? t("格式检查通过")
                : t("格式检查未通过")}
            </span>
            <span className="tag">{t("DAWN 运行未验证")}</span>
          </div>
          {preview.skill.issues.map((issue, i) => (
            <p key={i} className="caveat">
              {issue}
            </p>
          ))}
          <dl className="skill-source-fields">
            <dt>{t("仓库")}</dt>
            <dd>{preview.skill.repository}</dd>
            <dt>{t("来源链接")}</dt>
            <dd>
              <code>{preview.skill.url}</code>
            </dd>
            <dt>{t("分支或标签")}</dt>
            <dd>{preview.skill.ref}</dd>
            <dt>{t("完整提交")}</dt>
            <dd>
              <code>{preview.skill.commit}</code>
            </dd>
            <dt>{t("技能目录")}</dt>
            <dd>
              <code>{preview.skill.path || "/"}</code>
            </dd>
            <dt>{t("许可证")}</dt>
            <dd>{preview.skill.license || t("未声明")}</dd>
          </dl>
          <h3>{t("上游声明的依赖")}</h3>
          <p className="hint">
            {t("以下信息来自技能声明和依赖文件，尚未检查本机环境。")}
          </p>
          {preview.skill.dependencies.length ? (
            <ul>
              {preview.skill.dependencies.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">
              {t("未找到明确的依赖声明，不能据此认定没有依赖。")}
            </p>
          )}
          <div className="skill-package-preview">
            <nav aria-label={t("技能包文件")}>
              <p>{tf("完整目录 · {0} 个文件", preview.files.length)}</p>
              {preview.files.map((f) => (
                <Button
                  key={f.path}
                  variant={file?.path === f.path ? "secondary" : "ghost"}
                  size="inline"
                  disabled={Boolean(busy)}
                  onClick={() => void read(f.path)}
                >
                  {f.path}
                </Button>
              ))}
            </nav>
            <div className="skill-package-content">
              {file ? (
                <>
                  <p>
                    <code>{file.path}</code> · {file.bytes} B
                  </p>
                  {file.notice ? <p className="hint">{file.notice}</p> : null}
                  {file.text !== undefined ? <pre>{file.text}</pre> : null}
                </>
              ) : null}
            </div>
          </div>
          <p className="hint">
            {t("安装完整技能目录；不会执行附带脚本或安装依赖。")}
          </p>
          {installed ? (
            <div role="status">
              <p className="mcp-ok">{tf("已安装：{0}", installed.name)}</p>
              <p className="hint">
                {t("新会话起生效。安装来源已保存在技能目录。")}
              </p>
            </div>
          ) : (
            <div className="skill-discovery-install">
              <label>
                {t("安装位置")}
                <select
                  className="control"
                  aria-label={t("安装位置")}
                  value={to}
                  disabled={Boolean(busy)}
                  onChange={(e) =>
                    setTo(e.target.value as "global" | "project")
                  }
                >
                  <option value="global">{t("全局技能")}</option>
                  {hasProject ? (
                    <option value="project">{t("当前项目")}</option>
                  ) : null}
                </select>
              </label>
              <Button
                variant="primary"
                size="sm"
                disabled={Boolean(busy) || preview.skill.format !== "valid"}
                onClick={() => void install()}
              >
                {t("安装此技能")}
              </Button>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}
