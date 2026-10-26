/** Real SSH + PTY fixture. It owns only a temporary directory and a random loopback port. */
import { generateKeyPairSync } from "node:crypto"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, writeSync, type Stats } from "node:fs"
import { tmpdir } from "node:os"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { spawn } from "node:child_process"
import * as pty from "node-pty"
import ssh2, { type Connection, type PseudoTtyInfo, type SFTPWrapper } from "ssh2"
const { Server } = ssh2

const { OPEN_MODE, STATUS_CODE } = ssh2.utils.sftp

/** Test-only file transport: reject every symlink component, even links back inside. */
function serveFiles(sftp: SFTPWrapper, workspace: string): () => void {
  const handles = new Map<string, number>()
  const denied = () => Object.assign(new Error("Outside isolated SFTP workspace or symlink"), { code: "EACCES" })
  const checkedPath = (requested: string, create = false) => {
    const path = resolve(workspace, requested), rel = relative(workspace, path)
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) throw denied()
    // Synchronous validation and open run in one event-loop turn. O_NOFOLLOW also
    // protects the final open; no fixture operation creates filesystem symlinks.
    const parts = rel ? rel.split(sep) : []
    let current = workspace
    if (lstatSync(current).isSymbolicLink()) throw denied()
    for (const [index, part] of parts.entries()) {
      current = join(current, part)
      try { if (lstatSync(current).isSymbolicLink()) throw denied() }
      catch (error) {
        if (create && index === parts.length - 1 && (error as NodeJS.ErrnoException).code === "ENOENT") return path
        throw error
      }
    }
    return path
  }
  const attrs = (st: Stats) => ({ mode: st.mode, uid: st.uid, gid: st.gid, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) })
  const request = (id: number, operation: () => void) => {
    try { operation() } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      sftp.status(id, code === "ENOENT" ? STATUS_CODE.NO_SUCH_FILE : code === "EACCES" || code === "ELOOP" ? STATUS_CODE.PERMISSION_DENIED : STATUS_CODE.FAILURE)
    }
  }
  const descriptor = (handle: Buffer) => {
    const fd = handles.get(handle.toString("hex"))
    if (fd === undefined) throw new Error("Unknown SFTP handle")
    return fd
  }
  sftp.on("OPEN", (id, filename, flags) => request(id, () => {
    if (!ssh2.utils.sftp.flagsToString(flags)) throw new Error("Unsupported open flags")
    const path = checkedPath(filename, Boolean(flags & OPEN_MODE.CREAT))
    let mode = flags & OPEN_MODE.WRITE ? flags & OPEN_MODE.READ ? constants.O_RDWR : constants.O_WRONLY : constants.O_RDONLY
    if (flags & OPEN_MODE.CREAT) mode |= constants.O_CREAT
    if (flags & OPEN_MODE.TRUNC) mode |= constants.O_TRUNC
    if (flags & OPEN_MODE.APPEND) mode |= constants.O_APPEND
    if (flags & OPEN_MODE.EXCL) mode |= constants.O_EXCL
    const fd = openSync(path, mode | constants.O_NOFOLLOW, 0o600)
    if (!fstatSync(fd).isFile()) { closeSync(fd); throw denied() }
    const handle = Buffer.from(String(fd))
    handles.set(handle.toString("hex"), fd)
    sftp.handle(id, handle)
  }))
  sftp.on("READ", (id, handle, offset, length) => request(id, () => {
    const data = Buffer.alloc(Math.min(length, 64 * 1024))
    const bytes = readSync(descriptor(handle), data, 0, data.length, offset)
    if (bytes) sftp.data(id, data.subarray(0, bytes))
    else sftp.status(id, STATUS_CODE.EOF)
  }))
  sftp.on("WRITE", (id, handle, offset, data) => request(id, () => {
    const fd = descriptor(handle)
    let written = 0
    while (written < data.length) written += writeSync(fd, data, written, data.length - written, offset + written)
    sftp.status(id, STATUS_CODE.OK)
  }))
  sftp.on("CLOSE", (id, handle) => request(id, () => {
    closeSync(descriptor(handle)); handles.delete(handle.toString("hex"))
    sftp.status(id, STATUS_CODE.OK)
  }))
  sftp.on("FSTAT", (id, handle) => request(id, () => sftp.attrs(id, attrs(fstatSync(descriptor(handle))))))
  for (const event of ["STAT", "LSTAT"] as const) {
    sftp.on(event, (id: number, path: string) => request(id, () => sftp.attrs(id, attrs(lstatSync(checkedPath(path))))))
  }
  sftp.on("REALPATH", (id, path) => request(id, () => {
    const absolute = checkedPath(path)
    sftp.name(id, [{ filename: absolute, longname: absolute, attrs: attrs(lstatSync(absolute)) }])
  }))
  for (const event of ["FSETSTAT", "OPENDIR", "READDIR", "REMOVE", "RMDIR", "READLINK", "SETSTAT", "MKDIR", "RENAME", "SYMLINK", "EXTENDED"]) {
    sftp.on(event, (id: number) => sftp.status(id, STATUS_CODE.OP_UNSUPPORTED))
  }
  const close = () => {
    for (const fd of handles.values()) { try { closeSync(fd) } catch {} }
    handles.clear()
  }
  sftp.on("close", close)
  sftp.on("error", close)
  return close
}

