import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const storefrontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellPath = path.join(storefrontRoot, 'src/components/storefront-shell.tsx');
const homePath = path.join(storefrontRoot, 'src/pages/home.tsx');
const stylesPath = path.join(storefrontRoot, 'src/index.css');
const logoPath = path.join(storefrontRoot, 'public/milmarts-wordmark.png');

const [shell, home, styles, logo] = await Promise.all([
  readFile(shellPath, 'utf8'),
  readFile(homePath, 'utf8'),
  readFile(stylesPath, 'utf8'),
  readFile(logoPath, 'utf8'),
]);

const logoMarkup = /<img\s+src="(\/milmarts-wordmark\.png)"\s+alt="([^"]+)"\s+className="brand-logo brand-logo--header"\s*\/>/u.exec(shell);
assert.ok(logoMarkup, 'the storefront header must render the branded logo image');
assert.equal(logoMarkup[1], '/milmarts-wordmark.png', 'the header logo must use the public wordmark asset');
assert.ok(logoMarkup[2].trim(), 'the header logo must have a non-empty accessible alt text');

assert.match(styles, /\.brand-logo\s*\{[\s\S]*?display:\s*block;[\s\S]*?height:\s*auto;/u, 'the shared logo styles must keep the logo visible');

const desktopWidth = /\.brand-logo--header\s*\{[\s\S]*?width:\s*(\d+)px;/u.exec(styles);
assert.ok(desktopWidth, 'the header must define a desktop logo width');
assert.ok(Number(desktopWidth[1]) > 0, 'the desktop logo width must be greater than zero');

const mobileRules = /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.brand-logo--header\s*\{[\s\S]*?width:\s*(\d+)px;/u.exec(styles);
assert.ok(mobileRules, 'the header must define a mobile logo width');
assert.ok(Number(mobileRules[1]) > 0, 'the mobile logo width must be greater than zero');
assert.notEqual(
  desktopWidth[1],
  mobileRules[1],
  'desktop and mobile headers must retain distinct responsive logo treatments',
);

const mobileMenuButton = /<button\s+className="focus-ring market-menu-button md:hidden"\s+type="button"\s+onClick=\{\(\) => setMobileOpen\(!mobileOpen\)\}\s+aria-label=\{mobileOpen \? 'Close menu' : 'Open menu'\}\s+aria-expanded=\{mobileOpen\}\s+aria-controls="mobile-navigation"\s+data-testid="button-mobile-menu">/u;
assert.match(shell, mobileMenuButton, 'the header must provide an accessible mobile menu toggle');

const mobileMenu = /mobileOpen && \(\s*<nav id="mobile-navigation" className="market-mobile-nav md:hidden" aria-label="Mobile navigation">([\s\S]*?)<\/nav>\s*\)/u.exec(shell);
assert.ok(mobileMenu, 'the mobile navigation must render when the menu is open');
assert.match(mobileMenu[1], /MOBILE_NAV_LINKS\.map/u, 'the mobile navigation must render its primary links');
assert.match(mobileMenu[1], /href=\{link\.href\}/u, 'mobile navigation links must use their configured destinations');
assert.match(mobileMenu[1], /onClick=\{\(event\) => handleSectionNavigation\(event, link\.href\)\}/u, 'selecting a mobile navigation link must use the shared navigation handler');

const mobileNavLabels = [...shell.matchAll(/\{ label: '([^']+)', href: '([^']+)' \}/gu)]
  .filter(([, label]) => ['Shop all', 'New in', 'Our edit'].includes(label))
  .map(([, label, href]) => `${label}:${href}`);
assert.deepEqual(
  mobileNavLabels,
  ['Shop all:/shop', 'New in:/#new-in', 'Our edit:/#our-edit'],
  'mobile navigation must expose Shop all, New in, and Our edit in order',
);

assert.match(home, /<section className="market-section market-flash-section" id="new-in">/u, 'the homepage must expose the new-in section target');
assert.match(home, /<section className="market-section market-benefits-section" id="our-edit">/u, 'the homepage must expose the our-edit section target');
assert.match(shell, /function scrollToSection\(sectionId: string\)[\s\S]*?scrollIntoView/u, 'section navigation must scroll to the requested homepage target');
assert.match(shell, /event\.preventDefault\(\);[\s\S]*?setLocation\(href\);[\s\S]*?scrollToSection\(sectionId\);/u, 'section navigation must route home and scroll after leaving a non-home page');
assert.match(shell, /<Link href="\/#our-edit" onClick=\{\(event\) => handleSectionNavigation\(event, '\/#our-edit'\)\}>Our edit<\/Link>/u, 'the footer Our edit link must use section navigation');
assert.match(shell, /<Link href="\/#new-in" onClick=\{\(event\) => handleSectionNavigation\(event, '\/#new-in'\)\}>New arrivals<\/Link>/u, 'the footer New arrivals link must use section navigation');

assert.ok(logo.length > 100, 'the wordmark asset must contain image data');

const nonHomeRoutes = ['/shop', '/cart'];
const port = await getFreePort();
const preview = spawn(
  'pnpm',
  ['exec', 'vite', 'preview', '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', String(port)],
  {
    cwd: storefrontRoot,
    env: { ...process.env, BASE_PATH: '/', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

try {
  await waitForServer(`http://127.0.0.1:${port}/`);

  const [pageResponse, logoResponse, ...nonHomeResponses] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/`),
    fetch(`http://127.0.0.1:${port}/milmarts-wordmark.png`),
    ...nonHomeRoutes.map((route) => fetch(`http://127.0.0.1:${port}${route}`)),
  ]);

  assert.equal(pageResponse.status, 200, 'the storefront shell must load successfully');
  assert.equal(logoResponse.status, 200, 'the wordmark asset must load successfully');
  nonHomeResponses.forEach((response, index) => {
    assert.equal(response.status, 200, `the ${nonHomeRoutes[index]} entry route must load successfully`);
  });
  assert.match(
    logoResponse.headers.get('content-type') ?? '',
    /image\/png/u,
    'the wordmark asset must be served as PNG',
  );
} finally {
  preview.kill('SIGTERM');
}

console.log(
  `Header smoke check passed: logo loads, responsive widths are ${desktopWidth[1]}px desktop / ${mobileRules[1]}px mobile, and mobile navigation exposes its three primary links.`,
);

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not determine a free port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for storefront preview at ${url}`);
}