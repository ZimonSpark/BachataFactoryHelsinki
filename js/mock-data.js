// In-memory stand-in for Firestore, used only when firebase-config.js still has PLACEHOLDER
// values. Lets us click through the whole site locally before the real Firebase project exists.
// Nothing here persists across a page reload.

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

export const mockDancers = new Map([
  [
    "demo1234a",
    {
      name: "Maria Lopez",
      contact: "maria@example.com",
      nameKey: "marialopez",
      status: "approved",
      receivedNominationCount: 3,
      receivedNominators: [
        { name: "Ana Silva", timestamp: daysAgo(5), nominatorToken: "seed0" },
        { name: "Jonas Berg", timestamp: daysAgo(3), nominatorToken: "seed1" },
        { name: "Pekka Niemi", timestamp: daysAgo(1), nominatorToken: "seed2" },
      ],
      sentNominationCount: 2,
      sentNominatedNames: ["Elena Kovac", "Tomas Virtanen"],
      approvedAt: daysAgo(6),
    },
  ],
  [
    "midcount1",
    {
      name: "Liisa Aho",
      contact: "liisa@example.com",
      nameKey: "liisaaho",
      status: "approved",
      receivedNominationCount: 1,
      receivedNominators: [{ name: "Maria Lopez", timestamp: daysAgo(2), nominatorToken: "demo1234a" }],
      sentNominationCount: 7,
      sentNominatedNames: ["A", "B", "C", "D", "E", "F", "G"],
      approvedAt: daysAgo(4),
    },
  ],
  [
    "fullcount1",
    {
      name: "Petra Salo",
      contact: "petra@example.com",
      nameKey: "petrasalo",
      status: "approved",
      receivedNominationCount: 0,
      receivedNominators: [],
      sentNominationCount: 10,
      sentNominatedNames: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
      approvedAt: daysAgo(3),
    },
  ],
  [
    "pendingnom1",
    {
      name: "Elena Kovac",
      contact: "elena@example.com",
      nameKey: "elenakovac",
      status: "pending",
      receivedNominationCount: 2,
      receivedNominators: [
        { name: "Maria Lopez", timestamp: daysAgo(1), nominatorToken: "demo1234a" },
        { name: "Jonas Berg", timestamp: daysAgo(1), nominatorToken: "seed1" },
      ],
      sentNominationCount: 0,
      sentNominatedNames: [],
    },
  ],
]);
