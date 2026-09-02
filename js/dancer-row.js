// Shared dancer-row rendering + interaction logic used by every admin page that lists
// dancers (admin.html, interested.html, ...). Keeping this in one place means every new
// per-dancer action (toggle role, save notes, etc.) only needs to be wired once.

import { escapeHtml, formatDate, nominationDeadlineMs, formatCountdown } from "./util.js";
import {
  approveDancer,
  addNominator,
  removeLatestNominator,
  removeNominatorAt,
  resetNominationTimer,
  deleteDancer,
  setContacted,
  setContact,
  setNotes,
  setQualifiedOverride,
  setFlaggedRed,
  setInTeam,
  setRole,
  setInterestedChecked,
} from "./data.js";

export function inviteUrl(token) {
  // Built from a fixed root path rather than the current URL — admin pages can be
  // reached without a .html extension via GitHub Pages' clean-URL serving, which
  // broke naive path-stripping.
  return `${location.origin}/invite.html?t=${encodeURIComponent(token)}`;
}

export function adminCountdownText(deadlineMs, sentCount) {
  const remaining = formatCountdown(deadlineMs);
  if (!remaining) {
    return `Nomination window closed${sentCount < 5 ? ` &mdash; only ${sentCount}/5 nominated` : ""}.`;
  }
  return sentCount >= 5
    ? `${remaining} left &middot; already qualified (${sentCount} nominated)`
    : `${remaining} left &middot; ${sentCount}/5 nominated`;
}

