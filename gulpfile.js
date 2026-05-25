import gulp from "gulp";
import concat from "gulp-concat";
import obfuscator from "gulp-javascript-obfuscator";
import rename from "gulp-rename";
import cleanCSS from "gulp-clean-css";
import { deleteAsync } from "del";
import { Transform } from "stream";

// ─── 环境标志（dev / prod） ────────────────────────────────────────────────────
//   gulp dev   → 不混淆、不压缩，便于调试
//   gulp build → 混淆 + 压缩，用于生产部署

let isProd = false;

export function setProd(done) {
  isProd = true;
  done();
}

// ─── 路径配置 ──────────────────────────────────────────────────────────────────

const paths = {
  // 按依赖顺序排列：utils → token → converter → export → app
  js: [
    "assets/js/utils.js",
    "assets/js/token.js",
    "assets/js/converter.js",
    "assets/js/export.js",
    "assets/js/app.js",
  ],
  tailwindConfig: "assets/js/tailwind.config.js",
  css:    "assets/css/app.css",
  images: "assets/images/**/*",
  html:   "index.html",
  vendor: "assets/vendor/**/*",
  dist:   "dist/",
};

// ─── 清理输出目录 ──────────────────────────────────────────────────────────────

export function clean() {
  return deleteAsync([paths.dist]);
}

// ─── JS：合并，生产环境额外混淆 ───────────────────────────────────────────────────

export function buildJS() {
  let stream = gulp.src(paths.js).pipe(concat("app.bundle.js"));

  if (isProd) {
    stream = stream
      .pipe(
        obfuscator({
          compact: true,
          controlFlowFlattening: false,    // 开启会大幅增加体积
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: false,
          identifierNamesGenerator: "hexadecimal",
          log: false,
          numbersToExpressions: true,
          renameGlobals: false,            // 保留全局函数名，避免 Alpine x-data 失效
          selfDefending: false,
          simplify: true,
          splitStrings: true,
          splitStringsChunkLength: 10,
          stringArray: true,
          stringArrayCallsTransform: true,
          stringArrayEncoding: ["base64"],
          stringArrayIndexShift: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayWrappersCount: 1,
          stringArrayWrappersType: "variable",
          stringArrayThreshold: 0.75,
          transformObjectKeys: false,
          unicodeEscapeSequence: false,
        })
      )
      .pipe(rename({ suffix: ".min" }));
  }

  return stream.pipe(gulp.dest(paths.dist + "js/"));
}

// ─── CSS：生产环境压缩，开发环境直接复制 ───────────────────────────────────────────

export function buildCSS() {
  let stream = gulp.src(paths.css);

  if (isProd) {
    stream = stream
      .pipe(cleanCSS({ level: 2 }))
      .pipe(rename({ suffix: ".min" }));
  }

  return stream.pipe(gulp.dest(paths.dist + "css/"));
}

// ─── Tailwind 配置：直接复制（供 Tailwind CDN 读取，不参与混淆） ───────────────────

export function copyTailwindConfig() {
  return gulp.src(paths.tailwindConfig).pipe(gulp.dest(paths.dist + "js/"));
}

// ─── Vendor：直接复制（第三方库不混淆） ───────────────────────────────────────────

export function copyVendor() {
  return gulp.src(paths.vendor).pipe(gulp.dest(paths.dist + "vendor/"));
}

// ─── Images：直接复制 ─────────────────────────────────────────────────────────

export function copyImages() {
  return gulp
    .src(paths.images, { encoding: false })
    .pipe(gulp.dest(paths.dist + "images/", { encoding: false }));
}

// ─── HTML：重写资源路径后输出到 dist/ ─────────────────────────────────────────────
//   源文件使用 ./assets/ 路径（可直接在项目根目录开发预览）
//   dist/index.html 的路径统一改为相对于 dist/ 目录

export function buildHTML() {
  const jsSrc = isProd ? "./js/app.bundle.min.js" : "./js/app.bundle.js";
  const cssSrc = isProd ? "./css/app.min.css"     : "./css/app.css";

  return gulp
    .src(paths.html)
    .pipe(
      new Transform({
        objectMode: true,
        transform(file, _enc, cb) {
          let html = file.contents.toString();

          // vendor 路径
          html = html.replaceAll("./assets/vendor/", "./vendor/");

          // Tailwind 配置路径
          html = html.replace(
            `./assets/js/tailwind.config.js`,
            `./js/tailwind.config.js`
          );

          // CSS link 标签
          html = html.replace(
            `<link rel="stylesheet" href="./assets/css/app.css">`,
            `<link rel="stylesheet" href="${cssSrc}">`
          );

          // 图片路径
          html = html.replaceAll("./assets/images/", "./images/");

          // 将末尾 5 个独立 script 标签替换为单一 bundle
          html = html.replace(
            /[ \t]*<script src="\.\/assets\/js\/utils\.js"><\/script>\s*\n[\s\S]*?<script src="\.\/assets\/js\/app\.js"><\/script>/,
            `  <script src="${jsSrc}"></script>`
          );

          file.contents = Buffer.from(html);
          cb(null, file);
        },
      })
    )
    .pipe(gulp.dest(paths.dist));
}

// ─── 组合任务 ──────────────────────────────────────────────────────────────────

const assets = () =>
  gulp.parallel(buildJS, buildCSS, buildHTML, copyTailwindConfig, copyVendor, copyImages);

/** 开发构建：不混淆，快速，输出到 dist/ */
export const dev = gulp.series(clean, assets());

/** 生产构建：混淆 + 压缩，输出到 dist/ */
export const build = gulp.series(setProd, clean, assets());

/** 监听（开发模式） */
export function watch() {
  gulp.watch(paths.js,            buildJS);
  gulp.watch(paths.tailwindConfig, copyTailwindConfig);
  gulp.watch(paths.css,           buildCSS);
  gulp.watch(paths.html,          buildHTML);
  gulp.watch(paths.vendor,        copyVendor);
  gulp.watch(paths.images,        copyImages);
}

export const watchDev = gulp.series(dev, watch);

export default build;
