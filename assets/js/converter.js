// depends on: utils.js, token.js

// ─── Record finalization ──────────────────────────────────────────────────────
function finalizeRecord(record) {
  const item = { ...record };
  item.chatgpt_account_id = firstText(item.chatgpt_account_id, item.account_id);
  item.project_id = firstText(item.project_id, item.workspace_id);
  item.workspace_id = firstText(item.workspace_id, item.project_id);
  if (!item.client_id) item.client_id = DEFAULT_CLIENT_ID;
  if (!item.privacy_mode) item.privacy_mode = DEFAULT_PRIVACY_MODE;
  if (!("openai_oauth_responses_websockets_v2_enabled" in item)) item.openai_oauth_responses_websockets_v2_enabled = false;
  if (!item.openai_oauth_responses_websockets_v2_mode) item.openai_oauth_responses_websockets_v2_mode = "off";
  item.id_token = ensureIdTokenClaims({
    idToken: firstText(item.id_token),
    accessToken: firstText(item.access_token),
    accountId: firstText(item.chatgpt_account_id),
    userId: firstText(item.chatgpt_user_id),
    organizationId: firstText(item.organization_id),
    projectId: firstText(item.project_id, item.workspace_id),
    email: firstText(item.email, item.account_claims_email),
    planType: firstText(item.plan_type, "free")
  });
  return item;
}

// ─── Format-aware normalization ───────────────────────────────────────────────
function normalizeRecord(item) {
  if (!item || typeof item !== "object" || Array.isArray(item) || Array.isArray(item.accounts)) return null;

  let email = "", password = "", loginIdentity = "", phone = "", accessToken = "", refreshToken = "",
    idToken = "", sessionToken = "", clientId = "", chatgptAccountId = "", chatgptUserId = "",
    organizationId = "", projectId = "", workspaceId = "", createdAt = 0, lastUsed = 0,
    status = "", source = "", disabled = false, accountClaimsEmail = "",
    privacyMode = "", wsEnabled = null, wsMode = "";

  if (item.tokens && typeof item.tokens === "object" && !Array.isArray(item.tokens)) {
    // Codex format
    const tokens = item.tokens;
    email = firstText(item.email);
    accessToken = firstText(tokens.access_token);
    refreshToken = firstText(tokens.refresh_token);
    idToken = firstText(tokens.id_token);
    chatgptAccountId = firstText(item.chatgpt_account_id, item.account_id);
    createdAt = coerceTs(item.created_at);
    lastUsed = coerceTs(item.last_used);
    source = "codex_input";
  } else if (item.credentials && typeof item.credentials === "object" && !Array.isArray(item.credentials)) {
    // SUB bundle format
    const credentials = item.credentials;
    const extra = item.extra && typeof item.extra === "object" && !Array.isArray(item.extra) ? item.extra : {};
    email = firstText(extra.email, credentials.email, item.name);
    accessToken = firstText(credentials.access_token);
    refreshToken = firstText(credentials.refresh_token);
    idToken = firstText(credentials.id_token);
    sessionToken = firstText(credentials.session_token);
    clientId = firstText(credentials.client_id, DEFAULT_CLIENT_ID);
    chatgptAccountId = firstText(credentials.chatgpt_account_id, credentials.account_id, item.chatgpt_account_id, item.account_id);
    chatgptUserId = firstText(credentials.chatgpt_user_id);
    organizationId = firstText(credentials.organization_id);
    projectId = firstText(credentials.project_id);
    workspaceId = firstText(projectId);
    createdAt = coerceTs(item.created_at);
    lastUsed = coerceTs(item.last_used);
    status = firstText(item.status);
    source = firstText(item.notes, "sub_bundle_input");
    disabled = Boolean(item.disabled);
    accountClaimsEmail = firstText(extra.email);
    privacyMode = firstText(extra.privacy_mode);
    wsEnabled = extra.openai_oauth_responses_websockets_v2_enabled;
    wsMode = firstText(extra.openai_oauth_responses_websockets_v2_mode);
  } else {
    // Unified format
    email = firstText(item.email);
    password = firstText(item.password);
    loginIdentity = firstText(item.login_identity);
    phone = firstText(item.phone);
    accessToken = firstText(item.access_token);
    refreshToken = firstText(item.refresh_token);
    idToken = firstText(item.id_token);
    sessionToken = firstText(item.session_token);
    clientId = firstText(item.client_id, DEFAULT_CLIENT_ID);
    chatgptAccountId = firstText(item.chatgpt_account_id, item.account_id);
    chatgptUserId = firstText(item.chatgpt_user_id);
    organizationId = firstText(item.organization_id);
    projectId = firstText(item.project_id);
    workspaceId = firstText(item.workspace_id, projectId);
    createdAt = coerceTs(item.created_at);
    lastUsed = coerceTs(item.last_used);
    status = firstText(item.status);
    source = firstText(item.source, "unified_input");
    disabled = Boolean(item.disabled);
    accountClaimsEmail = firstText(item.account_claims_email);
    privacyMode = firstText(item.privacy_mode);
    wsEnabled = item.openai_oauth_responses_websockets_v2_enabled;
    wsMode = firstText(item.openai_oauth_responses_websockets_v2_mode);
  }

  if (!email) return null;

  const idPayload = decodeJwtPayload(idToken);
  const accessPayload = decodeJwtPayload(accessToken);
  const idAuth = extractAuth(idPayload);
  const accessAuth = extractAuth(accessPayload);
  const accessProfile = extractProfile(accessPayload);

  const record = {
    version: parseInt(item.version || 1, 10) || 1,
    platform: firstText(item.platform, "chatgpt"),
    email, password,
    login_identity: firstText(loginIdentity),
    phone: firstText(phone),
    access_token: accessToken,
    refresh_token: refreshToken,
    id_token: idToken,
    session_token: sessionToken,
    client_id: firstText(clientId, DEFAULT_CLIENT_ID),
    chatgpt_account_id: firstText(chatgptAccountId, extractAccountIdFromAuth(idAuth), extractAccountIdFromAuth(accessAuth)),
    chatgpt_user_id: firstText(chatgptUserId, idAuth.chatgpt_user_id, idAuth.user_id, idAuth.chatgpt_account_user_id, accessAuth.chatgpt_user_id, accessAuth.user_id, accessAuth.chatgpt_account_user_id),
    organization_id: firstText(organizationId, extractOrganizationId(idAuth, accessAuth)),
    project_id: firstText(projectId, workspaceId, idAuth.project_id, accessAuth.project_id),
    workspace_id: firstText(workspaceId, projectId, idAuth.project_id, accessAuth.project_id),
    created_at: createdAt, last_used: lastUsed, status, source, disabled,
    account_claims_email: firstText(accountClaimsEmail, idPayload.email, accessProfile.email),
    plan_type: firstText(item.plan_type, idAuth.chatgpt_plan_type, accessAuth.chatgpt_plan_type, "free"),
    privacy_mode: firstText(privacyMode, DEFAULT_PRIVACY_MODE),
    openai_oauth_responses_websockets_v2_enabled: wsEnabled !== null ? Boolean(wsEnabled) : false,
    openai_oauth_responses_websockets_v2_mode: firstText(wsMode, "off")
  };

  if (record.login_identity && !record.phone && !looksLikeEmail(record.login_identity)) record.phone = record.login_identity;
  return finalizeRecord(record);
}