export function dancerRow(d, { showInterestedCheckbox = false } = {}) {
  const approved = d.status === "approved";
  const nominators = d.receivedNominators || [];
  const sentNames = d.sentNominatedNames || [];
  const sentCount = d.sentNominationCount || 0;
  const qualifiedGreen = typeof d.qualifiedOverride === "boolean" ? d.qualifiedOverride : sentCount >= 5;
  const flaggedRed = !!d.flaggedRed;
  const inTeam = !!d.inTeam;
  const role = d.role || null;
  const interestedChecked = !!d.interestedChecked;
  const deadlineMs = approved ? nominationDeadlineMs(d.approvedAt) : null;
  return `
    <div class="dancer-row" data-token="${escapeHtml(d.id)}">
      <div class="dancer-row-main">
        ${
          showInterestedCheckbox
            ? `<input
                type="checkbox"
                class="interested-checkbox"
                data-toggle-interested="${escapeHtml(d.id)}"
                ${interestedChecked ? "checked" : ""}
                aria-label="Mark ${escapeHtml(d.name)}"
              />`
            : ""
        }
        <button
          class="status-toggle"
          data-toggle-flag="${escapeHtml(d.id)}"
          data-flagged="${flaggedRed ? "true" : "false"}"
          aria-label="${flaggedRed ? "Flagged — click to reset" : "Click to flag red"}"
          title="${flaggedRed ? "Flagged" : approved ? "Approved" : "Pending"} &middot; click to toggle"
        >${flaggedRed ? "&#10060;" : approved ? "&#9989;" : "&#9203;"}</button>
        <button
          class="role-toggle"
          data-toggle-role="${escapeHtml(d.id)}"
          data-role="${role || ""}"
          aria-label="Dance role: ${role || "unset"}"
          title="Dance role &middot; click to cycle (? / L / F / LF)"
        >${role || "?"}</button>
        <strong class="dancer-name">${escapeHtml(d.name)}</strong>
        <button
          class="badge qualified-badge ${qualifiedGreen ? "qualified-green" : "qualified-red"}"
          data-toggle-qualified="${escapeHtml(d.id)}"
          title="${sentCount}/10 sent &middot; click to toggle green/red"
        >${nominators.length}</button>
        <button
          class="secondary icon-button contact-toggle${d.contacted ? " contacted" : ""}"
          data-contact="${escapeHtml(d.id)}"
          data-contacted="${d.contacted ? "true" : "false"}"
          aria-label="${d.contacted ? "Mark as not contacted" : "Mark as contacted"}"
          title="${d.contacted ? "Contacted" : "Not contacted yet"}"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"></rect><line x1="11" y1="18" x2="13" y2="18"></line></svg>
        </button>
        <button class="secondary" data-copy="${inviteUrl(d.id)}">Copy link</button>
        ${!approved ? `<button data-approve="${escapeHtml(d.id)}">Approve</button>` : ""}
        <button class="secondary icon-button" data-delete="${escapeHtml(d.id)}" data-name-key="${escapeHtml(d.nameKey || "")}" aria-label="Delete nomination" title="Delete nomination">&#128465;</button>
      </div>
      <details>
        <summary>Details</summary>
        <div class="details-body">
          ${
            deadlineMs !== null
              ? `<div class="countdown-row">
                  <p class="countdown-admin${formatCountdown(deadlineMs) ? "" : " expired"}" data-deadline="${deadlineMs}" data-sent-count="${sentCount}">${adminCountdownText(deadlineMs, sentCount)}</p>
                  <button class="secondary icon-button" data-reset-timer="${escapeHtml(d.id)}" aria-label="Reset 48-hour timer" title="Reset 48-hour timer">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                  </button>
                </div>`
              : `<p class="muted">Countdown starts once approved.</p>`
          }
          <label for="contactInput-${escapeHtml(d.id)}">Contact</label>
          <div class="nominator-add-row">
            <input type="text" id="contactInput-${escapeHtml(d.id)}" value="${escapeHtml(d.contact)}" />
            <button class="secondary" data-save-contact="${escapeHtml(d.id)}" aria-label="Save contact">Save</button>
          </div>
          <p class="invite-link">${inviteUrl(d.id)}</p>

          <label for="nomInput-${escapeHtml(d.id)}">Nominator name</label>
          <div class="nominator-add-row">
            <input type="text" id="nomInput-${escapeHtml(d.id)}" placeholder="e.g. Maria Lopez" />
            <button class="secondary" data-add-nominator="${escapeHtml(d.id)}" aria-label="Add nominator">+</button>
            <button class="secondary" data-remove-latest="${escapeHtml(d.id)}" aria-label="Remove latest nominator">&minus;</button>
            <button class="secondary icon-button" data-toggle-edit="${escapeHtml(d.id)}" aria-label="Manage nominators" title="Manage nominators">&#128295;</button>
          </div>

          ${
            nominators.length
              ? `<ul class="nominator-list" data-nominator-list="${escapeHtml(d.id)}">${nominators
                  .map(
                    (n, i) => `<li>
                      <span>${escapeHtml(n.name)} &middot; ${formatDate(n.timestamp)}</span>
                      <button class="secondary icon-button edit-only" data-remove-index="${escapeHtml(d.id)}" data-index="${i}" aria-label="Remove this nominator">&times;</button>
                    </li>`
                  )
                  .join("")}</ul>`
              : `<p class="muted">No nominators on record.</p>`
          }

          <p class="muted" style="margin-top: 1rem">Nominated by them: ${sentCount}/10</p>
          ${
            sentNames.length
              ? `<ul class="nominator-list">${sentNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`
              : `<p class="muted">Hasn't nominated anyone yet.</p>`
          }

          <label for="notesInput-${escapeHtml(d.id)}">Notes</label>
          <textarea id="notesInput-${escapeHtml(d.id)}" rows="3">${escapeHtml(d.notes || "")}</textarea>
          <div class="actions">
            <button class="secondary" data-save-notes="${escapeHtml(d.id)}">Save notes</button>
          </div>

          ${
            approved
              ? `<div class="actions">
                  <button class="team-toggle${inTeam ? " in-team" : ""}" data-toggle-team="${escapeHtml(d.id)}">${inTeam ? "&#10003; Team" : "Team"}</button>
                </div>`
              : ""
          }
        </div>
      </details>
    </div>
  `;
}

// Wires every dancer-row action within `container` to call `refresh()` afterward. Every
// handler here reads only the clicked element's own data attributes, so this is safe to
// call against a container holding any subset of dancer rows (a full list, a filtered
// page, ...).
export function wireDancerRowHandlers(container, refresh) {
  container.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await approveDancer(btn.dataset.approve);
      refresh();
    });
  });
  container.querySelectorAll("[data-toggle-team]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nowInTeam = !btn.classList.contains("in-team");
      btn.disabled = true;
      await setInTeam(btn.dataset.toggleTeam, nowInTeam);
      refresh();
    });
  });
  container.querySelectorAll("[data-toggle-role]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const current = btn.dataset.role || null;
      const next = current === "L" ? "F" : current === "F" ? "LF" : current === "LF" ? null : "L";
      btn.disabled = true;
      await setRole(btn.dataset.toggleRole, next);
      refresh();
    });
  });
  container.querySelectorAll("[data-save-contact]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const token = btn.dataset.saveContact;
      const input = document.getElementById(`contactInput-${token}`);
      if (!input.value.trim()) return;
      btn.disabled = true;
      await setContact(token, input.value);
      refresh();
    });
  });
  container.querySelectorAll("[data-save-notes]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const token = btn.dataset.saveNotes;
      const textarea = document.getElementById(`notesInput-${token}`);
      btn.disabled = true;
      await setNotes(token, textarea.value);
      refresh();
    });
  });
  container.querySelectorAll("[data-add-nominator]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const token = btn.dataset.addNominator;
      const input = document.getElementById(`nomInput-${token}`);
      if (!input.value.trim()) return;
      btn.disabled = true;
      await addNominator(token, input.value);
      refresh();
    });
  });
  container.querySelectorAll("[data-toggle-interested]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      await setInterestedChecked(checkbox.dataset.toggleInterested, checkbox.checked);
      refresh();
    });
  });
  container.querySelectorAll("[data-toggle-flag]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nowFlagged = btn.dataset.flagged !== "true";
      btn.disabled = true;
      await setFlaggedRed(btn.dataset.toggleFlag, nowFlagged);
      refresh();
    });
  });
  container.querySelectorAll("[data-toggle-qualified]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const currentlyGreen = btn.classList.contains("qualified-green");
      btn.disabled = true;
      await setQualifiedOverride(btn.dataset.toggleQualified, !currentlyGreen);
      refresh();
    });
  });
  container.querySelectorAll("[data-reset-timer]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await resetNominationTimer(btn.dataset.resetTimer);
      refresh();
    });
  });
  container.querySelectorAll("[data-remove-latest]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await removeLatestNominator(btn.dataset.removeLatest);
      refresh();
    });
  });
  container.querySelectorAll("[data-remove-index]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await removeNominatorAt(btn.dataset.removeIndex, Number(btn.dataset.index));
      refresh();
    });
  });
  container.querySelectorAll("[data-toggle-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = container.querySelector(`[data-nominator-list="${btn.dataset.toggleEdit}"]`);
      list?.classList.toggle("editing");
    });
  });
  container.querySelectorAll("[data-contact]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nowContacted = btn.dataset.contacted !== "true";
      btn.disabled = true;
      await setContacted(btn.dataset.contact, nowContacted);
      refresh();
    });
  });
  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.dataset.copy;
      const originalLabel = btn.textContent;
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
        } else {
          // Clipboard API needs a secure context (HTTPS); fall back for plain HTTP.
          const tmp = document.createElement("textarea");
          tmp.value = text;
          tmp.style.position = "fixed";
          tmp.style.opacity = "0";
          document.body.appendChild(tmp);
          tmp.select();
          document.execCommand("copy");
          document.body.removeChild(tmp);
        }
        btn.textContent = "Copied!";
      } catch {
        btn.textContent = "Copy failed, select manually";
      }
      setTimeout(() => {
        btn.textContent = originalLabel;
      }, 1500);
    });
  });
  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.armed === "true") {
        clearTimeout(Number(btn.dataset.armTimer));
        btn.disabled = true;
        await deleteDancer(btn.dataset.delete, btn.dataset.nameKey);
        refresh();
        return;
      }
      btn.dataset.armed = "true";
      btn.classList.add("danger-armed");
      btn.dataset.armTimer = String(
        setTimeout(() => {
          btn.dataset.armed = "false";
          btn.classList.remove("danger-armed");
        }, 2000)
      );
    });
  });
}

// Queries the live DOM each tick rather than caching nodes, so it stays correct across
// the full re-renders that every dancer-row action triggers. Call once per page load.
export function startCountdownTicker(container) {
  setInterval(() => {
    container.querySelectorAll("[data-deadline]").forEach((el) => {
      const deadlineMs = Number(el.dataset.deadline);
      const sentCount = Number(el.dataset.sentCount || 0);
      el.textContent = adminCountdownText(deadlineMs, sentCount);
      el.classList.toggle("expired", !formatCountdown(deadlineMs));
    });
  }, 1000);
}
