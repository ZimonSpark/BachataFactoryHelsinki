// EmailJS lets the static site send a notification email on nomination submit, without a
// backend. The public key is safe to expose (same model as the Firebase web config).
export const emailjsConfig = {
  publicKey: "PLACEHOLDER",
  serviceId: "PLACEHOLDER",
  templateId: "PLACEHOLDER",
};

export const isEmailConfigured =
  emailjsConfig.publicKey !== "PLACEHOLDER" &&
  emailjsConfig.serviceId !== "PLACEHOLDER" &&
  emailjsConfig.templateId !== "PLACEHOLDER";
