import { UserFacingError } from "../errors.js";
import { decodeDeliveryText } from "./text.js";
import { ComparedNumber, equalNumbers, exactNumericField, identityField, numericText, parseComparisonJson } from "./numbers.js";
/** Explicit user confirmation starts an independent process. It never calls the session kernel. */
import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import {
  DeliveryVerifySchema,
  type DeliveryRecord,
  type DeliveryVerify,
} from "../protocol/delivery.js";
import { 读成表 } from "../files/table.js";
import {
  deliveryPath,
  writeDeliveryFile,
  type DeliveryOptions,
} from "./service.js";
type Check = NonNullable<DeliveryRecord["verification"]["checks"]>[number];
const MAX_BYTES = 8 * 1024 * 1024,
  MAX_LOG = 1024 * 1024;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
export async function runIndependent(
  executable: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  timeoutMs: number,
) {
  signal.throwIfAborted();
  return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
    stopped?: string;
    logTruncated: boolean;
  }>((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const logs = {
      stdout: { text: "", bytes: 0, capped: false, decoder: new StringDecoder("utf8") },
      stderr: { text: "", bytes: 0, capped: false, decoder: new StringDecoder("utf8") },
    };
    let truncated = false,
      stopped: string | undefined,
      killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = () => {
      if (child.pid) {
        try {
          if (process.platform === "win32") child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "ESRCH")
            console.warn("[delivery process cleanup]", errorText(e));
        }
      }
    };
    const stop = (note: string) => {
      if (stopped) return;
      stopped = note;
      kill();
      killTimer = setTimeout(kill, 200);
    };
    const abort = () => stop("验证已取消");
    const timeout = setTimeout(
      () => stop("独立验证超时，已停止本次进程组"),
      timeoutMs,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const append = (which: "stdout" | "stderr", data: Buffer) => {
      const log = logs[which];
      const space = MAX_LOG - log.bytes;
      if (data.length > space) { log.capped = true; truncated = true; }
      const kept = data.subarray(0, Math.max(0, space));
      log.bytes += kept.length;
      // Pipe chunks can end inside a UTF-8 code point. Each stream owns its decoder.
      log.text += log.decoder.write(kept);
    };
    child.stdout.on("data", (data) => append("stdout", data));
    child.stderr.on("data", (data) => append("stderr", data));
    const cleanup = () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      signal.removeEventListener("abort", abort);
    };
    child.on("error", (e) => {
      cleanup();
      reject(e);
    });
    child.on("close", (code) => {
      cleanup();
      kill();
      // A budget cutoff must not flush an incomplete final character as replacement text.
      for (const log of Object.values(logs)) if (!log.capped) log.text += log.decoder.end();
      resolve({
        code,
        stdout: logs.stdout.text,
        stderr: logs.stderr.text,
        ...(stopped ? { stopped } : {}),
        logTruncated: truncated,
      });
    });
  });
}
function equalValue(a: unknown, b: unknown, tolerance: number): boolean {
  if (a instanceof ComparedNumber || b instanceof ComparedNumber)
    return a instanceof ComparedNumber && b instanceof ComparedNumber && equalNumbers(a, b, tolerance);
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equalValue(v, b[i], tolerance))
    );
  if (a && b && typeof a === "object" && typeof b === "object") {
    const x = a as Record<string, unknown>,
      y = b as Record<string, unknown>,
      keys = Object.keys(x);
    return (
      keys.length === Object.keys(y).length &&
      keys.every(
        (k) =>
          Object.hasOwn(y, k) &&
          equalValue(
            x[k],
            y[k],
            exactNumericField(k) ? 0 : tolerance,
          ),
      )
    );
  }
  return a === b;
}
export function compareDeliveryText(
  a: string,
  b: string,
  kind: "table" | "text" | "json",
  tolerance: number,
): { same: boolean; note: string } {
  if (kind === "text") return { same: a === b, note: "完整文本逐字比较" };
  if (kind === "json")
    return {
      same: equalValue(parseComparisonJson(a), parseComparisonJson(b), tolerance),
      note: `JSON 完整字段/数组比较；整数、样本量及已识别编号/类别字段精确比较，其余可安全表示的小数容差 ${tolerance}`,
    };
  const x = 读成表(a, true, 20_000),
    y = 读成表(b, true, 20_000);
  if (x.rowsRead !== x.totalRows || y.rowsRead !== y.totalRows)
    throw new UserFacingError("表格超过完整比较行数上限，未比较");
  const columns = x.columns.map((c) => c.name),
    other = y.columns.map((c) => c.name);
  if (
    !columns.length ||
    new Set(columns).size !== columns.length ||
    !equalValue(columns, other, 0)
  )
    return { same: false, note: "表头为空、重复或不一致" };
  if (x.rows.length !== y.rows.length)
    return {
      same: false,
      note: `行数不一致：${x.rows.length} / ${y.rows.length}`,
    };
  for (let i = 0; i < x.rows.length; i++) {
    const left = x.rows[i]!,
      right = y.rows[i]!;
    if (left.length !== columns.length || right.length !== columns.length)
      return { same: false, note: `第 ${i + 1} 行列数不一致` };
    for (let j = 0; j < columns.length; j++) {
      const v = left[j]!,
        w = right[j]!,
        numbers = numericText.test(v) && numericText.test(w)
          && !identityField(columns[j]!) && !/^[+-]?0\d/.test(v) && !/^[+-]?0\d/.test(w);
      if (
        !equalValue(
          numbers ? new ComparedNumber(v) : v,
          numbers ? new ComparedNumber(w) : w,
          exactNumericField(columns[j]!)
            ? 0
            : tolerance,
        )
      )
        return {
          same: false,
          note: `第 ${i + 1} 行 ${columns[j]} 不一致：${v} / ${w}`,
        };
    }
  }
  return {
    same: true,
    note: `完整比较 ${x.rows.length} 行、${columns.length} 列；按既定行序，文本、整数、样本量及已识别编号/类别字段精确比较，其余可安全表示的小数容差 ${tolerance}`,
  };
}
/** Enumerate new outputs, not only files named by the comparison plan. Never follow links or caches. */
function collectOutputs(
  workspace: string,
  dir: string,
  record: DeliveryRecord,
  checks: Check[],
): void {
  let count = 0,
    limited = false;
  const walk = (folder: string, depth: number) => {
    if (depth > 8) {
      limited = true;
      return;
    }
    const entries = readdirSync(deliveryPath(workspace, folder), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        (depth === 0 && ["tmp", "cache", "home"].includes(entry.name))
      )
        continue;
      if (++count > 200) {
        limited = true;
        break;
      }
      const path = `${folder}/${entry.name}`,
        stat = lstatSync(join(workspace, path));
      if (stat.isSymbolicLink()) {
        checks.push({
          path,
          state: "failed",
          note: "输出含符号链接，未跟随或读取",
        });
        continue;
      }
      if (stat.isDirectory()) walk(path, depth + 1);
      else if (stat.isFile() && !record.files.some((f) => f.path === path))
        record.files.push({ path, role: "verification" });
    }
  };
  walk(dir, 0);
  if (limited)
    checks.push({
      path: dir,
      state: "skipped",
      note: "验证产物清单超过 200 项或 8 层上限，部分条目未列出；未据此宣称完整交付",
    });
}
export async function verifyDelivery(
  o: DeliveryOptions & {
    record: DeliveryRecord;
    request: DeliveryVerify;
    signal: AbortSignal;
    onUpdate: (r: DeliveryRecord) => unknown;
  },
): Promise<DeliveryRecord> {
  const request = DeliveryVerifySchema.parse(o.request),
    { record } = o,
    plan = request.plan;
  let interpreter = o.interpreters?.[plan.language];
  if (!interpreter || !isAbsolute(interpreter))
    throw new UserFacingError(
      "请先在设置中配置本机解释器；不会自动选择另一套环境",
    );
  if (plan.language === "r" && /^R(?:\.exe)?$/i.test(basename(interpreter)))
    interpreter = join(
      dirname(interpreter),
      process.platform === "win32" ? "Rscript.exe" : "Rscript",
    );
  if (!existsSync(interpreter) || !statSync(interpreter).isFile())
    throw new UserFacingError("配置的解释器不可用");
  if (!plan.args.some((a) => a.includes("{output}")))
    throw new UserFacingError("缺少显式输出目录参数");
  const scriptPath = `${record.directory}/${plan.script}`;
  if (
    !record.files.some((f) => f.role === "script" && f.path === scriptPath) ||
    !/^scripts\//.test(plan.script)
  )
    throw new UserFacingError("只能验证本次生成并供你核对的脚本");
  const script = readFileSync(deliveryPath(o.workspace, scriptPath));
  // This is a preflight, not an OS sandbox. User reviews code and all output parameters first.
  if (
    /(?:\/tmp\/|\/Users\/|[A-Z]:\\|pip\s+install|install\.packages\s*\(|shutil\.rmtree\s*\(|unlink\s*\([^)]*recursive\s*=\s*(?:TRUE|T)|os\.system\s*\(|subprocess\.)/i.test(
      script.toString("utf8"),
    )
  )
    throw new UserFacingError(
      "脚本含固定外部路径、安装、清理或额外子进程；请先核对并修正输出边界",
    );
  for (const c of plan.comparisons) {
    const evidence = record.evidence.find((e) => e.path === c.source);
    if (!evidence?.copyPath)
      throw new UserFacingError(`比较参照没有保存在交付中：${c.source}`);
  }
  const validation = `${record.directory}/validation/${randomUUID()}`,
    out = `${validation}/output`;
  for (const dir of [out, `${out}/tmp`, `${out}/cache`, `${out}/home`])
    mkdirSync(deliveryPath(o.workspace, dir), { recursive: true });
  const absoluteOut = deliveryPath(o.workspace, out),
    cwd = deliveryPath(o.workspace, validation);
  const actualScript = `${validation}/run.${plan.language === "python" ? "py" : "R"}`;
  writeDeliveryFile(o.workspace, actualScript, script);
  const args = plan.args.map((a) =>
    a
      .replaceAll("{workspace}", o.workspace)
      .replaceAll("{output}", absoluteOut),
  );
  if (args.some((a) => /\{\w+\}/.test(a)))
    throw new UserFacingError("运行参数含未展开的占位符");
  record.files.push({ path: actualScript, role: "verification" });
  const actualArgs = [
    ...(plan.language === "python" ? ["-B"] : ["--vanilla"]),
    deliveryPath(o.workspace, actualScript),
    ...args,
  ];
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: join(absoluteOut, "home"),
    TMPDIR: join(absoluteOut, "tmp"),
    TMP: join(absoluteOut, "tmp"),
    TEMP: join(absoluteOut, "tmp"),
    XDG_CACHE_HOME: join(absoluteOut, "cache"),
    MPLCONFIGDIR: join(absoluteOut, "cache", "matplotlib"),
    PYTHONPYCACHEPREFIX: join(absoluteOut, "cache", "pycache"),
    PYTHONNOUSERSITE: "1",
    R_ENVIRON_USER: process.platform === "win32" ? "NUL" : "/dev/null",
    R_PROFILE_USER: process.platform === "win32" ? "NUL" : "/dev/null",
  };
  record.verification = {
    state: "running",
    note: "正在独立进程运行；保留当前内核。",
    directory: validation,
    command: [interpreter, ...actualArgs],
  };
  o.onUpdate(record);
  const save = (name: string, content: string) => {
    const path = `${validation}/${name}`;
    writeDeliveryFile(o.workspace, path, content);
    record.files.push({ path, role: "verification" });
  };
  const checks: Check[] = [];
  try {
    const version = await runIndependent(
      interpreter,
      plan.language === "python" ? ["--version"] : ["--version"],
      cwd,
      env,
      o.signal,
      8000,
    );
    save(
      "environment.json",
      JSON.stringify(
        {
          interpreter,
          version: version.stdout + version.stderr,
          versionExitCode: version.code,
          scriptSha256: createHash("sha256").update(script).digest("hex"),
          tolerance: request.tolerance,
          plan,
          environment: {
            TMPDIR: env.TMPDIR,
            HOME: env.HOME,
            PYTHONNOUSERSITE: env.PYTHONNOUSERSITE,
          },
          note: "独立解释器进程；不是内核；临时环境变量不是强制文件系统沙箱。依赖版本未完整采集。",
        },
        null,
        2,
      ),
    );
    if (version.code !== 0 || version.stopped)
      throw new UserFacingError(version.stopped ?? "解释器版本检查失败");
    const run = await runIndependent(
      interpreter,
      actualArgs,
      cwd,
      env,
      o.signal,
      o.validationTimeoutMs ?? 90_000,
    );
    save(
      "stdout.log",
      run.stdout + (run.logTruncated ? "\n[日志达到上限，内容不完整]\n" : ""),
    );
    save("stderr.log", run.stderr);
    record.verification.exitCode = run.code;
    collectOutputs(o.workspace, out, record, checks);
    if (run.stopped) throw new UserFacingError(run.stopped);
    if (run.code !== 0)
      throw new UserFacingError(
        `独立进程退出码 ${run.code}；请查看 stderr.log`,
      );
    for (const comparison of plan.comparisons) {
      const before = record.evidence.find((e) => e.path === comparison.source)!,
        file = `${out}/${comparison.output}`,
        after = deliveryPath(o.workspace, file);
      if (!existsSync(after)) {
        checks.push({
          path: comparison.output,
          state: "skipped",
          note: "本次独立运行未生成预期文件",
        });
        continue;
      }
      if (!statSync(after).isFile() || statSync(after).size > MAX_BYTES) {
        checks.push({
          path: comparison.output,
          state: "skipped",
          note: "不是小型普通文件，未完整比较",
        });
        continue;
      }
      const source = readFileSync(deliveryPath(o.workspace, before.copyPath!)),
        current = readFileSync(after);
      if (createHash("sha256").update(source).digest("hex") !== before.sha256) {
        checks.push({
          path: comparison.output,
          state: "failed",
          note: "原交付参照已被修改，不能冒充当时结果",
        });
        continue;
      }
      if (!record.files.some((f) => f.path === file))
        record.files.push({ path: file, role: "verification" });
      if (comparison.kind === "image") {
        checks.push({
          path: comparison.output,
          state: "skipped",
          note: "图像已生成；像素、版式和科学含义仍需在预览中核对，不用文件大小或字节哈希判定图一致",
        });
        continue;
      }
      try {
        const result = compareDeliveryText(
          decodeDeliveryText(source),
          decodeDeliveryText(current),
          comparison.kind,
          request.tolerance,
        );
        checks.push({
          path: comparison.output,
          state: result.same ? "passed" : "failed",
          note: result.note,
        });
      } catch (e) {
        checks.push({
          path: comparison.output,
          state: "skipped",
          note: errorText(e),
        });
      }
    }
    const state = checks.some((c) => c.state === "failed")
      ? "failed"
      : !checks.length ||
          checks.some((c) => c.state === "skipped") ||
          run.logTruncated
        ? "partial"
        : "passed";
    record.verification = {
      ...record.verification,
      state,
      checks,
      note:
        state === "passed"
          ? "独立重跑及选定输出比较通过；不代表未选输出或科学结论已获独立核验。"
          : state === "partial"
            ? "独立运行已结束；部分输出未比较或日志不完整，请查看检查范围。"
            : "输出比较不一致，保留原结果与本次验证记录。",
    };
  } catch (e) {
    record.verification = {
      ...record.verification,
      state: "failed",
      checks,
      note: errorText(e),
    };
  }
  save("verification.json", JSON.stringify(record.verification, null, 2));
  o.onUpdate(record);
  return structuredClone(record);
}
