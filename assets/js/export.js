// depends on: utils.js, token.js, converter.js

// ─── TAR archive builder ──────────────────────────────────────────────────────
function createTarArchive(files) {
  function put(dst, offset, text) {
    const bytes = te.encode(String(text ?? ""));
    dst.set(bytes.slice(0, Math.max(0, dst.length - offset)), offset);
  }
  function oct(value, length) {
    const text = Math.max(0, Math.trunc(value)).toString(8);
    return `${text}`.padStart(length - 1, "0") + "\0";
  }
  function checksum(header) {
    let sum = 0;
    for (const byte of header) sum += byte;
    return `${sum.toString(8).padStart(6, "0")}\0 `;
  }

  const blocks = [];
  for (const file of files) {
    const name = sanitizeFilename(file.name, "file.json").slice(0, 99);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : te.encode(String(file.text ?? ""));
    const header = new Uint8Array(512);
    put(header, 0, name);
    put(header, 100, "0000777\0");
    put(header, 108, "0000000\0");
    put(header, 116, "0000000\0");
    put(header, 124, oct(bytes.length, 12));
    put(header, 136, oct(Math.trunc(Date.now() / 1000), 12));
    put(header, 148, "        ");
    put(header, 156, "0");
    put(header, 257, "ustar\0");
    put(header, 263, "00");
    put(header, 148, checksum(header));
    blocks.push(header, bytes);
    const pad = (512 - (bytes.length % 512)) % 512;
    if (pad) blocks.push(new Uint8Array(pad));
  }
  blocks.push(new Uint8Array(1024));

  const total = blocks.reduce((size, block) => size + block.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) { output.set(block, offset); offset += block.length; }
  return output;
}

// ─── Output payload builders ──────────────────────────────────────────────────
function buildCpaPayload(record, options = {}) {
  const item = finalizeRecord(record);
  const exp = coerceTs(decodeJwtPayload(item.access_token).exp);
  const payload = {
    type: "codex",
    email: item.email,
    expired: exp ? toIso8(new Date(exp * 1000)) : "",
    id_token: item.id_token,
    account_id: firstText(item.chatgpt_account_id),
    disabled: Boolean(item.disabled),
    access_token: item.access_token,
    last_refresh: toIso8(new Date()),
    refresh_token: item.refresh_token
  };
  if (options.cpaSupportsWss) payload.websockets = true;
  return payload;
}

function buildSubAccount(record) {
  const item = finalizeRecord(record);
  let exp = coerceTs(decodeJwtPayload(item.access_token).exp);
  if (!exp) exp = Math.trunc(Date.now() / 1000) + 863999;
  return {
    name: item.email,
    platform: "openai",
    type: "oauth",
    credentials: {
      access_token: item.access_token,
      chatgpt_account_id: item.chatgpt_account_id,
      chatgpt_user_id: item.chatgpt_user_id,
      client_id: firstText(item.client_id, DEFAULT_CLIENT_ID),
      email: item.email,
      expires_at: exp,
      id_token: item.id_token,
      organization_id: item.organization_id,
      plan_type: firstText(item.plan_type, "free"),
      refresh_token: item.refresh_token
    },
    extra: {
      email: item.email,
      openai_oauth_responses_websockets_v2_enabled: Boolean(item.openai_oauth_responses_websockets_v2_enabled),
      openai_oauth_responses_websockets_v2_mode: firstText(item.openai_oauth_responses_websockets_v2_mode, "off"),
      privacy_mode: firstText(item.privacy_mode, DEFAULT_PRIVACY_MODE)
    },
    concurrency: 10,
    priority: 1,
    rate_multiplier: 1,
    auto_pause_on_expired: true
  };
}

// ─── Main output builder ──────────────────────────────────────────────────────
function buildOutput(records, mode, options = {}) {
  if (!records.length) throw new Error("当前输入里没有解析出有效记录。");

  if (mode === "normalize") {
    const lines = records.map(record => JSON.stringify(record));
    const text = `${lines.join("\n")}${lines.length ? "\n" : ""}`;
    return {
      text, parts: [text],
      name: exportFileName(records.length, "jsonl"),
      mime: "application/json;charset=utf-8",
      summary: `已标准化 ${records.length} 条记录，输出 unified JSONL。`,
      shape: "输出为 unified JSONL，保留显式账号字段，且不包含 model_mapping。"
    };
  }

  if (mode === "to-cpa") {
    const payloads = records.map(record => buildCpaPayload(record, options));
    if (payloads.length === 1) {
      const text = JSON.stringify(payloads[0], null, 2);
      return {
        text, parts: [text],
        name: exportFileName(1, "json"),
        mime: "application/json;charset=utf-8",
        summary: "已生成 1 个 CPA token JSON。",
        shape: "输出为单个 CPA JSON 文件。"
      };
    }
    const stamp = formatExportTimestamp();
    const files = payloads.map(payload => ({ name: `${sanitizeFilename(payload.email, "account")}.json`, text: JSON.stringify(payload, null, 2) }));
    const tarBytes = createTarArchive(files);
    const previewLines = ["CPA .tar 包内文件：", ...files.map(file => `- ${file.name}`)];
    return {
      text: previewLines.join("\n"),
      parts: [tarBytes],
      name: exportFileName(payloads.length, "tar", stamp),
      mime: "application/x-tar",
      summary: `已生成 1 个 CPA tar 压缩包，包含 ${files.length} 个单账号 JSON 文件。`,
      shape: "CPA 多账号会自动打包为 .tar，压缩包内每个账号单独一个 JSON 文件。"
    };
  }

  if (mode === "to-sub") {
    const bundle = { exported_at: new Date().toISOString(), proxies: [], accounts: records.map(buildSubAccount) };
    const text = JSON.stringify(bundle, null, 2);
    return {
      text, parts: [text],
      name: exportFileName(bundle.accounts.length, "json"),
      mime: "application/json;charset=utf-8",
      summary: `已生成 1 个 SUB bundle JSON，包含 ${bundle.accounts.length} 个账号。`,
      shape: "输出为 SUB bundle JSON，包含 credentials.chatgpt_account_id 和已回填的 id_token claim。"
    };
  }

  throw new Error(`不支持的模式：${mode}`);
}
