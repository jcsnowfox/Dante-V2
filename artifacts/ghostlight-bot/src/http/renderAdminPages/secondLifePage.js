/**
 * renderSecondLifePage
 *
 * Phase 3 — admin dashboard for the Second Life Bridge. Configuration surface
 * only: no chat input. The owner configures the bridge settings (agent identity,
 * shared secret, behaviour toggles, quiet hours, reply rate limits) and sees the
 * live status (bridge state, last heartbeat, location, nearby avatars/objects,
 * command queue, recent actions/errors).
 *
 * Detailed CRUD for the registries (relationship whitelist/blocklist, outfit and
 * landmark triggers, furniture/dance/object commands, daily-life schedule) is
 * delivered in later bridge phases; here those registries are shown as read-only
 * count summaries so the owner can see what exists.
 *
 * Reuses the existing ghb-* admin design system (shared with the Companion /
 * Inner Life) so no new CSS is required. Nothing customer-specific is hardcoded;
 * every field is a generic, name-free default.
 */

const BOOLEAN_SETTINGS = [
  { field: "enabled", label: "Bridge Enabled", desc: "Master switch. Off means the bridge ignores every in-world event." },
  { field: "localChatEnabled", label: "Local Chat Replies", desc: "Let the companion reply to nearby local chat." },
  { field: "strangerRepliesEnabled", label: "Reply to Strangers", desc: "Allow replies to avatars with no stored relationship." },
  { field: "autonomyEnabled", label: "Autonomy", desc: "Allow autonomous in-world activity (later phases)." },
  { field: "discoveryEnabled", label: "Discovery", desc: "Allow the companion to discover new places and people." },
  { field: "initiativeEnabled", label: "Initiative", desc: "Allow the companion to start interactions on its own." },
  { field: "outfitsEnabled", label: "Outfits", desc: "Allow outfit changes triggered by context." },
  { field: "landmarksEnabled", label: "Landmarks", desc: "Allow travel to saved landmarks." },
  { field: "objectInteractionEnabled", label: "Object Interaction", desc: "Allow interaction with registered objects." },
  { field: "furnitureInteractionEnabled", label: "Furniture Interaction", desc: "Allow sitting on / using furniture." },
  { field: "dancePadInteractionEnabled", label: "Dance Pad Interaction", desc: "Allow using dance pads." },
];

const TEXT_SETTINGS = [
  { field: "agentName", label: "Agent Name", placeholder: "In-world avatar name" },
  { field: "agentUuid", label: "Agent UUID", placeholder: "00000000-0000-0000-0000-000000000000" },
  { field: "ownerAvatarUuid", label: "Owner Avatar UUID", placeholder: "00000000-0000-0000-0000-000000000000" },
  { field: "homeRegion", label: "Home Region", placeholder: "Region name" },
  { field: "quietHoursStart", label: "Quiet Hours Start (UTC HH:MM)", placeholder: "22:00" },
  { field: "quietHoursEnd", label: "Quiet Hours End (UTC HH:MM)", placeholder: "07:00" },
];

const NUMBER_SETTINGS = [
  { field: "wanderRadiusMeters", label: "Wander Radius (m)", min: 0 },
  { field: "maxLocalRepliesPer10Min", label: "Max Local Replies / 10 min", min: 0 },
  { field: "maxStrangerRepliesPer30Min", label: "Max Stranger Replies / 30 min", min: 0 },
];

// Relationship tiers (highest precedence last in the deriveTier order, but listed
// here owner-first for the picker). Generic; nothing customer-specific.
const RELATIONSHIP_TIERS = ["owner", "family", "friend", "trusted", "known", "stranger", "blocked"];

// Reply policies for per-identity control (Phase 21).
const REPLY_POLICIES = ["always_allowed", "allowed_if_mentioned", "ambient_only", "ignore", "banned"];

// Command types the registry understands.
const COMMAND_TYPES = ["movement", "teleport", "object", "outfit", "system", "custom"];

// Relationship tiers that can be granted per-command access (excludes blocked).
const COMMAND_ALLOWED_TIERS = ["owner", "family", "friend", "trusted", "known", "stranger"];

const inputStyle = "width:100%;box-sizing:border-box;font:inherit;padding:10px;border-radius:8px;border:1px solid rgba(124,58,237,.25);background:rgba(255,255,255,.04);color:inherit";

function renderToggle({ setting, value, escapeHtml, disabledAttr }) {
  return [
    "<label class=\"ghb-copy\" style=\"display:flex;align-items:flex-start;gap:10px;margin-bottom:12px\">",
    `<input type="checkbox" name="${escapeHtml(setting.field)}" value="true"${value ? " checked" : ""}${disabledAttr} style="margin-top:3px">`,
    `<span><strong>${escapeHtml(setting.label)}</strong><br><span class="ghb-copy" style="opacity:.8">${escapeHtml(setting.desc)}</span></span>`,
    "</label>",
  ].join("");
}

function renderTextField({ setting, value, escapeHtml, disabledAttr }) {
  return [
    "<div class=\"ghb-field\" style=\"margin-bottom:14px\">",
    `<label class="ghb-section-title" style="font-size:.95rem;display:block;margin-bottom:4px" for="sl-${escapeHtml(setting.field)}">${escapeHtml(setting.label)}</label>`,
    `<input id="sl-${escapeHtml(setting.field)}" name="${escapeHtml(setting.field)}" type="text" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(setting.placeholder || "")}" style="${inputStyle}"${disabledAttr}>`,
    "</div>",
  ].join("");
}

function renderNumberField({ setting, value, escapeHtml, disabledAttr }) {
  return [
    "<div class=\"ghb-field\" style=\"margin-bottom:14px\">",
    `<label class="ghb-section-title" style="font-size:.95rem;display:block;margin-bottom:4px" for="sl-${escapeHtml(setting.field)}">${escapeHtml(setting.label)}</label>`,
    `<input id="sl-${escapeHtml(setting.field)}" name="${escapeHtml(setting.field)}" type="number" min="${setting.min ?? 0}" value="${escapeHtml(String(value ?? 0))}" style="${inputStyle}"${disabledAttr}>`,
    "</div>",
  ].join("");
}

function statTile(label, value, escapeHtml) {
  return `<div style="flex:1 1 120px;min-width:110px;background:rgba(0,0,0,.16);border-radius:10px;padding:12px"><div class="ghb-copy" style="opacity:.7;font-size:.78rem">${escapeHtml(label)}</div><div style="font-size:1.4rem;font-weight:700;margin-top:2px">${escapeHtml(String(value))}</div></div>`;
}

function renderJournalList(entries, emptyText, escapeHtml) {
  if (!Array.isArray(entries) || !entries.length) {
    return `<p class="ghb-copy" style="opacity:.7">${escapeHtml(emptyText)}</p>`;
  }
  return [
    "<ul class=\"ghb-bullet-list\">",
    ...entries.map((e) => `<li><strong>${escapeHtml(e.title || e.entryType || "—")}</strong>${e.body ? ` — ${escapeHtml(String(e.body).slice(0, 160))}` : ""}</li>`),
    "</ul>",
  ].join("");
}

function renderSelect({ name, options, current, escapeHtml, disabledAttr }) {
  const opts = options
    .map((opt) => `<option value="${escapeHtml(opt)}"${opt === current ? " selected" : ""}>${escapeHtml(opt)}</option>`)
    .join("");
  return `<select name="${escapeHtml(name)}" style="${inputStyle}"${disabledAttr}>${opts}</select>`;
}

