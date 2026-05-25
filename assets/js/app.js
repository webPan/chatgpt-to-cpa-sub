// depends on: utils.js, token.js, converter.js, export.js

function converterApp() {
  return {
    source: "",
    mode: "normalize",
    dragging: false,
    fileName: "未选择文件",
    formatLabel: "等待输入",
    recordCount: 0,
    backfillCount: 0,
    outputText: "",
    outputName: "",
    outputMime: "text/plain;charset=utf-8",
    outputParts: [],
    meta: "尚未生成",
    error: "",
    copyLabel: "复制",
    summary: "还没有输出。确认识别结果正确后再执行转换。",
    shapeText: "<code class=\"font-mono\">normalize</code> 下载 unified JSONL，<code class=\"font-mono\">to-sub</code> 下载 bundle JSON，多账号 <code class=\"font-mono\">to-cpa</code> 自动打包为 <code class=\"font-mono\">.tar</code>，压缩包内每个账号单独一个 JSON。导出文件名为 <code class=\"font-mono\">数量_YYYYMMDD_HHmmss</code>。",

    init() {
      this.updateDetection();
      const refreshIcons = () => window.lucide?.createIcons?.();
      requestAnimationFrame(refreshIcons);
      window.addEventListener("load", refreshIcons, { once: true });
    },

    syncMode() {},

    updateDetection() {
      if (!this.source.trim()) {
        this.formatLabel = "等待输入";
        this.recordCount = 0;
        this.backfillCount = 0;
        this.error = "";
        return;
      }
      try {
        const parsed = normalizeRecordsFromText(this.source);
        this.formatLabel = parsed.shape;
        this.recordCount = parsed.records.length;
        this.backfillCount = parsed.pending;
        this.error = "";
      } catch (error) {
        this.formatLabel = "解析失败";
        this.recordCount = 0;
        this.backfillCount = 0;
        this.error = error instanceof Error ? error.message : String(error);
      }
    },

    renderOutput(result) {
      this.outputText = result.text;
      this.outputName = result.name;
      this.outputMime = result.mime;
      this.outputParts = result.parts || [result.text];
      this.meta = `${result.name} | ${result.text.length.toLocaleString()} 字符预览`;
      this.summary = result.summary;
      this.shapeText = result.shape;
      this.copyLabel = "复制";
    },

    convert() {
      try {
        const parsed = normalizeRecordsFromText(this.source);
        const result = buildOutput(parsed.records, this.mode);
        this.renderOutput(result);
        this.error = "";
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },

    clearAll() {
      this.source = "";
      this.fileName = "未选择文件";
      this.outputText = "";
      this.outputName = "";
      this.outputParts = [];
      this.meta = "尚未生成";
      this.summary = "还没有输出。确认识别结果正确后再执行转换。";
      this.shapeText = "<code class=\"font-mono\">normalize</code> 下载 unified JSONL，<code class=\"font-mono\">to-sub</code> 下载 bundle JSON，多账号 <code class=\"font-mono\">to-cpa</code> 自动打包为 <code class=\"font-mono\">.tar</code>，压缩包内每个账号单独一个 JSON。导出文件名为 <code class=\"font-mono\">数量_YYYYMMDD_HHmmss</code>。";
      this.copyLabel = "复制";
      if (this.$refs.file) this.$refs.file.value = "";
      this.updateDetection();
    },

    async loadFile(file) {
      const text = await file.text();
      this.source = text;
      this.fileName = file?.name || "未选择文件";
      this.updateDetection();
    },

    async handleFileSelect(event) {
      const [file] = event.target.files || [];
      if (file) await this.loadFile(file);
    },

    handleDrop(event) {
      this.dragging = false;
      const [file] = event.dataTransfer?.files || [];
      if (file) this.loadFile(file).catch(error => { this.error = error instanceof Error ? error.message : String(error); });
    },

    async copyOutput() {
      if (!this.outputText) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(this.outputText);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = this.outputText;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }
        this.copyLabel = "已复制";
        setTimeout(() => { this.copyLabel = "复制"; }, 1200);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },

    downloadOutput() {
      if (!this.outputText) return;
      const blob = new Blob(this.outputParts.length ? this.outputParts : [this.outputText], { type: this.outputMime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = this.outputName || "output.txt";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  };
}
