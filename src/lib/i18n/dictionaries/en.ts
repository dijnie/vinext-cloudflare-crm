import type { AppDictionary } from "../dictionary";

export const en = {
  locale: "en",
  common: { appName: "CRM", email: "Email", password: "Password", name: "Full name", cancel: "Cancel", close: "Close", loading: "Working…", language: "Language" },
  auth: {
    signInTitle: "Sign in", signInDescription: "Sign in with your verified email account.", signIn: "Sign in",
    signUpTitle: "Create an account", signUpDescription: "Start using the shared CRM workspace.", signUp: "Sign up",
    forgotPassword: "Forgot password?", forgotTitle: "Recover your password", forgotDescription: "Enter your email to receive a password reset link.",
    sendResetLink: "Send reset link", resetSent: "If the email is valid, a recovery link has been sent.",
    resetTitle: "Reset your password", resetDescription: "Choose a new password for your account.", newPassword: "New password",
    resetPassword: "Reset password", resetSuccess: "Your password was reset. You can now sign in.", verifyTitle: "Check your email",
    verifyDescription: "Open the verification link sent to your email before signing in.", resendVerification: "Resend verification email",
    verificationSent: "The verification email was sent again.", haveAccount: "Already have an account?", needAccount: "Need an account?",
    genericError: "Unable to continue. Check your details and try again.", invalidResetLink: "This password reset link is invalid or has expired.", signOut: "Sign out", signOutError: "Unable to sign out. Try again.",
  },
  navigation: { companies: "Companies", members: "Members", settings: "Settings", openMenu: "Open menu", closeMenu: "Close menu" },
  companies: { title: "Companies", empty: "No companies yet", open: "Open details", close: "Close" },
  members: {
    title: "Members", description: "Manage access to the shared CRM workspace.", member: "Member", role: "Role", status: "Status",
    actions: "Actions", owner: "Owner", active: "Active", revoked: "Revoked", makeOwner: "Make owner", makeMember: "Make member",
    restore: "Restore", remove: "Revoke access", removeTitle: "Revoke member access",
    removeDescription: "Records owned by this member must be reassigned or left unassigned.", replacement: "Reassign records to",
    noReplacement: "Leave unassigned", lastOwner: "You cannot remove the last owner. Make another member an owner first.",
    saved: "Member updated.", genericError: "Unable to update this member.",
  },
} satisfies AppDictionary;
