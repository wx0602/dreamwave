const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const miniRoot = path.join(projectRoot, "miniprogram");
const errors = [];
const declaredRoutes = new Set();
const forbiddenLegacyPaths = [
  "connected-android-alliance",
  "android-alliance",
  "core_api_call_package",
  "core_api_call_package.zip",
  "app-debug.apk",
];

for (const legacyPath of forbiddenLegacyPaths) {
  if (fs.existsSync(path.join(projectRoot, legacyPath))) errors.push(`legacy Android artifact still exists: ${legacyPath}`);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(projectRoot, file)}: ${error.message}`);
    return null;
  }
}

function assertFile(relativePath) {
  const file = path.join(miniRoot, relativePath);
  if (!fs.existsSync(file)) errors.push(`missing: miniprogram/${relativePath.replace(/\\/g, "/")}`);
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(item));
    else files.push(item);
  }
  return files;
}

function assertNavigationTarget(sourceFile, target) {
  if (!target || !target.startsWith("/")) return;
  const pagePath = target.slice(1).split("?")[0];
  const routeFile = path.join(miniRoot, `${pagePath}.js`);
  if (!fs.existsSync(routeFile)) {
    errors.push(`missing navigation target in ${path.relative(projectRoot, sourceFile)}: ${target}`);
  } else if (declaredRoutes.size && !declaredRoutes.has(pagePath)) {
    errors.push(`undeclared navigation target in ${path.relative(projectRoot, sourceFile)}: ${target}`);
  }
}

function collectPageMethods(source) {
  const methods = new Set();
  const pageStart = source.indexOf("Page({");
  if (pageStart < 0) return methods;
  const pageSource = source.slice(pageStart);
  for (const match of pageSource.matchAll(/(?:^|[,{}]\s*)(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)) {
    methods.add(match[1]);
  }
  return methods;
}

const appJson = readJson(path.join(miniRoot, "app.json"));
if (appJson) {
  const routes = [...(appJson.pages || [])];
  for (const pkg of appJson.subpackages || []) {
    for (const page of pkg.pages || []) routes.push(`${pkg.root}/${page}`);
  }
  for (const route of routes) {
    declaredRoutes.add(route);
    for (const extension of ["js", "json", "wxml", "wxss"]) assertFile(`${route}.${extension}`);
  }
  for (const item of (appJson.tabBar && appJson.tabBar.list) || []) {
    assertFile(item.iconPath);
    assertFile(item.selectedIconPath);
  }
}

for (const file of fs.readdirSync(path.join(miniRoot, "services"))) {
  if (file.endsWith(".js")) require(path.join(miniRoot, "services", file));
}

for (const file of walk(miniRoot)) {
  if (file.endsWith(".json")) readJson(file);
  if (file.endsWith(".js")) {
    const source = fs.readFileSync(file, "utf8");
    try {
      new vm.Script(source, { filename: file });
    } catch (error) {
      errors.push(`${path.relative(projectRoot, file)}: ${error.message}`);
    }
    for (const match of source.matchAll(/require\(["']([^"']+)["']\)/g)) {
      if (!match[1].startsWith(".")) continue;
      const target = path.resolve(path.dirname(file), match[1]);
      const candidates = [target, `${target}.js`, `${target}.json`, path.join(target, "index.js")];
      if (!candidates.some((candidate) => fs.existsSync(candidate))) {
        errors.push(`unresolved require in ${path.relative(projectRoot, file)}: ${match[1]}`);
      }
    }
    for (const match of source.matchAll(/url\s*:\s*["'](\/[^"']+)["']/g)) {
      assertNavigationTarget(file, match[1]);
    }
    for (const match of source.matchAll(/url\s*:\s*`(\/[^`$]+)(?:\?[^`]*)?`/g)) {
      assertNavigationTarget(file, match[1]);
    }
  }
}

const apiSource = fs.readFileSync(path.join(miniRoot, "services", "api.js"), "utf8");
if (!apiSource.includes("wx.cloud.callContainer")) errors.push("services/api.js must use wx.cloud.callContainer");
if (!apiSource.includes("error.code =")) errors.push("services/api.js must preserve structured business error codes");
const completionSource = fs.readFileSync(path.join(miniRoot, "features", "adventure", "completion", "index.js"), "utf8");
if (!/skipSummary\(\)\s*\{\s*return this\.submitSummary\(""\)/.test(completionSource)) errors.push("completion skip action must submit an empty summary");
if (/const STAGES|setInterval\(/.test(completionSource)) errors.push("completion page must not simulate settlement progress");
const sourceSelectSource = fs.readFileSync(path.join(miniRoot, "features", "account", "source-select", "index.js"), "utf8");
if (!sourceSelectSource.includes("onShow()") || !sourceSelectSource.includes("bundle.bundleId === selectedBundleId")) errors.push("source selection must refresh revisions and update visual selection");
for (const file of walk(miniRoot).filter((item) => item.endsWith(".js"))) {
  if (file === path.join(miniRoot, "services", "api.js")) continue;
  const source = fs.readFileSync(file, "utf8");
  if (/wx\.(request|uploadFile|downloadFile)\s*\(|wx\.cloud\.callContainer\s*\(/.test(source)) {
    errors.push(`network call outside services/api.js: ${path.relative(projectRoot, file)}`);
  }
}
const textFiles = walk(miniRoot).filter((file) => /\.(js|json|wxml|wxss)$/.test(file));
for (const file of textFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (/sk-[A-Za-z0-9_-]{12,}|DEEPSEEK_API_KEY\s*[:=]\s*["'][^"']+/.test(source)) {
    errors.push(`Secret-like value found in ${path.relative(projectRoot, file)}`);
  }
  for (const match of source.matchAll(/(?:src=|url\()["']?\/?([^"')]+\.(?:png|jpg|jpeg))/g)) {
    const asset = path.join(miniRoot, match[1].replace(/\//g, path.sep));
    if (!fs.existsSync(asset)) errors.push(`missing asset referenced by ${path.relative(projectRoot, file)}: ${match[1]}`);
  }
}

for (const wxmlFile of walk(miniRoot).filter((file) => file.endsWith(".wxml"))) {
  const jsFile = wxmlFile.replace(/\.wxml$/, ".js");
  if (!fs.existsSync(jsFile)) continue;
  const handlers = new Set();
  const wxml = fs.readFileSync(wxmlFile, "utf8");
  for (const match of wxml.matchAll(/\b(?:bind|catch)(?:tap|input|change|confirm|longpress|touchstart|touchend)=["']([A-Za-z_$][\w$]*)["']/g)) {
    handlers.add(match[1]);
  }
  const methods = collectPageMethods(fs.readFileSync(jsFile, "utf8"));
  for (const handler of handlers) {
    if (!methods.has(handler)) errors.push(`missing handler ${handler} for ${path.relative(projectRoot, wxmlFile)}`);
  }
}

const packageBytes = walk(miniRoot).reduce((total, file) => total + fs.statSync(file).size, 0);
const appPackageAssets = ["app.js", "app.json", "app.wxss", "sitemap.json", "config", "services", "utils", "assets", "pages"];
const mainPackageFiles = appPackageAssets.flatMap((item) => {
  const target = path.join(miniRoot, item);
  if (!fs.existsSync(target)) return [];
  return fs.statSync(target).isDirectory() ? walk(target) : [target];
});
const mainPackageBytes = mainPackageFiles.reduce((total, file) => total + fs.statSync(file).size, 0);
if (mainPackageBytes > 2 * 1024 * 1024) errors.push(`main package exceeds 2 MiB: ${mainPackageBytes} bytes`);
if (packageBytes > 20 * 1024 * 1024) errors.push(`total package exceeds 20 MiB: ${packageBytes} bytes`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Mini program validation passed.");
