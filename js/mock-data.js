// In-memory stand-in for Firestore, used only when firebase-config.js still has PLACEHOLDER
// values. Lets us click through the whole site locally before the real Firebase project exists.
// Nothing here persists across a page reload.

export const mockDancers = new Map([
  [
    "demo1234a",
    {
      name: "Maria Lopez",
      contact: "maria@example.com",
      contactKey: "maria@example.com",
      status: "approved",
      nominationCount: 2,
      nominators: [
        { name: "Ana Silva", timestamp: new Date().toISOString() },
        { name: "Jonas Berg", timestamp: new Date().toISOString() },
      ],
      approvedAt: new Date().toISOString(),
    },
  ],
]);

export const mockRequests = [
  {
    id: "req1",
    nomineeName: "Elena Kovac",
    nomineeContact: "elena@example.com",
    contactKey: "elena@example.com",
    nominatorName: "Maria Lopez",
    nominatorToken: "demo1234a",
    createdAt: new Date().toISOString(),
    status: "pending",
  },
  {
    id: "req2",
    nomineeName: "Elena Kovac",
    nomineeContact: "elena@example.com",
    contactKey: "elena@example.com",
    nominatorName: "Jonas Berg",
    nominatorToken: "demo1234a",
    createdAt: new Date().toISOString(),
    status: "pending",
  },
];