export async function startLoopbackSsh() {
  const workspace = await realpath(await mkdtemp(join(tmpdir(), "dawn-loopback-ssh-")))
  const host = "127.0.0.1", username = "dawn-test", password = "isolated-test-password"
  const env = {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: workspace, USER: username, LOGNAME: username,
    LANG: "en_US.UTF-8", TERM: "xterm-256color", PS1: "dawn-test> ",
  }
  // Test-only key created in memory; never use the user's keys or SSH configuration.
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
  })
  const clients = new Set<Connection>()
  const processes = new Set<() => void>()
  let connections = 0
  const server = new Server({ hostKeys: [privateKey] }, client => {
    connections++
    clients.add(client)
    const owned = new Set<() => void>()
    const track = (stop: () => void) => {
      processes.add(stop); owned.add(stop)
      return () => { processes.delete(stop); owned.delete(stop) }
    }
    client.on("error", () => {})
    client.on("close", () => {
      clients.delete(client)
      for (const stop of [...owned]) stop()
    })
    client.on("authentication", ctx => {
      if (ctx.method === "password" && ctx.username === username && ctx.password === password) ctx.accept()
      else ctx.reject(["password"])
    })
    client.on("ready", () => {
      client.on("session", accept => {
        const session = accept()
        let dimensions: Pick<PseudoTtyInfo, "cols" | "rows"> = { cols: 80, rows: 24 }
        let terminal: pty.IPty | undefined
        session.on("pty", (acceptPty, _reject, info) => { dimensions = info; acceptPty() })
        session.on("window-change", (acceptResize, _reject, info) => {
          dimensions = { ...dimensions, cols: info.cols, rows: info.rows }
          terminal?.resize(info.cols, info.rows)
          acceptResize?.()
        })
        session.on("shell", (acceptShell, reject) => {
          let proc: pty.IPty
          try {
            proc = pty.spawn("/bin/bash", ["--noprofile", "--norc", "-i"], {
              cwd: workspace, env, cols: dimensions.cols, rows: dimensions.rows, name: "xterm-256color",
            })
          } catch { reject(); return }
          terminal = proc
          const channel = acceptShell()
          let exited = false
          const stop = () => { if (!exited) { try { proc.kill() } catch {} } }
          const untrack = track(stop)
          proc.onData(data => { if (channel.writable) channel.write(data) })
          proc.onExit(({ exitCode }) => {
            exited = true; untrack()
            if (channel.writable) { channel.exit(exitCode); channel.end() }
          })
          channel.on("data", (data: Buffer) => { if (!exited) proc.write(data.toString("utf8")) })
          channel.on("close", stop)
          channel.on("error", stop)
        })
        session.on("exec", (acceptExec, _reject, info) => {
          const channel = acceptExec()
          // The executor's bash -lc captures an isolated login environment. Neither this
          // outer shell nor the PTY sources the user's shell startup files.
          const child = spawn("/bin/bash", ["--noprofile", "--norc", "-c", info.command], {
            cwd: workspace, env, detached: true,
          })
          let exited = false
          const stop = () => {
            if (!exited && child.pid) { try { process.kill(-child.pid, "SIGKILL") } catch {} }
          }
          const untrack = track(stop)
          child.stdout.on("data", (data: Buffer) => { if (channel.writable) channel.write(data) })
          child.stderr.on("data", (data: Buffer) => { if (channel.writable) channel.stderr.write(data) })
          child.on("error", error => { if (channel.writable) { channel.stderr.write(error.message); channel.exit(127); channel.end() } })
          child.on("close", code => {
            exited = true; untrack()
            if (channel.writable) { channel.exit(code ?? 1); channel.end() }
          })
          channel.on("close", stop)
          channel.on("error", stop)
        })
        session.on("sftp", acceptSftp => {
          const sftp = acceptSftp(), close = serveFiles(sftp, workspace), untrack = track(close)
          sftp.on("close", untrack)
        })
      })
    })
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, host, () => { server.removeListener("error", reject); resolve() })
    })
  } catch (error) { await rm(workspace, { recursive: true, force: true }); throw error }
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Loopback SSH did not bind a TCP port")
  let closing: Promise<void> | undefined
  return {
    port: address.port, host, username, password, workspace,
    /** Total accepted SSH connections, so multiplexing tests can detect reconnects. */
    get connections() { return connections },
    close(): Promise<void> {
      return closing ??= (async () => {
        for (const stop of [...processes]) stop()
        for (const client of clients) client.end()
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
        await rm(workspace, { recursive: true, force: true })
      })()
    },
  }
}
