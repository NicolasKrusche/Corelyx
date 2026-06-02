const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "guerrillamail.net",
  "guerrillamail.org", "guerrillamailblock.com", "grr.la", "spam4.me",
  "trashmail.com", "trashmail.me", "trashmail.net", "trashmail.at",
  "trashmail.io", "trashmail.org", "trashmail.de", "trashmail.fr",
  "throwaway.email", "throwam.com", "yopmail.com", "yopmail.fr",
  "10minutemail.com", "10minutemail.net", "10minutemail.org",
  "tempmail.com", "tempmail.net", "temp-mail.org", "temp-mail.ru",
  "tempr.email", "tempinbox.com", "filzmail.com", "mailnull.com",
  "spamgourmet.com", "dispostable.com", "maildrop.cc", "mailnesia.com",
  "fakeinbox.com", "sharklasers.com", "discard.email", "getnada.com",
  "spamfree24.org", "mailnull.com", "cuvox.de", "dayrep.com",
  "einrot.com", "fleckens.hu", "gustr.com", "jourrapide.com",
  "superrito.com", "teleworm.us", "armyspy.com", "rhyta.com",
  "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "sogetthis.com", "suremail.info", "throwam.com", "spamgob.com",
  "mailexpire.com", "spamex.com", "mailscrap.com", "trashdevil.com",
  "trashdevil.de", "spamcannibal.com", "spamcon.org", "spam.la",
  "safetymail.info", "noblepioneer.com", "receiveee.com",
  "mytemp.email", "tmpmail.net", "tmpmail.org", "tmpmail.com",
  "otherinbox.com", "mailtemp.info", "fakemailgenerator.com",
  "spamgob.com", "inoutmail.de", "inoutmail.eu", "inoutmail.info",
  "xagloo.co", "spamcorpse.com", "spamfree.eu",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}
