/** Real scanner and temporary Git repository; canaries are generated, never real credentials. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const guard = resolve('scripts/secret-guard.mjs')
function repo(run) {
  const dir = mkdtempSync(join(tmpdir(), 'dawn-secret-guard-test-'))
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir, stdio: 'pipe' }).toString()
  const scan = (...args) => spawnSync(process.execPath, [guard, ...args], { cwd: dir, encoding: 'utf8' })
  try { git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid'); run({dir,git,scan}) }
  finally { rmSync(dir, { recursive: true, force: true }) }
}
const canary = () => ['sk', '9d32bc41e580a76f'.repeat(2)].join('-')
test('staged full content is checked and output never contains a detected key', () => repo(({dir,git,scan}) => {
  const secret = canary()
  writeFileSync(join(dir,'example.ts'), `const apiKey = "${secret}"\n`); git('add','example.ts')
  const r=scan('--staged'); assert.equal(r.status,1); assert.match(r.stdout+r.stderr,/file#[a-f0-9]{16}/)
  assert.ok(!(r.stdout+r.stderr).includes(secret)); assert.ok(!(r.stdout+r.stderr).includes('9d32bc41e580a76f'))
}))
test('forced runtime credential files are blocked even when encrypted', () => repo(({dir,git,scan}) => {
  writeFileSync(join(dir,'credentials.json'), '{"encrypted":"fixture"}'); git('add','-f','credentials.json')
  const r=scan('--staged'); assert.equal(r.status,1); assert.match(r.stdout+r.stderr,/runtime-credential-file/)
}))
test('clean placeholders and audit SHA records pass, but a key next to a SHA does not', () => repo(({dir,git,scan}) => {
  mkdirSync(join(dir,'docs','validation'),{recursive:true})
  writeFileSync(join(dir,'docs','validation','hashes.json'),JSON.stringify({'src/electron/credentials.ts':'a1b2c3d4'.repeat(8)},null,2))
  writeFileSync(join(dir,'example.ts'),'const apiKey = "fixture-not-a-real-key"\n'); git('add','.')
  assert.equal(scan('--staged').status,0)
  writeFileSync(join(dir,'docs','validation','hashes.json'),JSON.stringify({'src/electron/credentials.ts':'a1b2c3d4'.repeat(8),apiKey:canary()},null,2));git('add','.')
  assert.equal(scan('--staged').status,1)
}))
test('outgoing history catches secrets added then removed before the tip', () => repo(({dir,git,scan}) => {
  writeFileSync(join(dir,'file.ts'),'// safe\n');git('add','.');git('commit','-qm','baseline');const base=git('rev-parse','HEAD').trim()
  writeFileSync(join(dir,'file.ts'),`const apiKey = "${canary()}"\n`);git('commit','-qam','unsafe')
  writeFileSync(join(dir,'file.ts'),'// safe again\n');git('commit','-qam','removed')
  const tip=git('rev-parse','HEAD').trim();const r=scan('--range',`${base}..${tip}`)
  assert.equal(r.status,1);assert.ok(!(r.stdout+r.stderr).includes(canary()))
}))
test('a deleted credential file in outgoing history is still blocked', () => repo(({dir,git,scan}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','baseline');const base=git('rev-parse','HEAD').trim()
  writeFileSync(join(dir,'credentials.json'),'{}');git('add','-f','.');git('commit','-qm','unsafe');git('rm','credentials.json');git('commit','-qm','removed')
  assert.equal(scan('--range',`${base}..${git('rev-parse','HEAD').trim()}`).status,1)
}))

test('pre-push checks the actual proposed ref update and allows deletions', () => repo(({dir,git}) => {
  const secret=canary()
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD').trim()
  writeFileSync(join(dir,'unsafe.ts'),`const apiKey = "${secret}"\n`);git('add','.');git('commit','-qm','unsafe');const tip=git('rev-parse','HEAD').trim()
  const input=`refs/heads/topic ${tip} refs/heads/topic ${base}\n`
  const r=spawnSync(process.execPath,[guard,'--pre-push'],{cwd:dir,input,encoding:'utf8'})
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/);assert.ok(!(r.stdout+r.stderr).includes(secret))
  const deletion=spawnSync(process.execPath,[guard,'--pre-push'],{cwd:dir,input:`(delete) ${'0'.repeat(40)} refs/heads/topic ${tip}\n`,encoding:'utf8'})
  assert.equal(deletion.status,0)
}))
test('new remote branches also scan newly introduced commits', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'unsafe.ts'),`const apiKey = "${canary()}"\n`);git('add','.');git('commit','-qm','unsafe');const tip=git('rev-parse','HEAD').trim()
  const r=spawnSync(process.execPath,[guard,'--pre-push'],{cwd:dir,input:`refs/heads/topic ${tip} refs/heads/topic ${'0'.repeat(40)}\n`,encoding:'utf8'})
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/)
}))
for (const runtimeFile of [false,true]) test(`merge-only ${runtimeFile?'credential file':'key'} is detected after subsequent deletion`, () => repo(({dir,git,scan}) => {
  writeFileSync(join(dir,'base.md'),'safe');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD').trim()
  git('checkout','-qb','side');writeFileSync(join(dir,'side.md'),'side');git('add','.');git('commit','-qm','side')
  git('checkout','-qb','trunk',base);writeFileSync(join(dir,'trunk.md'),'trunk');git('add','.');git('commit','-qm','trunk')
  git('merge','--no-ff','--no-commit','side')
  const filename=runtimeFile?'credentials.json':'merge.ts'
  writeFileSync(join(dir,filename),runtimeFile?'{"encrypted":"fixture"}':`const apiKey = "${canary()}"\n`)
  git('add','-f','.');git('commit','-qm','merge');git('rm',filename);git('commit','-qm','remove')
  const r=scan('--range',`${base}..${git('rev-parse','HEAD').trim()}`)
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,runtimeFile?/runtime-credential-file/:/secret:/)
}))
test('new public branch cannot exclude a key just because a different private remote knows it', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'base.md'),'safe');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD').trim()
  git('remote','add','public','https://example.invalid/public.git');git('update-ref','refs/remotes/public/main',base)
  writeFileSync(join(dir,'secret.ts'),`const apiKey = "${canary()}"\n`);git('add','.');git('commit','-qm','key');const tip=git('rev-parse','HEAD').trim()
  git('update-ref','refs/remotes/private/main',tip)
  const r=spawnSync(process.execPath,[guard,'--pre-push','public','https://example.invalid/public.git'],{cwd:dir,input:`refs/heads/topic ${tip} refs/heads/topic ${'0'.repeat(40)}\n`,encoding:'utf8'})
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/)
}))

test('a divergent push URL never trusts fetch-remote history', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'secret.ts'),`const apiKey = "${canary()}"\n`);git('add','.');git('commit','-qm','key');const tip=git('rev-parse','HEAD').trim()
  git('remote','add','origin','https://example.invalid/private.git');git('update-ref','refs/remotes/origin/main',tip)
  const r=spawnSync(process.execPath,[guard,'--pre-push','origin','https://example.invalid/public.git'],{cwd:dir,input:`refs/heads/topic ${tip} refs/heads/topic ${'0'.repeat(40)}\n`,encoding:'utf8'})
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/)
}))
test('the actual pre-commit hook prevents creating a secret-bearing commit', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','baseline');const before=git('rev-parse','HEAD').trim()
  mkdirSync(join(dir,'scripts'))
  for(const name of ['secret-guard.mjs','security-tool.mjs']) copyFileSync(resolve('scripts',name),join(dir,'scripts',name))
  copyFileSync(resolve('.gitleaks.toml'),join(dir,'.gitleaks.toml'))
  git('config','core.hooksPath',resolve('.githooks'))
  writeFileSync(join(dir,'secret.ts'),`const apiKey = "${canary()}"\n`);git('add','secret.ts')
  const r=spawnSync('git',['commit','-m','must be blocked'],{cwd:dir,encoding:'utf8'})
  assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/secret:/)
  assert.equal(git('rev-parse','HEAD').trim(),before)
  assert.ok(!(r.stdout+r.stderr).includes(canary()))
}))
test('commit-message-only keys are detected in ranges and outgoing branches', () => repo(({dir,git,scan}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD').trim()
  git('commit','--allow-empty','-qm',`apiKey = ${canary()}`);const tip=git('rev-parse','HEAD').trim()
  const r=scan('--range',`${base}..${tip}`);assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/);assert.ok(!(r.stdout+r.stderr).includes(canary()))
  const push=spawnSync(process.execPath,[guard,'--pre-push'],{cwd:dir,input:`refs/heads/topic ${tip} refs/heads/topic ${base}\n`,encoding:'utf8'})
  assert.equal(push.status,1);assert.match(push.stdout+push.stderr,/secret:/)
}))
test('annotated tag messages, including nested tags, are scanned before push', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','base')
  git('tag','-a','unsafe','-m',`apiKey = ${canary()}`);git('tag','-a','outer','unsafe','-m','outer fixture')
  const tip=git('rev-parse','outer').trim()
  const r=spawnSync(process.execPath,[guard,'--pre-push'],{cwd:dir,input:`refs/tags/outer ${tip} refs/tags/outer ${'0'.repeat(40)}\n`,encoding:'utf8'})
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/);assert.ok(!(r.stdout+r.stderr).includes(canary()))
}))
test('commit-msg hook rejects message-only keys after pre-commit passed', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','base');const before=git('rev-parse','HEAD').trim()
  mkdirSync(join(dir,'scripts'))
  for(const name of ['secret-guard.mjs','security-tool.mjs']) copyFileSync(resolve('scripts',name),join(dir,'scripts',name))
  copyFileSync(resolve('.gitleaks.toml'),join(dir,'.gitleaks.toml'));git('config','core.hooksPath',resolve('.githooks'))
  const r=spawnSync('git',['commit','--allow-empty','-m',`apiKey = ${canary()}`],{cwd:dir,encoding:'utf8'})
  assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/secret:/);assert.equal(git('rev-parse','HEAD').trim(),before)
  assert.ok(!(r.stdout+r.stderr).includes(canary()))
}))
test('new-ref and manual CI without a base scan deleted secrets in reachable history', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'file.ts'),'safe');git('add','.');git('commit','-qm','base')
  writeFileSync(join(dir,'file.ts'),`const apiKey = "${canary()}"`);git('commit','-qam','unsafe')
  writeFileSync(join(dir,'file.ts'),'safe again');git('commit','-qam','removed')
  for(const base of ['', '0'.repeat(40)]) {
    const r=spawnSync(process.execPath,[guard,'--ci'],{cwd:dir,encoding:'utf8',env:{...process.env,DAWN_SCAN_BASE:base,DAWN_SCAN_REF:''}})
    assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/);assert.ok(!(r.stdout+r.stderr).includes(canary()))
  }
}))
test('CI also scans the annotation of a tagged commit', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD').trim()
  git('tag','-a','unsafe','-m',`apiKey = ${canary()}`)
  const r=spawnSync(process.execPath,[guard,'--ci'],{cwd:dir,encoding:'utf8',env:{...process.env,DAWN_SCAN_BASE:base,DAWN_SCAN_REF:'refs/tags/unsafe'}})
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/)
}))
test('reports never echo a credential-bearing filename in any provider format', () => repo(({dir,git,scan}) => {
  const pat=['ghp','8aJd6eXc1Kp3Mz7Qw2Rs4Tv5Bn9Lf0Yu6Ei7Op8D'].join('_')
  const filename=`${pat}.ts`;writeFileSync(join(dir,filename),`const token = "${pat}"`);git('add','.')
  const r=scan('--staged');assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/)
  assert.ok(!(r.stdout+r.stderr).includes(pat));assert.ok(!(r.stdout+r.stderr).includes(filename))
}))
test('a key solely in an empty filename is blocked', () => repo(({dir,git,scan}) => {
  writeFileSync(join(dir,canary()+'.txt'),'');git('add','.')
  const r=scan('--staged');assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/);assert.ok(!(r.stdout+r.stderr).includes(canary()))
}))
test('commit author metadata is checked without echoing the author', () => repo(({dir,git,scan}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD').trim()
  git('commit','--allow-empty','--author',`${canary()} <fixture@example.invalid>`,'-qm','safe message')
  const r=scan('--range',`${base}..${git('rev-parse','HEAD').trim()}`)
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/);assert.ok(!(r.stdout+r.stderr).includes(canary()))
}))
test('keys in pushed ref names are blocked but deletion is allowed', () => repo(({dir,git}) => {
  writeFileSync(join(dir,'safe.md'),'fixture');git('add','.');git('commit','-qm','base');const tip=git('rev-parse','HEAD').trim()
  const ref='refs/tags/'+canary()
  const r=spawnSync(process.execPath,[guard,'--pre-push'],{cwd:dir,encoding:'utf8',input:`${ref} ${tip} ${ref} ${'0'.repeat(40)}\n`})
  assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/secret:/);assert.ok(!(r.stdout+r.stderr).includes(canary()))
  const deletion=spawnSync(process.execPath,[guard,'--pre-push'],{cwd:dir,encoding:'utf8',input:`(delete) ${'0'.repeat(40)} ${ref} ${tip}\n`})
  assert.equal(deletion.status,0)
}))
