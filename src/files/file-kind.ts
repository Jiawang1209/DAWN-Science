/**
 * 文件树里一行该配哪个图标（2026-08-20，作者要的）。
 *
 * 作者：*「在文件预览的地方，能否增加图标，比如文件夹、文本、md 文件，
 * 各自都有各自的图标，这样子方便辨识。」*
 *
 * **只看名字**，不读内容：树里一层可能有上千行，为每行读一眼是荒唐的，
 * 而且远端那条根本没内容可读。所以它比 `分类预览` 粗——那一份决定
 * 「点开之后怎么显示」，这一份只决定「一眼认出是哪一类」。
 * 两份判的不是同一件事，所以不是重复。
 *
 * **纯函数、不碰 node**：渲染进程里用的。
 */
export type 文件类 =
  | "dir"
  | "markdown"
  | "text"
  | "table"
  | "image"
  | "code"
  | "shell"
  | "notebook"
  | "archive"
  | "pdf"
  | "other"

const 按后缀: Record<string, 文件类> = {
  md: "markdown", markdown: "markdown", rmd: "markdown", qmd: "markdown",
  txt: "text", log: "text", rst: "text", cfg: "text", ini: "text", conf: "text", env: "text",
  csv: "table", tsv: "table", xlsx: "table", xls: "table", parquet: "table", feather: "table", arrow: "table",
  png: "image", jpg: "image", jpeg: "image", gif: "image", svg: "image", webp: "image", bmp: "image", tif: "image", tiff: "image", pdf: "pdf",
  py: "code", r: "code", js: "code", ts: "code", tsx: "code", jsx: "code", mjs: "code", cjs: "code",
  json: "code", yaml: "code", yml: "code", toml: "code", sql: "code", jl: "code", c: "code", cpp: "code", h: "code", java: "code", go: "code", rs: "code", html: "code", css: "code", scss: "code", tex: "code", bib: "code",
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell", bat: "shell", ps1: "shell",
  ipynb: "notebook",
  zip: "archive", tar: "archive", gz: "archive", tgz: "archive", bz2: "archive", xz: "archive", "7z": "archive", rar: "archive", zst: "archive",
}

/** 几个没有后缀但一眼该认出来的名字 */
const 按全名: Record<string, 文件类> = {
  makefile: "shell",
  dockerfile: "shell",
  ".bashrc": "shell", ".zshrc": "shell", ".profile": "shell", ".bash_profile": "shell", ".bash_logout": "shell",
  ".gitignore": "text", ".env": "text", "license": "text", "readme": "markdown",
}

export function 文件类按名字(name: string, kind: "dir" | "file"): 文件类 {
  if (kind === "dir") return "dir"
  const 小写 = name.toLowerCase()
  const 全名 = 按全名[小写]
  if (全名) return 全名
  /**
   * **多段后缀取最后一段**（`data.tar.gz` → `gz`），与 `extname` 同一口径。
   * 以点开头且只有一个点的（`.bashrc`）没有后缀——上面那张全名表管它们。
   */
  const i = 小写.lastIndexOf(".")
  if (i <= 0) return "other"
  return 按后缀[小写.slice(i + 1)] ?? "other"
}
