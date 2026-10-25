import { expect, it } from "vitest";
import { runIndependent } from "../../src/delivery/verify.js";

const run = (script: string) => runIndependent(process.execPath, ["-e", script], process.cwd(), process.env, new AbortController().signal, 5000);
const limit = 1024 * 1024;

it("preserves UTF-8 characters split across real stdout and stderr chunks", async () => {
  const stdout = "模型完成🌱", stderr = "错误说明🧪";
  const result = await run(`const out=Buffer.from(${JSON.stringify(stdout)}),err=Buffer.from(${JSON.stringify(stderr)});let i=0;const timer=setInterval(()=>{if(i<out.length)process.stdout.write(out.subarray(i,i+1));if(i<err.length)process.stderr.write(err.subarray(i,i+1));if(++i>=Math.max(out.length,err.length))clearInterval(timer);},10)`);
  expect(result.code).toBe(0);
  expect(result.stdout).toBe(stdout);
  expect(result.stderr).toBe(stderr);
  expect(result.logTruncated).toBe(false);
});

it("keeps each stream within its byte budget without cutting a UTF-8 character", async () => {
  const result = await run(`process.stdout.write('中'.repeat(400000));process.stderr.write('完整错误日志🌱')`);
  expect(result.code).toBe(0);
  expect(result.stdout === "中".repeat(Math.floor(limit / 3))).toBe(true);
  expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(limit);
  expect(result.stderr).toBe("完整错误日志🌱");
  expect(result.logTruncated).toBe(true);
});

it("does not mark an exactly full valid UTF-8 log as truncated", async () => {
  const expected = "中".repeat(Math.floor(limit / 3)) + "a";
  const result = await run(`process.stdout.write('中'.repeat(${Math.floor(limit / 3)})+'a')`);
  expect(Buffer.byteLength(expected)).toBe(limit);
  expect(result.stdout === expected).toBe(true);
  expect(result.logTruncated).toBe(false);
});
