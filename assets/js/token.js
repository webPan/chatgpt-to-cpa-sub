// depends on: utils.js

// ─── JWT claim extractors ─────────────────────────────────────────────────────
function extractAuth(payload) {
  const value = payload?.["https://api.openai.com/auth"];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function extractProfile(payload) {
  const value = payload?.["https://api.openai.com/profile"];
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function extractAccountIdFromAuth(auth) {
  const accountId = firstText(auth?.chatgpt_account_id, auth?.account_id);
  if (accountId) return accountId;
  const accountUserId = firstText(auth?.chatgpt_account_user_id);
  if (accountUserId.includes("__")) {
    const suffix = accountUserId.split("__").pop().trim();
    if (suffix) return suffix;
  }
  return "";
}

function extractOrganizationId(idAuth, accessAuth) {
  const organizationId = firstText(idAuth?.organization_id, accessAuth?.organization_id);
  if (organizationId) return organizationId;
  const organizations = idAuth?.organizations || accessAuth?.organizations || [];
  if (Array.isArray(organizations)) {
    for (const item of organizations) {
      const value = firstText(item?.id);
      if (value) return value;
    }
  }
  return "";
}

// ─── Compat seed generation ───────────────────────────────────────────────────
function compatSeeds(accountId, userId, email) {
  const seed = (firstText(accountId, userId, email, "unknown").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "unknown");
  return { org: `org-${seed}`, proj: `proj_${seed}`, sid: `compat_session_${seed}` };
}

// ─── Token claim backfill ─────────────────────────────────────────────────────
function buildLocalCompatIdToken(args) {
  const aid = firstText(args.accountId), raw = firstText(args.idToken);
  if (!aid) return raw;
  const idPayload = decodeJwtPayload(raw), accessPayload = decodeJwtPayload(args.accessToken);
  const basePayload = Object.keys(idPayload).length ? idPayload : accessPayload;
  if (!Object.keys(basePayload).length) return raw;
  const baseAuth = extractAuth(basePayload), profile = extractProfile(basePayload);
  const email = firstText(profile.email, basePayload.email, args.email);
  const userId = firstText(args.userId, baseAuth.chatgpt_user_id, baseAuth.user_id, basePayload.sub);
  const seeds = compatSeeds(aid, userId, email);
  const orgId = firstText(args.organizationId, baseAuth.organization_id, extractOrganizationId(baseAuth, baseAuth), seeds.org);
  const projId = firstText(args.projectId, baseAuth.project_id, seeds.proj);
  const auth = { ...baseAuth };
  auth.chatgpt_account_id = firstText(auth.chatgpt_account_id, auth.account_id, aid);
  auth.account_id = firstText(auth.account_id, auth.chatgpt_account_id, aid);
  if (userId) {
    auth.chatgpt_user_id = firstText(auth.chatgpt_user_id, auth.user_id, userId);
    auth.user_id = firstText(auth.user_id, auth.chatgpt_user_id, userId);
  }
  auth.chatgpt_plan_type = firstText(auth.chatgpt_plan_type, args.planType, "free");
  if (!firstText(auth.organization_id)) auth.organization_id = orgId;
  if (!Array.isArray(auth.organizations) || !auth.organizations.length) auth.organizations = [{ id: orgId, is_default: true, role: "owner", title: "Personal" }];
  if (!firstText(auth.project_id)) auth.project_id = projId;
  if (!("completed_platform_onboarding" in auth)) auth.completed_platform_onboarding = false;
  if (!Array.isArray(auth.groups)) auth.groups = [];
  if (!("is_org_owner" in auth)) auth.is_org_owner = true;
  if (!("localhost" in auth)) auth.localhost = true;
  const payload = { ...basePayload, "https://api.openai.com/auth": auth };
  if (email && !firstText(payload.email)) payload.email = email;
  if (!("email_verified" in payload)) payload.email_verified = true;
  if (!firstText(payload.iss)) payload.iss = "https://auth.openai.com";
  if (!payload.aud) payload.aud = [DEFAULT_CLIENT_ID];
  if (!firstText(payload.auth_provider)) payload.auth_provider = "password";
  const authTime = coerceTs(payload.pwd_auth_time || payload.auth_time || payload.rat || payload.iat);
  if (authTime && !coerceTs(payload.auth_time)) payload.auth_time = authTime;
  const sid = firstText(payload.sid, payload.session_id, seeds.sid);
  if (sid && !firstText(payload.sid)) payload.sid = sid;
  if (sid && !firstText(payload.session_id)) payload.session_id = sid;
  if (!firstText(payload.sub) && userId) payload.sub = userId;
  if (!firstText(payload.jti)) {
    const compact = (firstText(args.accessToken, raw, aid, userId, email).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || "compat");
    payload.jti = `compat-${compact}`;
  }
  if (!firstText(payload.name) && email) payload.name = email.split("@")[0] || "OpenAI User";
  return `${b64uJson({ alg: "RS256", typ: "JWT", kid: "compat" })}.${b64uJson(payload)}.${b64uBytes(te.encode("compat_signature_for_local_parsing_only"))}`;
}

function ensureIdTokenClaims(args) {
  const token = firstText(args.idToken), accountId = firstText(args.accountId);
  if (!accountId) return token;
  const payload = decodeJwtPayload(token);
  if (!Object.keys(payload).length) return buildLocalCompatIdToken(args);
  const auth = { ...extractAuth(payload) };
  const existingChatgpt = firstText(auth.chatgpt_account_id);
  const existingAccount = firstText(auth.account_id);
  const resolved = firstText(existingChatgpt, existingAccount, accountId);
  if (existingChatgpt && existingAccount) return token;
  auth.chatgpt_account_id = firstText(existingChatgpt, resolved);
  auth.account_id = firstText(existingAccount, resolved);
  if (args.userId) {
    auth.chatgpt_user_id = firstText(auth.chatgpt_user_id, auth.user_id, args.userId);
    auth.user_id = firstText(auth.user_id, auth.chatgpt_user_id, args.userId);
  }
  if (args.organizationId && !firstText(auth.organization_id)) auth.organization_id = args.organizationId;
  if (args.projectId && !firstText(auth.project_id)) auth.project_id = args.projectId;
  if (args.planType && !firstText(auth.chatgpt_plan_type)) auth.chatgpt_plan_type = args.planType;
  const updated = { ...payload, "https://api.openai.com/auth": auth };
  const parts = token.split(".");
  const head = parts[0] || b64uJson({ alg: "RS256", typ: "JWT", kid: "compat" });
  const sig = parts[2] || b64uBytes(te.encode("compat_signature_for_local_parsing_only"));
  return `${head}.${b64uJson(updated)}.${sig}`;
}
