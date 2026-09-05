import type { AppLocale } from "./config";

export interface AppDictionary {
  locale: AppLocale;
  common: { appName: string; email: string; password: string; name: string; cancel: string; close: string; loading: string; language: string };
  auth: {
    signInTitle: string; signInDescription: string; signIn: string; signUpTitle: string; signUpDescription: string; signUp: string;
    forgotPassword: string; forgotTitle: string; forgotDescription: string; sendResetLink: string; resetSent: string;
    resetTitle: string; resetDescription: string; newPassword: string; resetPassword: string; resetSuccess: string;
    verifyTitle: string; verifyDescription: string; resendVerification: string; verificationSent: string;
    haveAccount: string; needAccount: string; genericError: string; invalidResetLink: string; signOut: string; signOutError: string;
  };
  navigation: { companies: string; members: string; settings: string; openMenu: string; closeMenu: string };
  companies: { title: string; empty: string; open: string; close: string };
  members: {
    title: string; description: string; member: string; role: string; status: string; actions: string;
    owner: string; active: string; revoked: string; makeOwner: string; makeMember: string; restore: string; remove: string;
    removeTitle: string; removeDescription: string; replacement: string; noReplacement: string;
    lastOwner: string; saved: string; genericError: string;
  };
}
