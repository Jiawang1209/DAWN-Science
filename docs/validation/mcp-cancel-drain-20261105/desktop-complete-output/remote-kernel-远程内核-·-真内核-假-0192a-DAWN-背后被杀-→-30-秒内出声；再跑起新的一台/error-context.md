# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: remote-kernel.spec.ts >> 远程内核 · 真内核 + 假 SSH >> 内核在 DAWN 背后被杀 → 30 秒内出声；再跑起新的一台
- Location: e2e/remote-kernel.spec.ts:272:3

# Error details

```
Tearing down "dawn" exceeded the test timeout of 60000ms.
```