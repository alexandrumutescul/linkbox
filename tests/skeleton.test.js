const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(3000, () => req.destroy(new Error(`Timed out requesting ${pathname}`)));
    req.on('error', reject);
  });
}

async function waitForServer(port, child) {
  const deadline = Date.now() + 5000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await request(port, '/');
      if (res.statusCode === 200) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw lastError || new Error('server did not start before timeout');
}

async function withStartedServer(t, callback) {
  const port = await getFreePort();
  const child = spawn('npm', ['start'], {
    cwd: repoRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM');
  });
  await waitForServer(port, child);
  return callback({ port, child, getOutput: () => ({ stdout, stderr }) });
}

test('package metadata declares the expected runtime entry point and locked dependencies', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.main, 'server/index.js');
  assert.equal(pkg.scripts.start, 'node server/index.js');
  assert.match(pkg.dependencies.express, /^\^4\.18\.0$/);
  assert.match(pkg.dependencies['better-sqlite3'], /^\^9\.0\.0$/);

  const lock = readJson('package-lock.json');
  assert.equal(lock.packages[''].dependencies.express, pkg.dependencies.express);
  assert.equal(lock.packages[''].dependencies['better-sqlite3'], pkg.dependencies['better-sqlite3']);
  assert.ok(lock.packages['node_modules/express'].version.startsWith('4.'), 'lockfile should resolve Express 4');
  assert.ok(lock.packages['node_modules/better-sqlite3'].version.startsWith('9.'), 'lockfile should resolve better-sqlite3 9');
});

test('npm start honors a custom PORT and serves the public starter page plus root-relative assets', async (t) => {
  await withStartedServer(t, async ({ port, getOutput }) => {
    const html = await request(port, '/');
    assert.equal(html.statusCode, 200);
    assert.match(html.headers['content-type'], /text\/html/);
    assert.match(html.body, /<title>Linkbox<\/title>/);
    assert.match(html.body, /href="\/style\.css"/);
    assert.match(html.body, /src="\/app\.js"/);
    assert.match(html.body, /Your bookmark box is ready\./);

    const css = await request(port, '/style.css');
    assert.equal(css.statusCode, 200);
    assert.match(css.headers['content-type'], /text\/css/);
    assert.match(css.body, /\.shell/);
    assert.match(css.body, /Frontend|status|background/);

    const js = await request(port, '/app.js');
    assert.equal(js.statusCode, 200);
    assert.match(js.headers['content-type'], /javascript/);
    assert.match(js.body, /Frontend JavaScript loaded successfully\./);
    assert.match(js.body, /dataset\.loaded/);

    const { stdout, stderr } = getOutput();
    assert.match(stdout, new RegExp(`localhost:${port}`));
    assert.equal(stderr, '');
  });
});

test('.gitignore ignores dependency and runtime data contents while preserving data/.gitkeep', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, 'data/.gitkeep')), 'data/.gitkeep should exist');

  for (const ignoredPath of ['node_modules/example-package/index.js', 'data/linkbox.sqlite', 'data/nested/runtime.db']) {
    const result = spawnSync('git', ['check-ignore', '--quiet', ignoredPath], { cwd: repoRoot });
    assert.equal(result.status, 0, `${ignoredPath} should be ignored`);
  }

  const gitkeep = spawnSync('git', ['check-ignore', '--quiet', 'data/.gitkeep'], { cwd: repoRoot });
  assert.notEqual(gitkeep.status, 0, 'data/.gitkeep should not be ignored');
});