// ─── Input parsing ────────────────────────────────────────────────────────────
function parseInputItems(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return { items: [], shape: "空输入" };

  let root = null;
  try { root = JSON.parse(trimmed); } catch { root = null; }

  const items = [];
  let shape = "JSONL";

  if (root && typeof root === "object" && !Array.isArray(root)) {
    if (Array.isArray(root.accounts)) {
      items.push(...root.accounts.filter(v => v && typeof v === "object" && !Array.isArray(v)));
      shape = "SUB bundle JSON";
    } else {
      items.push(root);
      shape = root.tokens ? "Codex JSON" : "Unified JSON";
    }
  } else if (Array.isArray(root)) {
    items.push(...root.filter(v => v && typeof v === "object" && !Array.isArray(v)));
    shape = items[0]?.tokens ? "Codex JSON 数组" : "JSON 数组";
  } else {
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        if (Array.isArray(parsed.accounts)) {
          items.push(...parsed.accounts.filter(v => v && typeof v === "object" && !Array.isArray(v)));
          shape = "SUB bundle JSONL";
        } else {
          items.push(parsed);
        }
      }
    }
    if (items[0]?.tokens) shape = "Codex JSONL";
    else if (items[0]?.credentials) shape = "SUB 账号 JSONL";
    else shape = "Unified JSONL";
  }

  return { items, shape };
}

function normalizeRecordsFromText(text) {
  const { items, shape } = parseInputItems(text);
  const recordMap = new Map();
  let pending = 0;

  for (const item of items) {
    const before = extractAuth(decodeJwtPayload(firstText(item?.id_token, item?.credentials?.id_token, item?.tokens?.id_token)));
    const hadClaims = Boolean(firstText(before.chatgpt_account_id) && firstText(before.account_id));
    const record = normalizeRecord(item);
    if (!record) continue;
    const after = extractAuth(decodeJwtPayload(record.id_token));
    const hasClaims = Boolean(firstText(after.chatgpt_account_id) && firstText(after.account_id));
    if (!hadClaims && hasClaims && firstText(record.chatgpt_account_id)) pending += 1;
    recordMap.set(record.email.trim().toLowerCase(), record);
  }

  return { records: [...recordMap.values()], shape, pending };
}
