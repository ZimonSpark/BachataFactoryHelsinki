// Single data-access layer used by every page. Transparently switches between the real
// Firebase project and the in-memory mock (see mock-data.js) based on whether
// firebase-config.js has been filled in yet.

import { firebaseConfig, isConfigured, ADMIN_EMAIL } from "./firebase-config.js";
import { generateToken, normalizeKey } from "./util.js";
import { mockDancers } from "./mock-data.js";

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
  return list.sort((a, b) => (b.receivedNominationCount || 0) - (a.receivedNominationCount || 0));
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

export async function adjustReceivedCount(token, delta) {
  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    d.receivedNominationCount = Math.max(0, d.receivedNominationCount + delta);
    return;
  }
  const { db, firestore } = await getFirebase();
  const ref = firestore.doc(db, "dancers", token);
  const snap = await firestore.getDoc(ref);
  const current = snap.data().receivedNominationCount || 0;
  await firestore.updateDoc(ref, { receivedNominationCount: Math.max(0, current + delta) });
}

export async function setContacted(token, contacted) {
  if (MOCK_MODE) {
    mockDancers.get(token).contacted = contacted;
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.updateDoc(firestore.doc(db, "dancers", token), { contacted });
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
