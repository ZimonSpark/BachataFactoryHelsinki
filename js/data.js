// Single data-access layer used by every page. Transparently switches between the real
// Firebase project and the in-memory mock (see mock-data.js) based on whether
// firebase-config.js has been filled in yet.

import { firebaseConfig, isConfigured, ADMIN_EMAIL } from "./firebase-config.js";
import { generateToken, normalizeKey } from "./util.js";
import { mockDancers } from "./mock-data.js";

// Ephemeral, mock-mode-only audit trail (resets on reload, same as the rest of mock state).
const mockNameChangeLog = [];

// Ephemeral, mock-mode-only calendar attendance store: { [date]: string[] of tokens }.
const mockCalendarAttendance = {};

const SDK = "https://www.gstatic.com/firebasejs/10.13.2";

export const MOCK_MODE = !isConfigured;
export const MAX_SENT_NOMINATIONS = 10;

let firebasePromise;
async function getFirebase() {
  if (!firebasePromise) {
    firebasePromise = (async () => {
      const { initializeApp } = await import(`${SDK}/firebase-app.js`);
      const firestore = await import(`${SDK}/firebase-firestore.js`);
      const authMod = await import(`${SDK}/firebase-auth.js`);
      const app = initializeApp(firebaseConfig);
      return { db: firestore.getFirestore(app), firestore, auth: authMod.getAuth(app), authMod };
    })();
  }
  return firebasePromise;
}