function renderPeopleObjectsPanel({ relationships, objectRelationships, companionId, escapeHtml, withThemeField, theme, disabledAttr }) {
  const avatarRows = Array.isArray(relationships) ? relationships : [];
  const objectRows = Array.isArray(objectRelationships) ? objectRelationships : [];

  function getTier(r) {
    if (r.isBlocked) return "blocked";
    if (r.isOwner) return "owner";
    if (r.isFamily) return "family";
    if (r.isFriend) return "friend";
    if (r.isTrusted) return "trusted";
    return r.relationshipType || "known";
  }

  const tierColor = {
    owner: "#6d28d9", family: "#0f766e", friend: "#1d4ed8", trusted: "#475569",
    known: "#374151", stranger: "#6b7280", blocked: "#b91c1c",
  };

  const sorted = [...avatarRows].sort((a, b) => {
    const order = { owner: 0, family: 1, friend: 2, trusted: 3, known: 4, stranger: 5, blocked: 6 };
    return (order[getTier(a)] ?? 5) - (order[getTier(b)] ?? 5);
  });

  const avatarList = sorted.length
    ? sorted.map((r) => {
        const tier = getTier(r);
        const color = tierColor[tier] || "#374151";
        const perms = [
          r.chatPermission ? "chat" : null,
          r.followPermission ? "follow" : null,
          r.privateMemoryPermission ? "memory" : null,
        ].filter(Boolean).join(", ") || "none";
        const badges = [
          r.alwaysRespond ? "always-reply" : null,
          r.neverRespond ? "never-reply" : null,
          r.childSafeOnly ? "child-safe" : null,
        ].filter(Boolean);
        return [
          `<li style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px;padding:8px;background:rgba(0,0,0,.08);border-radius:8px;border-left:3px solid ${color}">`,
          "<div>",
          `<strong>${escapeHtml(r.nickname || r.avatarName || "(unnamed)")}</strong>`,
          (r.nickname && r.avatarName && r.nickname !== r.avatarName) ? ` <span class="ghb-copy" style="opacity:.65;font-size:.82rem">(${escapeHtml(r.avatarName)})</span>` : "",
          ` — <span class="ghb-copy" style="color:${color}">${escapeHtml(tier)}</span>`,
          badges.length ? ` <span class="ghb-copy" style="opacity:.55;font-size:.73rem">[${escapeHtml(badges.join(", "))}]</span>` : "",
          `<br><code class="ghb-copy" style="opacity:.65;font-size:.78rem">${escapeHtml(r.avatarUuid || "")}</code>`,
          (r.category || r.relationshipToUser)
            ? `<br><span class="ghb-copy" style="opacity:.65;font-size:.78rem">${r.category ? `Category: ${escapeHtml(r.category)}` : ""}${r.category && r.relationshipToUser ? " · " : ""}${r.relationshipToUser ? `Relation: ${escapeHtml(r.relationshipToUser)}` : ""}</span>`
            : "",
          `<br><span class="ghb-copy" style="opacity:.65;font-size:.78rem">Policy: ${escapeHtml(r.replyPolicy || "allowed_if_mentioned")} · Perms: ${escapeHtml(perms)}${r.minSecondsBetweenReplies > 0 ? ` · Cooldown: ${escapeHtml(String(r.minSecondsBetweenReplies))}s` : ""}</span>`,
          r.notes ? `<br><span class="ghb-copy" style="opacity:.5;font-size:.75rem">${escapeHtml(String(r.notes).slice(0, 120))}${r.notes.length > 120 ? "…" : ""}</span>` : "",
          "</div>",
          `<form method="POST" action="/admin/actions/second-life-relationship-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="avatarUuid" value="${escapeHtml(r.avatarUuid || "")}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No people registered yet. Add someone below or use the Import Pack.</p>`;

  const objectList = objectRows.length
    ? objectRows.map((o) => {
        const badges = [
          o.alwaysRespond ? "always-reply" : null,
          o.neverRespond ? "never-reply" : null,
          o.childSafeOnly ? "child-safe" : null,
        ].filter(Boolean);
        return [
          "<li style=\"display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px;padding:8px;background:rgba(0,0,0,.08);border-radius:8px;border-left:3px solid #7c3aed\">",
          "<div>",
          `<strong>${escapeHtml(o.nickname || o.objectName || "(unnamed object)")}</strong>`,
          ` <span class="ghb-copy" style="opacity:.5;font-size:.73rem">[object]</span>`,
          badges.length ? ` <span class="ghb-copy" style="opacity:.55;font-size:.73rem">[${escapeHtml(badges.join(", "))}]</span>` : "",
          o.objectUuid ? `<br><code class="ghb-copy" style="opacity:.65;font-size:.78rem">${escapeHtml(o.objectUuid)}</code>` : "",
          o.objectDescriptionToken ? `<br><span class="ghb-copy" style="opacity:.65;font-size:.78rem">Token: ${escapeHtml(o.objectDescriptionToken)}</span>` : "",
          (o.category || o.relationshipToUser)
            ? `<br><span class="ghb-copy" style="opacity:.65;font-size:.78rem">${o.category ? `Category: ${escapeHtml(o.category)}` : ""}${o.category && o.relationshipToUser ? " · " : ""}${o.relationshipToUser ? `Relation: ${escapeHtml(o.relationshipToUser)}` : ""}</span>`
            : "",
          `<br><span class="ghb-copy" style="opacity:.65;font-size:.78rem">Policy: ${escapeHtml(o.replyPolicy || "ambient_only")}${o.minSecondsBetweenReplies > 0 ? ` · Cooldown: ${escapeHtml(String(o.minSecondsBetweenReplies))}s` : ""}</span>`,
          o.notes ? `<br><span class="ghb-copy" style="opacity:.5;font-size:.75rem">${escapeHtml(String(o.notes).slice(0, 120))}${o.notes.length > 120 ? "…" : ""}</span>` : "",
          "</div>",
          o.id != null
            ? `<form method="POST" action="/admin/actions/second-life-object-relationship-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="id" value="${escapeHtml(String(o.id))}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`
            : "",
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No object relationships yet. Add one below or use the Import Pack.</p>`;

  const avatarForm = [
    `<form method="POST" action="/admin/actions/second-life-relationship-save" style="margin-top:4px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 220px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Avatar UUID *</label><input name="avatarUuid" type="text" placeholder="00000000-0000-0000-0000-000000000000" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 160px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Avatar Name</label><input name="avatarName" type="text" placeholder="In-world display name" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 140px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Nickname</label><input name="nickname" type="text" placeholder="Short name used in chat" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 140px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Category</label><input name="category" type="text" placeholder="e.g. jc_sister, owner_partner" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 120px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Display Label</label><input name="displayLabel" type="text" placeholder="Optional label" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 140px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Tier</label>${renderSelect({ name: "relationshipType", options: RELATIONSHIP_TIERS, current: "known", escapeHtml, disabledAttr })}</div>`,
    `<div class="ghb-field" style="flex:1 1 180px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Reply Policy</label>${renderSelect({ name: "replyPolicy", options: REPLY_POLICIES, current: "allowed_if_mentioned", escapeHtml, disabledAttr })}</div>`,
    `<div class="ghb-field" style="flex:1 1 120px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Min secs between replies</label><input name="minSecondsBetweenReplies" type="number" min="0" value="0" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 200px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Relation to user</label><input name="relationshipToUser" type="text" placeholder="e.g. older sister" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 200px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Relation to companion</label><input name="relationshipToCompanion" type="text" placeholder="e.g. trusted family, sister-in-law energy" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px\">",
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="chatPermission" value="true" checked${disabledAttr}> Chat</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="followPermission" value="true"${disabledAttr}> Follow</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="privateMemoryPermission" value="true"${disabledAttr}> Private memory</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="alwaysRespond" value="true"${disabledAttr}> Always respond</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="neverRespond" value="true"${disabledAttr}> Never respond</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="childSafeOnly" value="true"${disabledAttr}> Child-safe only</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="publicIdentityContextEnabled" value="true" checked${disabledAttr}> Public identity context</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="localChatChatterEnabled" value="true" checked${disabledAttr}> Local chat chatter</label>`,
    "</div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:8px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Notes (character context for companion)</label>",
    `<input name="notes" type="text" placeholder="Notes shown to the companion when this person speaks" style="${inputStyle}"${disabledAttr}></div>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save person</button>`,
    "</form>",
  ].join("");

  const objectForm = [
    `<form method="POST" action="/admin/actions/second-life-object-relationship-save" style="margin-top:4px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 180px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Object Name</label><input name="objectName" type="text" placeholder="In-world object name" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 140px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Nickname</label><input name="nickname" type="text" placeholder="Short name" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 220px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Object UUID (if known)</label><input name="objectUuid" type="text" placeholder="00000000-0000-0000-0000-000000000000" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 220px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Description token (UUID or keyword in object description)</label><input name="objectDescriptionToken" type="text" placeholder="e.g. owner avatar UUID" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 180px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Reply Policy</label>${renderSelect({ name: "replyPolicy", options: REPLY_POLICIES, current: "ambient_only", escapeHtml, disabledAttr })}</div>`,
    `<div class="ghb-field" style="flex:1 1 120px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Min secs between replies</label><input name="minSecondsBetweenReplies" type="number" min="0" value="0" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 140px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Category</label><input name="category" type="text" placeholder="e.g. family_child_object" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px\">",
    `<div class="ghb-field" style="flex:1 1 200px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Relation to user</label><input name="relationshipToUser" type="text" placeholder="e.g. Belz's daughter" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1 1 200px"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Relation to companion</label><input name="relationshipToCompanion" type="text" placeholder="e.g. family child" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    "<div style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px\">",
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="childSafeOnly" value="true"${disabledAttr}> Child-safe only</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="publicIdentityContextEnabled" value="true" checked${disabledAttr}> Public identity context</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="localChatChatterEnabled" value="true" checked${disabledAttr}> Local chat chatter</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="alwaysRespond" value="true"${disabledAttr}> Always respond</label>`,
    `<label class="ghb-copy" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="neverRespond" value="true"${disabledAttr}> Never respond</label>`,
    "</div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:8px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Notes (character context for companion)</label>",
    `<input name="notes" type="text" placeholder="Notes about this object shown to the companion" style="${inputStyle}"${disabledAttr}></div>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#7c3aed;color:#fff;font:inherit;cursor:pointer">Save object</button>`,
    "</form>",
  ].join("");

  const importForm = [
    `<form method="POST" action="/admin/actions/second-life-import-relationships" style="margin:0">`,
    withThemeField(theme),
    `<input type="hidden" name="returnTo" value="/admin/second-life">`,
    `<input type="hidden" name="companionId" value="${escapeHtml(companionId || "")}">`,
    `<input type="hidden" name="pack" value="nox">`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 14px;border-radius:8px;border:0;background:#0f766e;color:#fff;font:inherit;cursor:pointer">Import Nox Family Pack</button>`,
    "</form>",
  ].join("");

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">☺</span><div>",
    "<h3 class=\"ghb-section-title\">People &amp; Objects</h3>",
    "<p class=\"ghb-copy\">Identity registry — recognise avatars by UUID (source of truth, names can change) and objects by UUID or description token. Re-submit an existing UUID to update. Reply policy, cooldown, and child-safe mode are all per-identity.</p>",
    "</div></div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:16px\">",
    importForm,
    "<span class=\"ghb-copy\" style=\"opacity:.6;font-size:.82rem\">Nox family pack only — imports only when companion ID is 'nox'.</span>",
    "</div>",
    `<h4 class="ghb-copy" style="margin:0 0 8px;font-weight:600;font-size:.95rem">Known People (${escapeHtml(String(avatarRows.length))})</h4>`,
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0;margin-bottom:16px">${avatarList}</ul>`,
    "<h4 class=\"ghb-copy\" style=\"margin:0 0 8px;font-weight:600;font-size:.95rem\">Add / Update Person</h4>",
    avatarForm,
    "<hr style=\"margin:20px 0;border:0;border-top:1px solid rgba(124,58,237,.15)\">",
    `<h4 class="ghb-copy" style="margin:0 0 8px;font-weight:600;font-size:.95rem">Object Relationships (${escapeHtml(String(objectRows.length))})</h4>`,
    "<p class=\"ghb-copy\" style=\"opacity:.7;margin:0 0 8px;font-size:.85rem\">Objects recognised by UUID or description token (useful when object description contains the owner's avatar UUID). All replies to child-safe objects are forced child-safe regardless of companion adult mode.</p>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0;margin-bottom:16px">${objectList}</ul>`,
    "<h4 class=\"ghb-copy\" style=\"margin:0 0 8px;font-weight:600;font-size:.95rem\">Add / Update Object</h4>",
    objectForm,
    "</section>",
  ].join("");
}

function renderCommandPanel({ commands, copyBlock, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(commands) ? commands : [];
  const list = rows.length
    ? rows.map((c) => {
        const scope = c.requiresOwnerPermission
          ? "owner only"
          : (Array.isArray(c.allowedRelationships) && c.allowedRelationships.length
            ? c.allowedRelationships.join(", ")
            : "everyone");
        return [
          "<li style=\"display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px\">",
          "<div>",
          `<strong>${escapeHtml(c.commandTrigger)}</strong> — <span class="ghb-copy">${escapeHtml(c.commandType)}</span>`,
          c.enabled ? "" : " <span class=\"ghb-copy\" style=\"color:#b45309\">(disabled)</span>",
          c.description ? `<br><span class="ghb-copy" style="opacity:.8;font-size:.82rem">${escapeHtml(c.description)}</span>` : "",
          `<br><span class="ghb-copy" style="opacity:.7;font-size:.78rem">Access: ${escapeHtml(scope)}</span>`,
          "</div>",
          "<div style=\"display:flex;gap:6px\">",
          `<form method="POST" action="/admin/actions/second-life-command-toggle" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="commandTrigger" value="${escapeHtml(c.commandTrigger)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#475569;color:#fff;font:inherit;cursor:pointer">${c.enabled ? "Disable" : "Enable"}</button></form>`,
          `<form method="POST" action="/admin/actions/second-life-command-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="commandTrigger" value="${escapeHtml(c.commandTrigger)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</div>",
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No commands yet. Use “Seed defaults” to load the standard set.</p>`;

  const allowedChecks = COMMAND_ALLOWED_TIERS
    .map((t) => `<label class="ghb-copy" style="display:inline-flex;gap:6px;align-items:center;margin:0 12px 6px 0"><input type="checkbox" name="allowedRelationships" value="${escapeHtml(t)}"${disabledAttr}> ${escapeHtml(t)}</label>`)
    .join("");

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">⌘</span><div>",
    "<h3 class=\"ghb-section-title\">Command Registry</h3>",
    "<p class=\"ghb-copy\">Triggers the companion recognises in-world. Owner commands take priority. Re-submit an existing trigger to update it.</p>",
    "</div></div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px\">",
    `<form method="POST" action="/admin/actions/second-life-command-seed" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 14px;border-radius:8px;border:0;background:#0f766e;color:#fff;font:inherit;cursor:pointer">Seed defaults</button></form>`,
    "</div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    `<form method="POST" action="/admin/actions/second-life-command-save" style="margin-top:12px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Trigger</label>",
    `<input name="commandTrigger" type="text" placeholder="!example" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Type</label>",
    renderSelect({ name: "commandType", options: COMMAND_TYPES, current: "custom", escapeHtml, disabledAttr }),
    "</div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Description</label>",
    `<input name="description" type="text" placeholder="What this command does" style="${inputStyle}"${disabledAttr}></div>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="requiresOwnerPermission" value="true"${disabledAttr}> Owner only (highest priority)</label>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="enabled" value="true" checked${disabledAttr}> Enabled</label>`,
    "<div class=\"ghb-field\" style=\"margin:6px 0\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Allowed tiers (when not owner-only; none = everyone)</label>",
    `<div>${allowedChecks}</div></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Payload JSON (optional)</label>",
    `<input name="payload" type="text" placeholder='{"action":"custom"}' style="${inputStyle}"${disabledAttr}></div>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save command</button>`,
    "</form>",
    "<h4 class=\"ghb-copy\" style=\"margin:16px 0 4px;font-weight:600\">Test a trigger</h4>",
    `<form method="POST" action="/admin/actions/second-life-command-test" style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    `<div style="flex:1 1 160px"><label class="ghb-section-title" style="font-size:.85rem;display:block;margin-bottom:4px">Trigger</label><input name="trigger" type="text" placeholder="!follow" style="${inputStyle}"${disabledAttr}></div>`,
    `<div style="flex:1 1 140px"><label class="ghb-section-title" style="font-size:.85rem;display:block;margin-bottom:4px">As tier</label>${renderSelect({ name: "relationshipType", options: COMMAND_ALLOWED_TIERS, current: "stranger", escapeHtml, disabledAttr })}</div>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#6d28d9;color:#fff;font:inherit;cursor:pointer">Test</button>`,
    "</form>",
    "<h4 class=\"ghb-copy\" style=\"margin:16px 0 4px;font-weight:600\">Copy/paste block</h4>",
    "<p class=\"ghb-copy\" style=\"opacity:.8;margin:0 0 6px\">Paste the enabled triggers into your in-world object's notecard.</p>",
    `<textarea readonly rows="6" style="${inputStyle};font-family:monospace;font-size:.8rem">${escapeHtml(copyBlock || "")}</textarea>`,
    "</section>",
  ].join("");
}

function renderOutfitPanel({ outfits, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(outfits) ? outfits : [];
  const list = rows.length
    ? rows.map((o) => {
        const tags = Array.isArray(o.contextTags) && o.contextTags.length ? o.contextTags.join(", ") : "—";
        const scope = o.requiresOwnerPermission ? "owner only" : "close relationships";
        return [
          "<li style=\"display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px\">",
          "<div>",
          `<strong>${escapeHtml(o.trigger)}</strong>${o.outfitName ? ` — <span class="ghb-copy">${escapeHtml(o.outfitName)}</span>` : ""}`,
          o.isDefault ? " <span class=\"ghb-copy\" style=\"opacity:.6;font-size:.75rem\">(default)</span>" : "",
          o.enabled ? "" : " <span class=\"ghb-copy\" style=\"color:#b45309\">(disabled)</span>",
          o.description ? `<br><span class="ghb-copy" style="opacity:.8;font-size:.82rem">${escapeHtml(o.description)}</span>` : "",
          `<br><span class="ghb-copy" style="opacity:.7;font-size:.78rem">Context: ${escapeHtml(tags)} · Access: ${escapeHtml(scope)}</span>`,
          "</div>",
          "<div style=\"display:flex;gap:6px\">",
          `<form method="POST" action="/admin/actions/second-life-outfit-toggle" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="trigger" value="${escapeHtml(o.trigger)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#475569;color:#fff;font:inherit;cursor:pointer">${o.enabled ? "Disable" : "Enable"}</button></form>`,
          `<form method="POST" action="/admin/actions/second-life-outfit-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="trigger" value="${escapeHtml(o.trigger)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</div>",
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No outfits yet. Use “Seed defaults” to load the generic context set.</p>`;

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">👗</span><div>",
    "<h3 class=\"ghb-section-title\">Outfits</h3>",
    "<p class=\"ghb-copy\">Outfit triggers and the contexts that select them. The in-world outfit/folder name is generic — set it per your own wardrobe. Re-submit a trigger to update it.</p>",
    "</div></div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px\">",
    `<form method="POST" action="/admin/actions/second-life-outfit-seed" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 14px;border-radius:8px;border:0;background:#0f766e;color:#fff;font:inherit;cursor:pointer">Seed defaults</button></form>`,
    "</div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    `<form method="POST" action="/admin/actions/second-life-outfit-save" style="margin-top:12px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Trigger</label>",
    `<input name="trigger" type="text" placeholder="formal" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">In-world outfit/folder name</label>",
    `<input name="outfitName" type="text" placeholder="Outfit folder name in your inventory" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Description</label>",
    `<input name="description" type="text" placeholder="When this outfit fits" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Context tags (comma-separated)</label>",
    `<input name="contextTags" type="text" placeholder="formal, evening, date" style="${inputStyle}"${disabledAttr}></div>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="requiresOwnerPermission" value="true"${disabledAttr}> Owner only</label>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="enabled" value="true" checked${disabledAttr}> Enabled</label>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save outfit</button>`,
    "</form>",
    "</section>",
  ].join("");
}

function renderLandmarkPanel({ landmarks, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(landmarks) ? landmarks : [];
  const list = rows.length
    ? rows.map((l) => {
        const flags = [
          l.isHome ? "home" : null,
          l.isPrivate ? "private" : null,
          l.enabled ? null : "disabled",
        ].filter(Boolean).join(", ");
        const access = l.isPrivate
          ? (Array.isArray(l.allowedRelationships) && l.allowedRelationships.length ? l.allowedRelationships.join(", ") : "owner only")
          : "everyone";
        return [
          "<li style=\"display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px\">",
          "<div>",
          `<strong>${escapeHtml(l.trigger)}</strong>${l.name ? ` — <span class="ghb-copy">${escapeHtml(l.name)}</span>` : ""}`,
          flags ? ` <span class="ghb-copy" style="opacity:.6;font-size:.75rem">(${escapeHtml(flags)})</span>` : "",
          `<br><span class="ghb-copy" style="opacity:.7;font-size:.78rem">Region: ${escapeHtml(l.region || "—")} · Access: ${escapeHtml(access)}</span>`,
          "</div>",
          `<form method="POST" action="/admin/actions/second-life-landmark-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="trigger" value="${escapeHtml(l.trigger)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No landmarks yet. Add region-specific destinations below.</p>`;

  const allowedChecks = COMMAND_ALLOWED_TIERS
    .map((t) => `<label class="ghb-copy" style="display:inline-flex;gap:6px;align-items:center;margin:0 12px 6px 0"><input type="checkbox" name="allowedRelationships" value="${escapeHtml(t)}"${disabledAttr}> ${escapeHtml(t)}</label>`)
    .join("");

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">📍</span><div>",
    "<h3 class=\"ghb-section-title\">Landmarks</h3>",
    "<p class=\"ghb-copy\">Saved destinations the companion can teleport to. Region-specific, so there are no defaults. Mark one as Home; private landmarks need allowed tiers (owner always allowed).</p>",
    "</div></div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    `<form method="POST" action="/admin/actions/second-life-landmark-save" style="margin-top:12px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Trigger</label>",
    `<input name="trigger" type="text" placeholder="beach" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Name</label>",
    `<input name="name" type="text" placeholder="Display name" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Region</label>",
    `<input name="region" type="text" placeholder="SL region name" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Coordinates (x, y, z)</label>",
    "<div style=\"display:flex;gap:8px\">",
    `<input name="coordX" type="number" step="any" placeholder="x" style="${inputStyle}"${disabledAttr}>`,
    `<input name="coordY" type="number" step="any" placeholder="y" style="${inputStyle}"${disabledAttr}>`,
    `<input name="coordZ" type="number" step="any" placeholder="z" style="${inputStyle}"${disabledAttr}>`,
    "</div></div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Description</label>",
    `<input name="description" type="text" placeholder="What's here" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Tags (comma-separated)</label>",
    `<input name="tags" type="text" placeholder="relax, social" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Favorite score</label>",
    `<input name="favoriteScore" type="number" step="any" value="0" style="${inputStyle}"${disabledAttr}></div>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="isHome" value="true"${disabledAttr}> Home landmark (only one)</label>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="isPrivate" value="true"${disabledAttr}> Private</label>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="enabled" value="true" checked${disabledAttr}> Enabled</label>`,
    "<div class=\"ghb-field\" style=\"margin:6px 0\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Allowed tiers when private (owner always allowed)</label>",
    `<div>${allowedChecks}</div></div>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save landmark</button>`,
    "</form>",
    "</section>",
  ].join("");
}

function renderObjectPanel({ objects, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(objects) ? objects : [];
  const list = rows.length
    ? rows.map((o) => {
        const actions = Array.isArray(o.allowedActions) && o.allowedActions.length ? o.allowedActions.join(", ") : "—";
        return [
          "<li style=\"display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px\">",
          "<div>",
          `<strong>${escapeHtml(o.objectName || "(unnamed object)")}</strong> — <span class="ghb-copy">${escapeHtml(o.useType || o.objectType || "custom")}</span>`,
          o.requiresOwnerPermission ? " <span class=\"ghb-copy\" style=\"opacity:.6;font-size:.75rem\">(owner only)</span>" : "",
          o.enabled ? "" : " <span class=\"ghb-copy\" style=\"color:#b45309\">(disabled)</span>",
          `<br><code class="ghb-copy" style="opacity:.7;font-size:.78rem">${escapeHtml(o.objectUuid)}</code>`,
          `<br><span class="ghb-copy" style="opacity:.7;font-size:.78rem">${o.roomLabel ? `Room: ${escapeHtml(o.roomLabel)} · ` : ""}Region: ${escapeHtml(o.region || "—")} · Actions: ${escapeHtml(actions)}</span>`,
          "</div>",
          `<form method="POST" action="/admin/actions/second-life-object-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="objectUuid" value="${escapeHtml(o.objectUuid)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No objects registered yet. The relay registers nearby interactable objects as it discovers them.</p>`;

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">🪑</span><div>",
    "<h3 class=\"ghb-section-title\">Objects</h3>",
    "<p class=\"ghb-copy\">Interactable objects (furniture, dance pads, props) the relay has registered. The companion resolves “sit on the couch”-style requests against these first, then the live nearby scan. Remove stale entries here.</p>",
    "</div></div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    "</section>",
  ].join("");
}

const AUTONOMY_LEVELS = ["low", "medium", "high"];
const SCHEDULE_DAYS = ["", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SCHEDULE_ACTIVITY_TYPES = ["morning", "afternoon", "evening", "night", "social", "explore", "rest", "custom"];

// Stage 6 type lists — mirror the engine constants (sharedExperienceEngine /
// goalEngine) so the picker stays in sync. Generic; nothing customer-specific.
const EXPERIENCE_TYPES = [
  "first_meeting",
  "first_dance",
  "first_trip",
  "favorite_cafe",
  "favorite_beach",
  "favorite_club",
  "favorite_venue",
  "running_joke",
  "meaningful_conversation",
  "owner_called_moment",
  "photo",
  "gift",
  "landmark",
  "promise",
  "open_loop",
  "moment",
];

const GOAL_TYPES = [
  "visit_regions",
  "discover_music_venues",
  "build_favorites",
  "complete_photo_album",
  "learn_owner_preferences",
  "maintain_friendships",
  "find_favorite_cafe",
  "find_favorite_beach",
  "find_favorite_club",
  "custom",
];

const GOAL_STATUSES = ["active", "paused", "completed", "archived"];

function renderLifeEnginePanel({ lifeEngineEnabled, lifeEngineAutonomy, escapeHtml, withThemeField, theme }) {
  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">✦</span><div>",
    "<h3 class=\"ghb-section-title\">Companion Life Engine</h3>",
    "<p class=\"ghb-copy\">When enabled, the companion follows its daily schedule, notices the world around it, and chooses what to do on its own. Disabled by default — Discord is unaffected either way. Takes effect on the next restart.</p>",
    "</div></div>",
    `<p class="ghb-copy" style="margin:0 0 10px">Status: <strong>${lifeEngineEnabled ? "enabled" : "disabled"}</strong> · Autonomy: <strong>${escapeHtml(lifeEngineAutonomy || "medium")}</strong></p>`,
    `<form method="POST" action="/admin/actions/second-life-life-engine-toggle" style="margin:0">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" name="enabled" value="true"${lifeEngineEnabled ? " checked" : ""}> Enable the Companion Life Engine</label>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Autonomy level</label>",
    renderSelect({ name: "autonomyLevel", options: AUTONOMY_LEVELS, current: lifeEngineAutonomy || "medium", escapeHtml, disabledAttr: "" }),
    "</div>",
    `<button type="submit" class="ghb-btn" style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save life engine</button>`,
    "</form>",
    "</section>",
  ].join("");
}

function renderSchedulePanel({ schedule, editingEntry = null, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(schedule) ? schedule : [];
  const editing = editingEntry && typeof editingEntry === "object" ? editingEntry : null;
  const list = rows.length
    ? rows.map((e) => {
        const window = `${escapeHtml(e.timeWindowStart || "—")}–${escapeHtml(e.timeWindowEnd || "—")}`;
        const day = e.dayOfWeek ? escapeHtml(e.dayOfWeek) : "every day";
        const isEditing = editing && String(editing.id) === String(e.id);
        return [
          `<li style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px${isEditing ? ";outline:2px solid #3a7ced;outline-offset:4px;border-radius:6px" : ""}">`,
          "<div>",
          `<strong>${escapeHtml(e.activityType || "—")}</strong> — <span class="ghb-copy">${window}</span> <span class="ghb-copy" style="opacity:.6;font-size:.75rem">(${day})</span>`,
          e.enabled ? "" : " <span class=\"ghb-copy\" style=\"color:#b45309\">(disabled)</span>",
          e.activityLabel ? `<br><span class="ghb-copy" style="opacity:.8;font-size:.82rem">${escapeHtml(e.activityLabel)}</span>` : "",
          `<br><span class="ghb-copy" style="opacity:.7;font-size:.78rem">Autonomy: ${escapeHtml(e.autonomyLevel || "medium")}${e.requiresOwnerPresent ? " · owner must be present" : ""}</span>`,
          "</div>",
          "<div style=\"display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end\">",
          disabledAttr
            ? ""
            : `<a href="/admin/second-life?editScheduleId=${encodeURIComponent(String(e.id))}#schedule-form" class="ghb-btn" style="padding:6px 10px;border-radius:6px;border:0;background:#475569;color:#fff;font:inherit;text-decoration:none;cursor:pointer">Edit</a>`,
          `<form method="POST" action="/admin/actions/second-life-schedule-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="id" value="${escapeHtml(e.id)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</div>",
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No schedule yet. Use “Seed defaults” for a generic Morning/Afternoon/Evening/Night rhythm.</p>`;

  const cur = (key, fallback) => (editing && editing[key] != null && editing[key] !== "" ? editing[key] : fallback);
  const ownerChecked = editing ? (editing.requiresOwnerPresent ? " checked" : "") : "";
  const enabledChecked = editing ? (editing.enabled ? " checked" : "") : " checked";

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">🕑</span><div>",
    "<h3 class=\"ghb-section-title\">Daily Schedule</h3>",
    "<p class=\"ghb-copy\">Time windows that shape what the companion tends to do across the day. Generic by default; leave the day blank to apply every day. Used only when the Life Engine is enabled.</p>",
    "</div></div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px\">",
    `<form method="POST" action="/admin/actions/second-life-schedule-seed" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 14px;border-radius:8px;border:0;background:#0f766e;color:#fff;font:inherit;cursor:pointer">Seed defaults</button></form>`,
    "</div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    "<a id=\"schedule-form\"></a>",
    editing ? `<p class="ghb-copy" style="margin:0 0 8px;color:#3a7ced"><strong>Editing schedule entry</strong> — <a href="/admin/second-life#schedule-form" style="color:inherit">cancel</a></p>` : "",
    `<form method="POST" action="/admin/actions/second-life-schedule-save" style="margin-top:12px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    editing ? `<input type="hidden" name="id" value="${escapeHtml(editing.id)}">` : "",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Activity type</label>",
    renderSelect({ name: "activityType", options: SCHEDULE_ACTIVITY_TYPES, current: cur("activityType", "morning"), escapeHtml, disabledAttr }),
    "</div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Day of week (blank = every day)</label>",
    renderSelect({ name: "dayOfWeek", options: SCHEDULE_DAYS, current: cur("dayOfWeek", ""), escapeHtml, disabledAttr }),
    "</div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Time window (HH:MM start / end)</label>",
    "<div style=\"display:flex;gap:8px\">",
    `<input name="timeWindowStart" type="text" placeholder="06:00" value="${escapeHtml(cur("timeWindowStart", ""))}" style="${inputStyle}"${disabledAttr}>`,
    `<input name="timeWindowEnd" type="text" placeholder="12:00" value="${escapeHtml(cur("timeWindowEnd", ""))}" style="${inputStyle}"${disabledAttr}>`,
    "</div></div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Activity label</label>",
    `<input name="activityLabel" type="text" placeholder="What the companion tends to do then" value="${escapeHtml(cur("activityLabel", ""))}" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Autonomy level</label>",
    renderSelect({ name: "autonomyLevel", options: AUTONOMY_LEVELS, current: cur("autonomyLevel", "medium"), escapeHtml, disabledAttr }),
    "</div>",
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="requiresOwnerPresent" value="true"${ownerChecked}${disabledAttr}> Requires owner present</label>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="enabled" value="true"${enabledChecked}${disabledAttr}> Enabled</label>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">${editing ? "Update schedule entry" : "Add schedule entry"}</button>`,
    "</form>",
    "</section>",
  ].join("");
}

function renderDiscoveryPanel({ discoveries, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(discoveries) ? discoveries : [];
  const list = rows.length
    ? rows.map((d) => {
        const flags = [
          d.isFavorite ? "favorite" : null,
          d.bookmarked ? "bookmarked" : null,
          d.shared ? "shared" : null,
        ].filter(Boolean).join(", ");
        return [
          "<li style=\"display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px\">",
          "<div>",
          `<strong>${escapeHtml(d.name || d.placeKey || "(unnamed place)")}</strong> <span class="ghb-copy" style="opacity:.7;font-size:.78rem">${escapeHtml(d.source || "visited")}</span>`,
          flags ? ` <span class="ghb-copy" style="opacity:.6;font-size:.75rem">(${escapeHtml(flags)})</span>` : "",
          `<br><span class="ghb-copy" style="opacity:.7;font-size:.78rem">Region: ${escapeHtml(d.region || "—")} · Visits: ${escapeHtml(String(d.visitCount || 0))} · Rating: ${escapeHtml(String(d.rating || 0))}/5</span>`,
          "</div>",
          "<div style=\"display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end\">",
          `<form method="POST" action="/admin/actions/second-life-discovery-favorite" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="placeKey" value="${escapeHtml(d.placeKey)}"><input type="hidden" name="isFavorite" value="${d.isFavorite ? "false" : "true"}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#475569;color:#fff;font:inherit;cursor:pointer">${d.isFavorite ? "Unfavorite" : "Favorite"}</button></form>`,
          `<form method="POST" action="/admin/actions/second-life-discovery-bookmark" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="placeKey" value="${escapeHtml(d.placeKey)}"><input type="hidden" name="bookmarked" value="${d.bookmarked ? "false" : "true"}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#475569;color:#fff;font:inherit;cursor:pointer">${d.bookmarked ? "Unbookmark" : "Bookmark"}</button></form>`,
          `<form method="POST" action="/admin/actions/second-life-discovery-rate" style="margin:0;display:flex;gap:4px;align-items:center">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="placeKey" value="${escapeHtml(d.placeKey)}"><input name="rating" type="number" min="0" max="5" value="${escapeHtml(String(d.rating || 0))}" style="width:56px;font:inherit;padding:6px;border-radius:6px;border:1px solid rgba(124,58,237,.25);background:rgba(255,255,255,.04);color:inherit"${disabledAttr}><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#6d28d9;color:#fff;font:inherit;cursor:pointer">Rate</button></form>`,
          `<form method="POST" action="/admin/actions/second-life-discovery-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="placeKey" value="${escapeHtml(d.placeKey)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</div>",
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No discoveries yet. The companion only records places it has actually visited, registered, or imported — nothing is invented here.</p>`;

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">🗺</span><div>",
    "<h3 class=\"ghb-section-title\">Discoveries</h3>",
    "<p class=\"ghb-copy\">Places the companion has genuinely been. Bookmark, rate, favorite, or remove entries. This list is read-only input — new discoveries come only from real visits, never invented.</p>",
    "</div></div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    "</section>",
  ].join("");
}

function renderSharedExperiencePanel({ sharedExperiences, editingEntry = null, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(sharedExperiences) ? sharedExperiences : [];
  const editing = editingEntry && typeof editingEntry === "object" ? editingEntry : null;
  const list = rows.length
    ? rows.map((e) => {
        const isEditing = editing && String(editing.id) === String(e.id);
        const when = e.occurredAt ? String(e.occurredAt) : (e.createdAt ? String(e.createdAt) : "");
        return [
          `<li style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:8px${isEditing ? ";outline:2px solid #3a7ced;outline-offset:4px;border-radius:6px" : ""}">`,
          "<div>",
          `<strong>${escapeHtml(e.title || e.experienceType || "(untitled)")}</strong> <span class="ghb-copy" style="opacity:.7;font-size:.78rem">${escapeHtml(e.experienceType || "moment")}</span>`,
          e.isMilestone ? " <span class=\"ghb-copy\" style=\"color:#6d28d9;font-size:.75rem\">(milestone)</span>" : "",
          e.body ? `<br><span class="ghb-copy" style="opacity:.8;font-size:.82rem">${escapeHtml(String(e.body).slice(0, 180))}</span>` : "",
          when ? `<br><span class="ghb-copy" style="opacity:.6;font-size:.75rem">${escapeHtml(when)}</span>` : "",
          "</div>",
          "<div style=\"display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end\">",
          disabledAttr
            ? ""
            : `<a href="/admin/second-life?editExperienceId=${encodeURIComponent(String(e.id))}#experience-form" class="ghb-btn" style="padding:6px 10px;border-radius:6px;border:0;background:#475569;color:#fff;font:inherit;text-decoration:none;cursor:pointer">Edit</a>`,
          `<form method="POST" action="/admin/actions/second-life-experience-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="id" value="${escapeHtml(e.id)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</div>",
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No shared experiences yet. These are recorded from real moments (firsts, favorites, promises, open loops) and shared with both Discord and Second Life — nothing is invented here.</p>`;

  const cur = (key, fallback) => (editing && editing[key] != null && editing[key] !== "" ? editing[key] : fallback);
  const milestoneChecked = editing ? (editing.isMilestone ? " checked" : "") : "";

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">❀</span><div>",
    "<h3 class=\"ghb-section-title\">Shared Experiences</h3>",
    "<p class=\"ghb-copy\">The history you and the companion build together — first meetings, favorite places, running jokes, promises, open loops. Stored in the shared memory both Discord and Second Life read. Used only when the Life Engine is enabled.</p>",
    "</div></div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    "<a id=\"experience-form\"></a>",
    editing ? `<p class="ghb-copy" style="margin:0 0 8px;color:#3a7ced"><strong>Editing experience</strong> — <a href="/admin/second-life#experience-form" style="color:inherit">cancel</a></p>` : "",
    `<form method="POST" action="/admin/actions/second-life-experience-save" style="margin-top:12px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    editing ? `<input type="hidden" name="id" value="${escapeHtml(editing.id)}">` : "",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Experience type</label>",
    renderSelect({ name: "experienceType", options: EXPERIENCE_TYPES, current: cur("experienceType", "moment"), escapeHtml, disabledAttr }),
    "</div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Title</label>",
    `<input name="title" type="text" placeholder="A short headline for the moment" value="${escapeHtml(cur("title", ""))}" style="${inputStyle}"${disabledAttr}></div>`,
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Details</label>",
    `<textarea name="body" rows="3" placeholder="What happened, in a sentence or two" style="${inputStyle}"${disabledAttr}>${escapeHtml(cur("body", ""))}</textarea></div>`,
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:6px"><input type="checkbox" name="isMilestone" value="true"${milestoneChecked}${disabledAttr}> Mark as a milestone (headline history)</label>`,
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">${editing ? "Update experience" : "Add experience"}</button>`,
    "</form>",
    "</section>",
  ].join("");
}

function renderGoalPanel({ goals, editingEntry = null, escapeHtml, withThemeField, theme, disabledAttr }) {
  const rows = Array.isArray(goals) ? goals : [];
  const editing = editingEntry && typeof editingEntry === "object" ? editingEntry : null;
  const list = rows.length
    ? rows.map((g) => {
        const isEditing = editing && String(editing.id) === String(g.id);
        const target = Number(g.targetValue) || 0;
        const current = Number(g.currentValue) || 0;
        const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((current / target) * 100))) : 0;
        const unit = g.unit ? ` ${escapeHtml(g.unit)}` : "";
        return [
          `<li style="display:flex;align-items:flex-start;gap:10px;justify-content:space-between;margin-bottom:10px${isEditing ? ";outline:2px solid #3a7ced;outline-offset:4px;border-radius:6px" : ""}">`,
          "<div style=\"flex:1\">",
          `<strong>${escapeHtml(g.label || g.goalType || "(unnamed goal)")}</strong> <span class="ghb-copy" style="opacity:.7;font-size:.78rem">${escapeHtml(g.goalType || "custom")}</span>`,
          g.status && g.status !== "active" ? ` <span class="ghb-copy" style="opacity:.7;font-size:.75rem">(${escapeHtml(g.status)})</span>` : "",
          `<br><span class="ghb-copy" style="opacity:.7;font-size:.78rem">Progress: ${escapeHtml(String(current))}${target > 0 ? ` / ${escapeHtml(String(target))}` : ""}${unit}${target > 0 ? ` · ${pct}%` : ""}</span>`,
          target > 0
            ? `<div style="margin-top:4px;height:8px;border-radius:6px;background:rgba(0,0,0,.18);overflow:hidden"><div style="height:100%;width:${pct}%;background:#6d28d9"></div></div>`
            : "",
          "</div>",
          "<div style=\"display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end\">",
          disabledAttr
            ? ""
            : `<a href="/admin/second-life?editGoalId=${encodeURIComponent(String(g.id))}#goal-form" class="ghb-btn" style="padding:6px 10px;border-radius:6px;border:0;background:#475569;color:#fff;font:inherit;text-decoration:none;cursor:pointer">Edit</a>`,
          `<form method="POST" action="/admin/actions/second-life-goal-delete" style="margin:0">${withThemeField(theme)}<input type="hidden" name="returnTo" value="/admin/second-life"><input type="hidden" name="id" value="${escapeHtml(g.id)}"><button type="submit" class="ghb-btn"${disabledAttr} style="padding:6px 10px;border-radius:6px;border:0;background:#b91c1c;color:#fff;font:inherit;cursor:pointer">Delete</button></form>`,
          "</div>",
          "</li>",
        ].join("");
      }).join("")
    : `<p class="ghb-copy" style="opacity:.7">No goals yet. Goals are gentle long-term aims for the companion; progress advances only from real events, never invented.</p>`;

  const cur = (key, fallback) => (editing && editing[key] != null && editing[key] !== "" ? editing[key] : fallback);

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">✺</span><div>",
    "<h3 class=\"ghb-section-title\">Long-Term Goals</h3>",
    "<p class=\"ghb-copy\">Gentle aims that shape what the companion gravitates toward over time. Progress moves only when something real happens — there is no fake or manual increment.</p>",
    "</div></div>",
    `<ul class="ghb-bullet-list" style="list-style:none;padding:0">${list}</ul>`,
    "<a id=\"goal-form\"></a>",
    editing ? `<p class="ghb-copy" style="margin:0 0 8px;color:#3a7ced"><strong>Editing goal</strong> — <a href="/admin/second-life#goal-form" style="color:inherit">cancel</a></p>` : "",
    `<form method="POST" action="/admin/actions/second-life-goal-save" style="margin-top:12px">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    editing ? `<input type="hidden" name="id" value="${escapeHtml(editing.id)}">` : "",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Goal type</label>",
    renderSelect({ name: "goalType", options: GOAL_TYPES, current: cur("goalType", "custom"), escapeHtml, disabledAttr }),
    "</div>",
    "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Label</label>",
    `<input name="label" type="text" placeholder="What this goal means" value="${escapeHtml(cur("label", ""))}" style="${inputStyle}"${disabledAttr}></div>`,
    "<div style=\"display:flex;gap:8px;margin-bottom:10px\">",
    `<div class="ghb-field" style="flex:1"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Target value</label><input name="targetValue" type="number" min="0" value="${escapeHtml(String(cur("targetValue", 0)))}" style="${inputStyle}"${disabledAttr}></div>`,
    `<div class="ghb-field" style="flex:1"><label class="ghb-section-title" style="font-size:.9rem;display:block;margin-bottom:4px">Unit</label><input name="unit" type="text" placeholder="e.g. regions" value="${escapeHtml(cur("unit", ""))}" style="${inputStyle}"${disabledAttr}></div>`,
    "</div>",
    editing
      ? [
          "<div class=\"ghb-field\" style=\"margin-bottom:10px\"><label class=\"ghb-section-title\" style=\"font-size:.9rem;display:block;margin-bottom:4px\">Status</label>",
          renderSelect({ name: "status", options: GOAL_STATUSES, current: cur("status", "active"), escapeHtml, disabledAttr }),
          "</div>",
        ].join("")
      : "",
    `<button type="submit" class="ghb-btn"${disabledAttr} style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">${editing ? "Update goal" : "Add goal"}</button>`,
    "</form>",
    "</section>",
  ].join("");
}

function renderInitiativePanel({ initiativeSettings, initiatives, escapeHtml, withThemeField, theme }) {
  const cfg = initiativeSettings || {};
  const enabled = Boolean(cfg.enabled);
  const log = Array.isArray(initiatives) ? initiatives : [];
  const logList = log.length
    ? [
        "<ul class=\"ghb-bullet-list\" style=\"list-style:none;padding:0;margin-top:10px\">",
        ...log.map((i) => {
          const when = i.createdAt ? String(i.createdAt) : "";
          return [
            "<li style=\"margin-bottom:8px\">",
            `<strong>${escapeHtml(i.initiativeType || "note")}</strong> <span class="ghb-copy" style="opacity:.7;font-size:.78rem">${escapeHtml(i.status || "proposed")}</span>`,
            i.reason ? `<br><span class="ghb-copy" style="opacity:.85;font-size:.82rem">${escapeHtml(String(i.reason).slice(0, 200))}</span>` : "",
            when ? `<br><span class="ghb-copy" style="opacity:.6;font-size:.75rem">${escapeHtml(when)}</span>` : "",
            "</li>",
          ].join("");
        }),
        "</ul>",
      ].join("")
    : `<p class="ghb-copy" style="opacity:.7;margin-top:10px">No initiatives logged yet. Every proposal — taken or skipped — is recorded here with the reason why.</p>`;

  return [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">➤</span><div>",
    "<h3 class=\"ghb-section-title\">Initiative</h3>",
    "<p class=\"ghb-copy\">When enabled, the companion may occasionally start something on its own — but only from real evidence, never at random. It respects quiet hours, a daily cap, a cooldown, and owner-busy time, and logs the reason for every proposal. Disabled by default. Takes effect on the next restart.</p>",
    "</div></div>",
    `<p class="ghb-copy" style="margin:0 0 10px">Status: <strong>${enabled ? "enabled" : "disabled"}</strong></p>`,
    `<form method="POST" action="/admin/actions/second-life-initiative-save" style="margin:0">`,
    withThemeField(theme),
    "<input type=\"hidden\" name=\"returnTo\" value=\"/admin/second-life\">",
    `<label class="ghb-copy" style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" name="enabled" value="true"${enabled ? " checked" : ""}> Allow the companion to take initiative</label>`,
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px\">",
    `<div class="ghb-field" style="flex:1 1 120px"><label class="ghb-section-title" style="font-size:.85rem;display:block;margin-bottom:4px">Max per day</label><input name="maxPerDay" type="number" min="0" max="50" value="${escapeHtml(String(cfg.maxPerDay ?? 3))}" style="${inputStyle}"></div>`,
    `<div class="ghb-field" style="flex:1 1 120px"><label class="ghb-section-title" style="font-size:.85rem;display:block;margin-bottom:4px">Cooldown (min)</label><input name="cooldownMinutes" type="number" min="0" max="1440" value="${escapeHtml(String(cfg.cooldownMinutes ?? 120))}" style="${inputStyle}"></div>`,
    "</div>",
    "<div style=\"display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px\">",
    `<div class="ghb-field" style="flex:1 1 120px"><label class="ghb-section-title" style="font-size:.85rem;display:block;margin-bottom:4px">Quiet hours start (0–23)</label><input name="quietHoursStart" type="number" min="0" max="23" value="${escapeHtml(String(cfg.quietHoursStart ?? 22))}" style="${inputStyle}"></div>`,
    `<div class="ghb-field" style="flex:1 1 120px"><label class="ghb-section-title" style="font-size:.85rem;display:block;margin-bottom:4px">Quiet hours end (0–23)</label><input name="quietHoursEnd" type="number" min="0" max="23" value="${escapeHtml(String(cfg.quietHoursEnd ?? 7))}" style="${inputStyle}"></div>`,
    "</div>",
    `<button type="submit" class="ghb-btn" style="padding:8px 16px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save initiative settings</button>`,
    "</form>",
    "<h4 class=\"ghb-copy\" style=\"margin:14px 0 0;font-weight:600\">Recent initiative log</h4>",
    logList,
    "</section>",
  ].join("");
}

function renderSecondLifePage({
  companionId = "",
  storeAvailable = false,
  settings = null,
  status = null,
  summary = null,
  relationships = [],
  objectRelationships = [],
  commands = [],
  outfits = [],
  landmarks = [],
  objects = [],
  schedule = [],
  discoveries = [],
  scheduleEditing = null,
  sharedExperiences = [],
  experienceEditing = null,
  goals = [],
  goalEditing = null,
  initiatives = [],
  initiativeSettings = null,
  lifeEngineEnabled = false,
  lifeEngineAutonomy = "medium",
  copyBlock = "",
  theme = "light",
  helpers,
}) {
  const { escapeHtml, withThemeField } = helpers;

  const s = settings || {};
  const disabledAttr = storeAvailable ? "" : " disabled";

  const storeWarning = storeAvailable
    ? ""
    : "<div class=\"ghb-info-strip\" style=\"margin-bottom:16px;background:rgba(254,243,199,.7);border-color:rgba(217,119,6,.3);color:#92400e\">No database is configured, so the Second Life bridge is read-only. Configure Postgres to save settings and accept in-world events.</div>";

  const toggles = BOOLEAN_SETTINGS
    .map((setting) => renderToggle({ setting, value: s[setting.field], escapeHtml, disabledAttr }))
    .join("");
  const textFields = TEXT_SETTINGS
    .map((setting) => renderTextField({ setting, value: s[setting.field], escapeHtml, disabledAttr }))
    .join("");
  const numberFields = NUMBER_SETTINGS
    .map((setting) => renderNumberField({ setting, value: s[setting.field], escapeHtml, disabledAttr }))
    .join("");

  const secretConfigured = Boolean(s.hasSharedSecret);
  const secretField = [
    "<div class=\"ghb-field\" style=\"margin-bottom:14px\">",
    "<label class=\"ghb-section-title\" style=\"font-size:.95rem;display:block;margin-bottom:4px\" for=\"sl-sharedSecret\">Shared Secret</label>",
    `<p class="ghb-copy" style="margin:0 0 6px;opacity:.8">${secretConfigured ? "A secret is configured. Leave blank to keep it, or type a new value to replace it." : "No secret set yet. The bridge API rejects every request until you set one."}</p>`,
    `<input id="sl-sharedSecret" name="sharedSecret" type="password" autocomplete="new-password" value="" placeholder="${secretConfigured ? "•••••••• (unchanged)" : "Set a strong shared secret"}" style="${inputStyle}"${disabledAttr}>`,
    "</div>",
  ].join("");

  // ── Status panels ──────────────────────────────────────────────────────────
  const world = (status && status.worldState) || {};
  const queue = (status && status.queue) || { pending: 0, claimed: 0, completed: 0, failed: 0 };
  const heartbeat = world.lastHeartbeatAt ? String(world.lastHeartbeatAt) : "never";
  const region = world.currentRegion || "—";
  const nearbyAvatars = Array.isArray(world.nearbyAvatars) ? world.nearbyAvatars.length : 0;
  const nearbyObjects = Array.isArray(world.nearbyObjects) ? world.nearbyObjects.length : 0;

  const statusPanel = [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">◉</span><div>",
    "<h3 class=\"ghb-section-title\">Bridge Status</h3>",
    `<p class="ghb-copy">${s.enabled ? "Bridge is <strong>enabled</strong>." : "Bridge is <strong>disabled</strong>."} Agent: <code>${escapeHtml(s.agentName || "—")}</code></p>`,
    "</div></div>",
    "<div style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px\">",
    statTile("Last heartbeat", heartbeat, escapeHtml),
    statTile("Region", region, escapeHtml),
    statTile("Nearby avatars", nearbyAvatars, escapeHtml),
    statTile("Nearby objects", nearbyObjects, escapeHtml),
    "</div>",
    "<div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
    statTile("Queue pending", queue.pending, escapeHtml),
    statTile("Claimed", queue.claimed, escapeHtml),
    statTile("Completed", queue.completed, escapeHtml),
    statTile("Failed", queue.failed, escapeHtml),
    "</div>",
    "</section>",
  ].join("");

  const activityPanel = [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">✦</span><div>",
    "<h3 class=\"ghb-section-title\">Recent Actions</h3>",
    "<p class=\"ghb-copy\">The most recent in-world actions the companion took.</p>",
    "</div></div>",
    renderJournalList(status && status.recentActions, "No actions logged yet.", escapeHtml),
    "<h4 class=\"ghb-copy\" style=\"margin:14px 0 4px;font-weight:600\">Recent Errors</h4>",
    renderJournalList(status && status.recentErrors, "No errors logged.", escapeHtml),
    "</section>",
  ].join("");

  const sum = summary || {};
  const registryPanel = [
    "<section class=\"ghb-card ghb-setting-card\">",
    "<div class=\"ghb-setting-head\"><span class=\"ghb-icon-bubble\">◈</span><div>",
    "<h3 class=\"ghb-section-title\">Registries</h3>",
    "<p class=\"ghb-copy\">Counts of stored bridge data. Detailed management arrives in later bridge phases.</p>",
    "</div></div>",
    "<div style=\"display:flex;gap:10px;flex-wrap:wrap\">",
    statTile("Relationships", sum.relationships || 0, escapeHtml),
    statTile("Outfits", sum.outfits || 0, escapeHtml),
    statTile("Landmarks", sum.landmarks || 0, escapeHtml),
    statTile("Objects", sum.objects || 0, escapeHtml),
    statTile("Commands", sum.commands || 0, escapeHtml),
    statTile("Schedule", sum.schedule || 0, escapeHtml),
    "</div>",
    "</section>",
  ].join("");

  return `<div class="ghb-settings-tab">
${storeWarning}
<section class="ghb-hero">
  <div class="ghb-hero-art" style="background-image:none;background:linear-gradient(135deg,#0f1f55 0%,#1d3a95 40%,#3a7ced 70%,#8bb4fa 100%)"></div>
  <div class="ghb-hero-text">
    <h2 class="ghb-title">Second Life Bridge ✦</h2>
    <p class="ghb-subtitle">Operate the same companion inside Second Life. Configure the agent identity, shared secret, behaviour, and limits — the personality stays the one defined in the Companion tab, shared with Discord.</p>
  </div>
  <aside class="ghb-card ghb-side-card">
    <h3 class="ghb-side-title">How it works</h3>
    <ul class="ghb-bullet-list">
      <li>Set a shared secret and agent identity</li>
      <li>Enable the bridge and local chat</li>
      <li>A relay registers and polls the API</li>
      <li>In-world events run the shared brain</li>
      <li>Replies become in-world commands</li>
    </ul>
    <p class="ghb-copy" style="margin-top:8px">Companion: <code style="background:rgba(124,58,237,.12);padding:2px 6px;border-radius:6px">${escapeHtml(companionId || "—")}</code></p>
  </aside>
</section>

<form id="sl-form" method="POST" action="/admin/actions/second-life-save">
  ${withThemeField(theme)}
  <input type="hidden" name="returnTo" value="/admin/second-life">

  <section class="ghb-main-grid">
    <div class="ghb-left">
      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">⚙</span>
          <div>
            <h3 class="ghb-section-title">Agent &amp; Authentication</h3>
            <p class="ghb-copy">Identity the relay registers, and the shared secret the bridge API requires.</p>
          </div>
        </div>
        ${secretField}
        ${textFields}
        ${numberFields}
      </section>

      <section class="ghb-card ghb-setting-card">
        <div class="ghb-setting-head">
          <span class="ghb-icon-bubble">◐</span>
          <div>
            <h3 class="ghb-section-title">Behaviour</h3>
            <p class="ghb-copy">What the companion is allowed to do in-world.</p>
          </div>
        </div>
        ${toggles}
        <div class="ghb-field-grid" style="margin-top:12px">
          <button type="submit" class="ghb-btn"${disabledAttr} style="padding:10px 18px;border-radius:8px;border:0;background:#3a7ced;color:#fff;font:inherit;cursor:pointer">Save bridge settings</button>
        </div>
      </section>
    </div>
    <div class="ghb-right">
      ${statusPanel}
      ${activityPanel}
      ${registryPanel}
    </div>
  </section>
</form>

<section class="ghb-main-grid" style="margin-top:18px">
  <div class="ghb-left">
    ${renderPeopleObjectsPanel({ relationships, objectRelationships, companionId, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
  <div class="ghb-right">
    ${renderCommandPanel({ commands, copyBlock, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
</section>

<section class="ghb-main-grid" style="margin-top:18px">
  <div class="ghb-left">
    ${renderOutfitPanel({ outfits, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
  <div class="ghb-right">
    ${renderLandmarkPanel({ landmarks, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
</section>

<section class="ghb-main-grid" style="margin-top:18px">
  <div class="ghb-left">
    ${renderObjectPanel({ objects, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
  <div class="ghb-right">
    ${renderLifeEnginePanel({ lifeEngineEnabled, lifeEngineAutonomy, escapeHtml, withThemeField, theme })}
  </div>
</section>

<section class="ghb-main-grid" style="margin-top:18px">
  <div class="ghb-left">
    ${renderSchedulePanel({ schedule, editingEntry: scheduleEditing, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
  <div class="ghb-right">
    ${renderDiscoveryPanel({ discoveries, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
</section>

<section class="ghb-main-grid" style="margin-top:18px">
  <div class="ghb-left">
    ${renderSharedExperiencePanel({ sharedExperiences, editingEntry: experienceEditing, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
  <div class="ghb-right">
    ${renderGoalPanel({ goals, editingEntry: goalEditing, escapeHtml, withThemeField, theme, disabledAttr })}
  </div>
</section>

<section class="ghb-main-grid" style="margin-top:18px">
  <div class="ghb-left">
    ${renderInitiativePanel({ initiativeSettings, initiatives, escapeHtml, withThemeField, theme })}
  </div>
  <div class="ghb-right"></div>
</section>
</div>`;
}

module.exports = {
  renderSecondLifePage,
  BOOLEAN_SETTINGS,
  TEXT_SETTINGS,
  NUMBER_SETTINGS,
  RELATIONSHIP_TIERS,
  REPLY_POLICIES,
  COMMAND_TYPES,
  COMMAND_ALLOWED_TIERS,
  AUTONOMY_LEVELS,
  SCHEDULE_DAYS,
  SCHEDULE_ACTIVITY_TYPES,
  EXPERIENCE_TYPES,
  GOAL_TYPES,
  GOAL_STATUSES,
};
