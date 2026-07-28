// Single data-access layer used by every page. Transparently switches between the real
// Firebase project and the in-memory mock (see mock-data.js) based on whether
// firebase-config.js has been filled in yet.

import { firebaseConfig, isConfigured, ADMIN_EMAIL } from "./firebase-config.js";
import { generateToken, normalizeContactKey } from "./util.js";
import { mockDancers, mockRequests } from "./mock-data.js";

const SDK = "https://www.gstatic.com/firebasejs/10.13.2";

export const MOCK_MODE = !isConfigured;

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

export async function getDancerByToken(token) {
  if (MOCK_MODE) {
    const d = mockDancers.get(token);
    return d ? { id: token, ...d } : null;
  }
  const { db, firestore } = await getFirebase();
  const snap = await firestore.getDoc(firestore.doc(db, "dancers", token));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createNominationRequest({ nomineeName, nomineeContact, nominatorName, nominatorToken }) {
  const contactKey = normalizeContactKey(nomineeContact);
  const payload = {
    nomineeName: nomineeName.trim(),
    nomineeContact: nomineeContact.trim(),
    contactKey,
    nominatorName: nominatorName.trim(),
    nominatorToken,
    status: "pending",
  };
  if (MOCK_MODE) {
    mockRequests.push({ id: `req${mockRequests.length + 1}`, ...payload, createdAt: new Date().toISOString() });
    return;
  }
  const { db, firestore } = await getFirebase();
  await firestore.addDoc(firestore.collection(db, "nominationRequests"), {
    ...payload,
    createdAt: firestore.serverTimestamp(),
  });
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

export async function listPendingRequests() {
  if (MOCK_MODE) return mockRequests.filter((r) => r.status === "pending");
  const { db, firestore } = await getFirebase();
  const q = firestore.query(firestore.collection(db, "nominationRequests"), firestore.where("status", "==", "pending"));
  const snap = await firestore.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listApprovedDancers() {
  if (MOCK_MODE) return [...mockDancers.entries()].map(([id, d]) => ({ id, ...d }));
  const { db, firestore } = await getFirebase();
  const q = firestore.query(firestore.collection(db, "dancers"), firestore.where("status", "==", "approved"));
  const snap = await firestore.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function approveGroup(contactKey, requests) {
  const nominators = requests.map((r) => ({ name: r.nominatorName, timestamp: r.createdAt }));
  const nomineeName = requests[0].nomineeName;
  const nomineeContact = requests[0].nomineeContact;

  if (MOCK_MODE) {
    let existingToken = [...mockDancers.entries()].find(([, d]) => d.contactKey === contactKey)?.[0];
    if (existingToken) {
      const d = mockDancers.get(existingToken);
      d.nominationCount += requests.length;
      d.nominators.push(...nominators);
    } else {
      existingToken = generateToken();
      mockDancers.set(existingToken, {
        name: nomineeName,
        contact: nomineeContact,
        contactKey,
        status: "approved",
        nominationCount: requests.length,
        nominators,
        approvedAt: new Date().toISOString(),
      });
    }
    requests.forEach((r) => { r.status = "merged"; });
    return existingToken;
  }

  const { db, firestore } = await getFirebase();
  const q = firestore.query(firestore.collection(db, "dancers"), firestore.where("contactKey", "==", contactKey));
  const snap = await firestore.getDocs(q);
  let token;
  if (!snap.empty) {
    const existing = snap.docs[0];
    token = existing.id;
    const data = existing.data();
    await firestore.updateDoc(existing.ref, {
      nominationCount: (data.nominationCount || 0) + requests.length,
      nominators: [...(data.nominators || []), ...nominators],
    });
  } else {
    token = generateToken();
    await firestore.setDoc(firestore.doc(db, "dancers", token), {
      name: nomineeName,
      contact: nomineeContact,
      contactKey,
      status: "approved",
      nominationCount: requests.length,
      nominators,
      approvedAt: firestore.serverTimestamp(),
    });
  }
  await Promise.all(
    requests.map((r) => firestore.updateDoc(firestore.doc(db, "nominationRequests", r.id), { status: "merged" }))
  );
  return token;
}

export async function rejectGroup(requests) {
  if (MOCK_MODE) {
    requests.forEach((r) => { r.status = "rejected"; });
    return;
  }
  const { db, firestore } = await getFirebase();
  await Promise.all(
    requests.map((r) => firestore.updateDoc(firestore.doc(db, "nominationRequests", r.id), { status: "rejected" }))
  );
}

export async function addDancerManually({ name, contact }) {
  const contactKey = normalizeContactKey(contact);
  const token = generateToken();
  const payload = {
    name: name.trim(),
    contact: contact.trim(),
    contactKey,
    status: "approved",
    nominationCount: 0,
    nominators: [],
  };
  if (MOCK_MODE) {
    mockDancers.set(token, { ...payload, approvedAt: new Date().toISOString() });
    return token;
  }
  const { db, firestore } = await getFirebase();
  await firestore.setDoc(firestore.doc(db, "dancers", token), { ...payload, approvedAt: firestore.serverTimestamp() });
  return token;
}
