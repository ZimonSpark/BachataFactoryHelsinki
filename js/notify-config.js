// EmailJS lets the static site send a notification email on nomination submit, without a
// backend. The public key is safe to expose (same model as the Firebase web config).
export const emailjsConfig = {
  publicKey: "d4iRHu3dP30dBsrwb",
  serviceId: "service_nzfvu09",
  templateId: "template_5pqur3h",
};

export const isEmailConfigured =
  emailjsConfig.publicKey !== "PLACEHOLDER" &&
  emailjsConfig.serviceId !== "PLACEHOLDER" &&
  emailjsConfig.templateId !== "PLACEHOLDER";