// Dancers are matched/deduped by their (normalized) name, not contact info — nominators
// often type descriptive text instead of a real email/phone, so name is the more reliable key.
function nameDocId(nameKey) {
  return nameKey.replace(/\//g, "_").slice(0, 1500);
}

export async function getDancerByToken(token) {
  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    return d ? { id: token, ...d } : null;
  }
  const { db, firestore } = await getFirebase();
  const snap = await firestore.getDoc(firestore.doc(db, "dancers", token));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Lets a dancer fill in their proper name from their own invite page. Also refreshes the
// nameIndex so future nominations-by-name match this record under the new name too, and
// logs the before/after to nameChangeLog so the admin can spot misuse (e.g. someone
// overwriting their name with a different real person's name).
export async function updateOwnName(token, firstName, lastName) {
  const name = `${firstName.trim()} ${lastName.trim()}`.trim();
  if (!name) return;
  const nameKey = normalizeKey(name);

  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    const oldName = d.name;
    d.name = name;
    d.nameKey = nameKey;
    if (oldName !== name) {
      mockNameChangeLog.push({ token, oldName, newName: name, timestamp: new Date().toISOString() });
    }
    return;
  }

  const { db, firestore } = await getFirebase();
  const dancerRef = firestore.doc(db, "dancers", token);
  const dancerSnap = await firestore.getDoc(dancerRef);
  const oldName = dancerSnap.data()?.name || "";

  const indexRef = firestore.doc(db, "nameIndex", nameDocId(nameKey));
  const indexSnap = await firestore.getDoc(indexRef);

  const batch = firestore.writeBatch(db);
  batch.update(dancerRef, { name, nameKey });
  // Only write the index if this exact nameKey is genuinely new — writing to an existing
  // doc is an "update" under the rules (admin-only), even via set(), and a name that was
  // used before (e.g. reverting an edit) would already have one.
  if (!indexSnap.exists()) {
    batch.set(indexRef, { token });
  }
  if (oldName !== name) {
    batch.set(firestore.doc(firestore.collection(db, "nameChangeLog")), {
      token,
      oldName,
      newName: name,
      timestamp: firestore.serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function listNameChangeLog() {
  if (MOCK_MODE) {
    return [...mockNameChangeLog].reverse();
  }
  const { db, firestore } = await getFirebase();
  const q = firestore.query(
    firestore.collection(db, "nameChangeLog"),
    firestore.orderBy("timestamp", "desc"),
    firestore.limit(200)
  );
  const snap = await firestore.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Nominator is the already-fetched dancer record for the person submitting the nomination
// (looked up via their own invite token) — their name is trusted from that record, never
// typed in by hand.
export async function submitNomination({ nomineeName, nomineeContact, nominator }) {
  const nameKey = normalizeKey(nomineeName);
  const nominatorEntry = { name: nominator.name, timestamp: new Date(), nominatorToken: nominator.id };

  if (MOCK_MODE) {
    const existing = [...mockDancers.values()].find((d) => d.nameKey === nameKey);
    if (existing) {
      existing.receivedNominationCount += 1;
      existing.receivedNominators = [...existing.receivedNominators, nominatorEntry];
    } else {
      mockDancers.set(generateToken(), {
        name: nomineeName.trim(),
        contact: nomineeContact.trim(),
        nameKey,
        status: "pending",
        receivedNominationCount: 1,
        receivedNominators: [nominatorEntry],
        sentNominationCount: 0,
        sentNominatedNames: [],
      });
    }
    const me = mockDancers.get(nominator.id);
    me.sentNominationCount += 1;
    me.sentNominatedNames = [...me.sentNominatedNames, nomineeName.trim()];
    return;
  }

  const { db, firestore } = await getFirebase();
  const indexRef = firestore.doc(db, "nameIndex", nameDocId(nameKey));
  const indexSnap = await firestore.getDoc(indexRef);
  const batch = firestore.writeBatch(db);

  if (indexSnap.exists()) {
    const targetToken = indexSnap.data().token;
    const targetRef = firestore.doc(db, "dancers", targetToken);
    const targetSnap = await firestore.getDoc(targetRef);
    const targetData = targetSnap.data();
    batch.update(targetRef, {
      receivedNominationCount: (targetData.receivedNominationCount || 0) + 1,
      receivedNominators: [...(targetData.receivedNominators || []), nominatorEntry],
    });
  } else {
    const newToken = generateToken();
    batch.set(firestore.doc(db, "dancers", newToken), {
      name: nomineeName.trim(),
      contact: nomineeContact.trim(),
      nameKey,
      status: "pending",
      receivedNominationCount: 1,
      receivedNominators: [nominatorEntry],
      sentNominationCount: 0,
      sentNominatedNames: [],
      createdAt: firestore.serverTimestamp(),
    });
    batch.set(indexRef, { token: newToken });
  }

  batch.update(firestore.doc(db, "dancers", nominator.id), {
    sentNominationCount: (nominator.sentNominationCount || 0) + 1,
    sentNominatedNames: [...(nominator.sentNominatedNames || []), nomineeName.trim()],
  });

  await batch.commit();
}

export function onAdminAuthChange(callback) {
  if (MOCK_MODE) {
    callback({ signedIn: false, isAdmin: false, email: null });
    return () => {};
  }
  let unsub = () => {};
  getFirebase().then(({ auth, authMod }) => {
    unsub = authMod.onAuthStateChanged(auth, (user) => {
      callback({
        signedIn: !!user,
        isAdmin: !!user && user.email === ADMIN_EMAIL,
        email: user?.email ?? null,
      });
    });
  });
  return () => unsub();
}

export async function signInAdmin() {
  if (MOCK_MODE) throw new Error("Sign-in isn't available in local preview mode.");
  const { auth, authMod } = await getFirebase();
  await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
}

export async function signOutAdmin() {
  if (MOCK_MODE) return;
  const { auth, authMod } = await getFirebase();
  await authMod.signOut(auth);
}

export async function listAllDancers() {
  let list;
  if (MOCK_MODE) {
    list = [...mockDancers.entries()].map(([id, d]) => ({ id, ...d }));
  } else {
    const { db, firestore } = await getFirebase();
    const snap = await firestore.getDocs(firestore.collection(db, "dancers"));
    list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return list.sort((a, b) => {
    const aFlagged = a.flaggedRed ? 1 : 0;
    const bFlagged = b.flaggedRed ? 1 : 0;
    if (aFlagged !== bFlagged) return aFlagged - bFlagged;
    return (b.receivedNominators?.length || 0) - (a.receivedNominators?.length || 0);
  });
}

// Public-facing counts for invite.html. Firestore blocks non-admin "list" queries on the
// dancers collection (that's what keeps invite tokens unguessable), so these two numbers
// live in their own doc that only the admin dashboard is allowed to write — see
// refreshPublicStats, called from admin.html on every dashboard load.
export async function getPublicStats() {
  if (MOCK_MODE) {
    const list = [...mockDancers.values()];
    return {
      nomineeCount: list.length,
      totalNominations: list.reduce((sum, d) => sum + (d.receivedNominationCount || 0), 0),
    };
  }
  const { db, firestore } = await getFirebase();
  const snap = await firestore.getDoc(firestore.doc(db, "stats", "global"));
  if (!snap.exists()) return { nomineeCount: 0, totalNominations: 0 };
  const data = snap.data();
  return { nomineeCount: data.nomineeCount || 0, totalNominations: data.totalNominations || 0 };
}

// Recomputes and republishes the public stats doc from an already-fetched dancers list
// (the admin dashboard's own listAllDancers() result), so it doesn't need a second query.
export async function refreshPublicStats(dancers) {
  if (MOCK_MODE) return;
  const nomineeCount = dancers.length;
  const totalNominations = dancers.reduce((sum, d) => sum + (d.receivedNominationCount || 0), 0);
  const { db, firestore } = await getFirebase();
  await firestore.setDoc(firestore.doc(db, "stats", "global"), { nomineeCount, totalNominations });
}

export async function approveDancer(token) {
  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    d.status = "approved";
    d.approvedAt = new Date().toISOString();
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), {
    status: "approved",
    approvedAt: firestore.serverTimestamp(),
  });
}

// Restarts the 48-hour nomination window for an already-approved dancer, e.g. when the
// admin wants to give them a fresh 48 hours after contacting them again.
export async function resetNominationTimer(token) {
  if (MOCK_MODE) {
    mockDancers.get(token).approvedAt = new Date().toISOString();
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), {
    approvedAt: firestore.serverTimestamp(),
  });
}

function nominatorTimestampMs(entry) {
  const t = entry?.timestamp;
  if (t?.toDate) return t.toDate().getTime();
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function latestNominatorIndex(list) {
  let best = 0;
  let bestMs = nominatorTimestampMs(list[0]);
  for (let i = 1; i < list.length; i++) {
    const ms = nominatorTimestampMs(list[i]);
    if (ms >= bestMs) {
      best = i;
      bestMs = ms;
    }
  }
  return best;
}

// Admin-side corrections: every count change is tied to an actual nominator name/timestamp
// so the received count and the nominators list can never drift apart.
export async function addNominator(token, nominatorName) {
  const name = nominatorName.trim();
  if (!name) return;
  const entry = { name, timestamp: new Date() };
  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    d.receivedNominators = [...(d.receivedNominators || []), entry];
    d.receivedNominationCount = d.receivedNominators.length;
    return;
  }
  const { db, firestore } = await getFirebase();
  const ref = firestore.doc(db, "dancers", token);
  const snap = await firestore.getDoc(ref);
  const updated = [...(snap.data().receivedNominators || []), entry];
  await firestore.updateDoc(ref, { receivedNominators: updated, receivedNominationCount: updated.length });
}

export async function removeLatestNominator(token) {
  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    const list = d.receivedNominators || [];
    if (!list.length) return;
    const idx = latestNominatorIndex(list);
    d.receivedNominators = list.filter((_, i) => i !== idx);
    d.receivedNominationCount = d.receivedNominators.length;
    return;
  }
  const { db, firestore } = await getFirebase();
  const ref = firestore.doc(db, "dancers", token);
  const snap = await firestore.getDoc(ref);
  const list = snap.data().receivedNominators || [];
  if (!list.length) return;
  const idx = latestNominatorIndex(list);
  const updated = list.filter((_, i) => i !== idx);
  await firestore.updateDoc(ref, { receivedNominators: updated, receivedNominationCount: updated.length });
}

export async function removeNominatorAt(token, index) {
  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    const list = d.receivedNominators || [];
    d.receivedNominators = list.filter((_, i) => i !== index);
    d.receivedNominationCount = d.receivedNominators.length;
    return;
  }
  const { db, firestore } = await getFirebase();
  const ref = firestore.doc(db, "dancers", token);
  const snap = await firestore.getDoc(ref);
  const list = snap.data().receivedNominators || [];
  const updated = list.filter((_, i) => i !== index);
  await firestore.updateDoc(ref, { receivedNominators: updated, receivedNominationCount: updated.length });
}

export async function setContacted(token, contacted) {
  if (MOCK_MODE) {
    mockDancers.get(token).contacted = contacted;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { contacted });
}

export async function setContact(token, contact) {
  const value = contact.trim();
  if (!value) return;
  if (MOCK_MODE) {
    mockDancers.get(token).contact = value;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { contact: value });
}

// Free-text admin notes, private to the dashboard (never shown to the dancer). Unlike
// contact, an empty value is valid — it's how the admin clears a note.
export async function setNotes(token, notes) {
  const value = notes.trim();
  if (MOCK_MODE) {
    mockDancers.get(token).notes = value;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { notes: value });
}

// Blue checkbox on the interested-people list — a plain manual tick/untick with no
// other logic attached, purely for the admin's own tracking.
export async function setInterestedChecked(token, checked) {
  if (MOCK_MODE) {
    mockDancers.get(token).interestedChecked = checked;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { interestedChecked: checked });
}

// Manual override for the "sent nominations" indicator color, so the admin can flag a
// dancer green/red by hand regardless of their actual sentNominationCount.
export async function setQualifiedOverride(token, qualified) {
  if (MOCK_MODE) {
    mockDancers.get(token).qualifiedOverride = qualified;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { qualifiedOverride: qualified });
}

// Manual flag for a still-pending dancer, so the admin can mark one with a red X (e.g. to
// note a rejection) instead of the default hourglass, purely as a visual reminder.
export async function setFlaggedRed(token, flagged) {
  if (MOCK_MODE) {
    mockDancers.get(token).flaggedRed = flagged;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { flaggedRed: flagged });
}

// Moves an approved dancer between the "Nominated dancers" and "Dancers in the team"
// sections on the admin dashboard.
export async function setInTeam(token, inTeam) {
  if (MOCK_MODE) {
    mockDancers.get(token).inTeam = inTeam;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { inTeam });
}

// Dance role, cycled ? -> L (leader) -> F (follower) -> LF (both) -> ? by the admin.
// null means unset (shown as "?"); Firestore can't store undefined, so null it is.
export async function setRole(token, role) {
  if (MOCK_MODE) {
    mockDancers.get(token).role = role;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { role: role ?? null });
}

// One doc per Friday in the calendarAttendance collection, { participants: string[] of
// dancer tokens, notes: string }. A date with no doc has no explicit record yet —
// calendar.html treats that as "defaults to the current team roster, no notes" rather
// than writing a doc up front.
export async function listCalendarAttendance() {
  if (MOCK_MODE) {
    return { ...mockCalendarAttendance };
  }
  const { db, firestore } = await getFirebase();
  const snap = await firestore.getDocs(firestore.collection(db, "calendarAttendance"));
  const result = {};
  snap.docs.forEach((d) => {
    result[d.id] = d.data();
  });
  return result;
}

// merge: true because participants and notes are saved independently (different buttons)
// and neither write should clobber the other field.
export async function setFridayAttendance(date, participantTokens) {
  if (MOCK_MODE) {
    mockCalendarAttendance[date] = { ...(mockCalendarAttendance[date] || {}), participants: participantTokens };
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.setDoc(firestore.doc(db, "calendarAttendance", date), { participants: participantTokens }, { merge: true });
}

export async function setFridayNotes(date, notes) {
  const value = notes.trim();
  if (MOCK_MODE) {
    mockCalendarAttendance[date] = { ...(mockCalendarAttendance[date] || {}), notes: value };
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.setDoc(firestore.doc(db, "calendarAttendance", date), { notes: value }, { merge: true });
}

export async function deleteDancer(token, nameKey) {
  if (MOCK_MODE) {
    mockDancers.delete(token);
    return;
  }
  const { db, firestore } = await getFirebase();
  const batch = firestore.writeBatch(db);
  batch.delete(firestore.doc(db, "dancers", token));
  if (nameKey) {
    batch.delete(firestore.doc(db, "nameIndex", nameDocId(nameKey)));
  }
  await batch.commit();
}

export async function addDancerManually({ name, contact }) {
  const nameKey = normalizeKey(name);
  const token = generateToken();
  const payload = {
    name: name.trim(),
    contact: contact.trim(),
    nameKey,
    status: "approved",
    receivedNominationCount: 0,
    receivedNominators: [],
    sentNominationCount: 0,
    sentNominatedNames: [],
  };
  if (MOCK_MODE) {
    mockDancers.set(token, { ...payload, approvedAt: new Date().toISOString() });
    return token;
  }
  const { db, firestore } = await getFirebase();
  const batch = firestore.writeBatch(db);
  batch.set(firestore.doc(db, "dancers", token), { ...payload, approvedAt: firestore.serverTimestamp() });
  batch.set(firestore.doc(db, "nameIndex", nameDocId(nameKey)), { token });
  await batch.commit();
  return token;
}

// Bulk-import helper for nominations collected before the site existed (e.g. an offline
// spreadsheet). Matches by name like everything else; safe to re-run — merges any new
// nominator names into an existing record instead of creating a duplicate.
export async function createPendingNominee({ name, contact, nominatorNames }) {
  const nameKey = normalizeKey(name);
  const now = new Date();
  const newNominators = (nominatorNames || []).map((n) => ({ name: n.trim(), timestamp: now }));

  if (MOCK_MODE) {
    const existingToken = [...mockDancers.entries()].find(([, d]) => d.nameKey === nameKey)?.[0];
    if (existingToken) {
      const d = mockDancers.get(existingToken);
      const existingNames = new Set((d.receivedNominators || []).map((n) => n.name.toLowerCase()));
      d.receivedNominators = [...(d.receivedNominators || []), ...newNominators.filter((n) => !existingNames.has(n.name.toLowerCase()))];
      d.receivedNominationCount = d.receivedNominators.length;
      return existingToken;
    }
    const token = generateToken();
    mockDancers.set(token, {
      name: name.trim(),
      contact: contact.trim(),
      nameKey,
      status: "pending",
      receivedNominationCount: newNominators.length,
      receivedNominators: newNominators,
      sentNominationCount: 0,
      sentNominatedNames: [],
    });
    return token;
  }

  const { db, firestore } = await getFirebase();
  const indexRef = firestore.doc(db, "nameIndex", nameDocId(nameKey));
  const indexSnap = await firestore.getDoc(indexRef);

  if (indexSnap.exists()) {
    const token = indexSnap.data().token;
    const ref = firestore.doc(db, "dancers", token);
    const snap = await firestore.getDoc(ref);
    const existing = snap.data().receivedNominators || [];
    const existingNames = new Set(existing.map((n) => n.name.toLowerCase()));
    const updated = [...existing, ...newNominators.filter((n) => !existingNames.has(n.name.toLowerCase()))];
    await firestore.updateDoc(ref, { receivedNominators: updated, receivedNominationCount: updated.length });
    return token;
  }

  const token = generateToken();
  const batch = firestore.writeBatch(db);
  batch.set(firestore.doc(db, "dancers", token), {
    name: name.trim(),
    contact: contact.trim(),
    nameKey,
    status: "pending",
    receivedNominationCount: newNominators.length,
    receivedNominators: newNominators,
    sentNominationCount: 0,
    sentNominatedNames: [],
    createdAt: firestore.serverTimestamp(),
  });
  batch.set(indexRef, { token });
  await batch.commit();
  return token;
}
