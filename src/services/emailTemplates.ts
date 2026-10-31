import fs from 'fs';
import path from 'path';

/**
 * HTML entities escaper for user-provided data in email templates.
 * Prevents injection attacks into email clients.
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface ExpiryEmailTemplateData {
  recipientName: string;
  documentTitle: string;
  documentCategory: string;
  authorityName: string;
  maskedNumber: string;
  expiryDateStr: string;
  daysRemaining: number;
  milestone: number;
  preferredLang: 'ml' | 'en';
  vaultUrl: string;
}

export function getEmailAttachments(): Array<{ filename: string; path: string; cid: string }> {
  const headerHouseFile = path.join(process.cwd(), 'public', 'assets', 'email-header-house-vault.png');
  const mascotAlertFile = path.join(process.cwd(), 'public', 'assets', 'email-mascot-alert.png');
  const calFile = path.join(process.cwd(), 'public', 'assets', 'email-calendar-alert.png');

  const attachments: Array<{ filename: string; path: string; cid: string }> = [];
  if (fs.existsSync(headerHouseFile)) {
    attachments.push({ filename: 'house-vault.png', path: headerHouseFile, cid: 'emailHeaderHouse' });
  }
  if (fs.existsSync(mascotAlertFile)) {
    attachments.push({ filename: 'mascot-alert.png', path: mascotAlertFile, cid: 'emailMascotAlert' });
  }
  if (fs.existsSync(calFile)) {
    attachments.push({ filename: 'calendar.png', path: calFile, cid: 'emailCalendar' });
  }
  return attachments;
}

/**
 * Swapped Image Positions:
 * - Top Left Header: 3D House Vault Logo (`email-header-house-vault.png`)
 * - Hero Body Right: 3D Robot Mascot holding the Alert Clipboard (`email-mascot-alert.png`)
 * - Alert Callout Right: 3D Red Calendar Overdue (`email-calendar-alert.png`)
 */
export function buildExpiryEmailContent(data: ExpiryEmailTemplateData): {
  subject: string;
  html: string;
  text: string;
} {
  const isExpired = data.daysRemaining < 0;
  const isExpiresToday = data.daysRemaining === 0;
  const isMl = data.preferredLang === 'ml';

  // Localized Subject Line
  let subject: string;
  if (isExpired) {
    const overdue = Math.abs(data.daysRemaining);
    subject = isMl
      ? `[കുടുംബ വോൾട്ട്] കാലാവധി കഴിഞ്ഞു: ${data.documentTitle} (${overdue} ദിവസങ്ങൾ മുൻപ്)`
      : `Action Required: Your ${data.documentTitle} has expired`;
  } else if (isExpiresToday) {
    subject = isMl
      ? `[കുടുംബ വോൾട്ട്] അടിയന്തരം: ${data.documentTitle} ഇന്ന് അവസാനിക്കുന്നു`
      : `Action Required: Your ${data.documentTitle} expires today`;
  } else if (data.daysRemaining === 1) {
    subject = isMl
      ? `[കുടുംബ വോൾട്ട്] അതിനിർണ്ണായകം: ${data.documentTitle} നാളെ അവസാനിക്കുന്നു`
      : `Action Required: Your ${data.documentTitle} expires tomorrow`;
  } else {
    subject = isMl
      ? `[കുടുംബ വോൾട്ട്] കാലാവധി ഓർമ്മപ്പെടുത്തൽ: ${data.documentTitle} ${data.daysRemaining} ദിവസങ്ങൾക്കുള്ളിൽ അവസാനിക്കുന്നു`
      : `Reminder: Your ${data.documentTitle} expires in ${data.daysRemaining} days`;
  }

  // Safe escaping
  const safeRecipient = escapeHtml(data.recipientName || 'Family Member');
  const safeDocTitle = escapeHtml(data.documentTitle);
  const safeCategory = escapeHtml(data.documentCategory);
  const safeAuthority = escapeHtml(data.authorityName);
  const safeMaskedNumber = escapeHtml(data.maskedNumber);
  const safeExpiryDate = escapeHtml(data.expiryDateStr);
  const safeVaultUrl = escapeHtml(data.vaultUrl);

  const statusBadgeText = isExpired
    ? 'കാലാവധി കഴിഞ്ഞു'
    : isExpiresToday
    ? 'ഇന്ന് അവസാനിക്കുന്നു'
    : data.daysRemaining <= 7
    ? 'അടിയന്തിരം'
    : 'ഉടൻ പുതുക്കണം';

  const statusBadgeTextEn = isExpired
    ? 'Expired'
    : isExpiresToday
    ? 'Expires Today'
    : data.daysRemaining <= 7
    ? 'Urgent (<= 7 days)'
    : 'Expiring Soon';

  const headerHouseSrc = 'cid:emailHeaderHouse';
  const mascotAlertSrc = 'cid:emailMascotAlert';
  const calSrc = 'cid:emailCalendar';

  const greetingSubtitle = isExpired
    ? `നിങ്ങളുടെ <strong>${safeDocTitle}</strong> കാലാവധി കഴിഞ്ഞിരിക്കുന്നു (${Math.abs(data.daysRemaining)} ദിവസം മുൻപ്). ദയവായി അതിന്റെ പുതുക്കൽ നടപടികൾ ഉടൻ ആരംഭിക്കുക.`
    : isExpiresToday
    ? `നിങ്ങളുടെ <strong>${safeDocTitle}</strong> കാലാവധി ഇന്ന് അവസാനിക്കുന്നു. ദയവായി അതിന്റെ പുതുക്കൽ നടപടികൾ ഉടൻ ആരംഭിക്കുക.`
    : data.daysRemaining === 1
    ? `നിങ്ങളുടെ <strong>${safeDocTitle}</strong> കാലാവധി നാളെ അവസാനിക്കുന്നു. ദയവായി അതിന്റെ പുതുക്കൽ നടപടികൾ ഉടൻ ആരംഭിക്കുക.`
    : `നിങ്ങളുടെ <strong>${safeDocTitle}</strong> കാലാവധി ${data.daysRemaining} ദിവസങ്ങൾക്കുള്ളിൽ (${safeExpiryDate}) അവസാനിക്കും. ദയവായി പുതുക്കൽ വിവരങ്ങൾ പരിശോധിക്കുക.`;

  const calloutTitle = isExpired
    ? 'ഈ രേഖയുടെ കാലാവധി കഴിഞ്ഞിരിക്കുന്നു!'
    : isExpiresToday
    ? 'ഈ രേഖയുടെ കാലാവധി ഇന്ന് അവസാനിക്കുന്നു!'
    : `ഈ രേഖ ${data.daysRemaining} ദിവസങ്ങൾക്കുള്ളിൽ അവസാനിക്കും!`;

  const calloutSubtitle = isExpired
    ? `കാലാവധി തീയതി: <strong>${safeExpiryDate}</strong>. ദയവായി ഉടൻ പുതുക്കുക.`
    : isExpiresToday
    ? `കാലാവധി തീയതി: <strong>${safeExpiryDate}</strong> (ഇന്ന്).`
    : `കാലാവധി അവസാനിക്കുന്ന തീയതി: <strong>${safeExpiryDate}</strong> (${data.daysRemaining} ദിവസം ബാക്കി).`;

  const html = `<!DOCTYPE html>
<html lang="ml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #E5E7EB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Anek Malayalam', 'Manjari', Helvetica, Arial, sans-serif; color: #1F2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #E5E7EB; padding: 24px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.08); border: 1px solid #E5E7EB;">

          <!-- Top Red Header Bar (Now with 3D House Vault Logo) -->
          <tr>
            <td style="background-color: #DE2832; padding: 18px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <!-- Left: House Vault Logo & App Title -->
                  <td valign="middle" style="text-align: left;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right: 12px;">
                          <img src="${headerHouseSrc}" width="40" height="40" alt="Kudumba Vault Logo" style="display: block; border-radius: 10px; background: #FFFFFF; border: 1.5px solid rgba(255,255,255,0.4);">
                        </td>
                        <td valign="middle">
                          <span style="display: block; font-size: 19px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px; line-height: 1.2;">Kudumba Vault</span>
                          <span style="display: block; font-size: 11.5px; font-weight: 500; color: #FFCDD2; margin-top: 1px;">കുടുംബ രേഖകൾ സുരക്ഷിതമായി</span>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Right: Security Pill -->
                  <td valign="middle" align="right">
                    <div style="display: inline-block; padding: 6px 14px; border-radius: 999px; background-color: rgba(255,255,255,0.18); font-size: 10px; font-weight: 600; color: #FFFFFF; line-height: 1;">
                      <span style="vertical-align: middle;">🛡️ സുരക്ഷിത രേഖകൾ, സുരക്ഷിത കുടുംബം</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Greeting Section (Now with 3D Robot Mascot on the right) -->
          <tr>
            <td style="padding: 24px 24px 16px 24px; background-color: #FFFFFF;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <!-- Left Text Greeting -->
                  <td valign="middle" style="text-align: left; padding-right: 14px;">
                    <h2 style="font-size: 17px; font-weight: 800; color: #111827; margin: 0 0 10px 0; line-height: 1.3;">
                      പ്രിയ <span style="color: #111827;">${safeRecipient}</span>,
                    </h2>
                    <p style="font-size: 12.5px; line-height: 1.6; color: #374151; margin: 0;">
                      ${greetingSubtitle}
                    </p>
                  </td>

                  <!-- Right 3D Robot Mascot holding Clipboard Alert -->
                  <td valign="middle" align="right" width="160" style="width: 160px; text-align: right;">
                    <img src="${mascotAlertSrc}" width="150" height="auto" alt="Vault Robot Mascot" style="display: block; max-width: 150px; height: auto;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Document Detail Card (Clean Coral Outline + Pink Tint) -->
          <tr>
            <td style="padding: 0 24px 18px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #FFF8F8; border: 1px solid #FCA5A5; border-left: 4px solid #DE2832; border-radius: 16px; padding: 16px;">
                <!-- Header with Icon, Doc Name & Red Status Badge -->
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <!-- Doc Icon -->
                        <td width="44" valign="middle" style="padding-right: 12px;">
                          <div style="width: 42px; height: 42px; background: #EF4444; border-radius: 12px; text-align: center; line-height: 42px; color: #FFFFFF; font-size: 20px;">
                            📄
                          </div>
                        </td>
                        <!-- Title & Authority -->
                        <td valign="middle">
                          <span style="font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase;">രേഖ</span>
                          <div style="font-size: 14.5px; font-weight: 800; color: #111827; line-height: 1.25; margin-top: 1px;">
                            ${safeDocTitle}
                          </div>
                          <div style="font-size: 11px; color: #6B7280; margin-top: 2px;">
                            ${safeCategory} • ${safeAuthority}
                          </div>
                        </td>
                        <!-- Status Badge -->
                        <td valign="middle" align="right">
                          <div style="display: inline-block; padding: 5px 12px; border-radius: 999px; background-color: #FEE2E2; color: #DC2626; font-size: 10.5px; font-weight: 700; white-space: nowrap;">
                            <span style="display: inline-block; width: 13px; height: 13px; background: #DC2626; color: #FFFFFF; border-radius: 50%; font-size: 9px; line-height: 13px; text-align: center; margin-right: 4px;">!</span>
                            ${statusBadgeText} (${statusBadgeTextEn})
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding: 12px 0 10px 0;">
                    <div style="height: 1px; background-color: #FEE2E2; width: 100%;"></div>
                  </td>
                </tr>

                <!-- Split Meta Row: Doc Number & Expiry Date -->
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <!-- Left: Doc Number -->
                        <td width="50%" valign="top" style="padding-right: 10px;">
                          <span style="font-size: 10px; font-weight: 600; color: #9CA3AF;">രേഖാ നമ്പർ</span>
                          <div style="font-size: 14px; font-weight: 700; color: #1F2937; margin-top: 2px; letter-spacing: 0.5px;">
                            ${safeMaskedNumber}
                          </div>
                        </td>

                        <!-- Middle Vertical Divider -->
                        <td width="1" style="background-color: #FEE2E2;"></td>

                        <!-- Right: Expiry Date with Red Calendar -->
                        <td width="49%" valign="top" style="padding-left: 16px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td valign="middle" style="padding-right: 8px;">
                                <div style="width: 26px; height: 26px; background-color: #FEE2E2; border-radius: 6px; text-align: center; line-height: 26px; font-size: 14px;">
                                  📅
                                </div>
                              </td>
                              <td valign="middle">
                                <span style="font-size: 10px; font-weight: 600; color: #9CA3AF; display: block;">കാലാവധി തീയതി</span>
                                <span style="font-size: 13px; font-weight: 800; color: #DC2626; display: block; margin-top: 1px;">
                                  ${safeExpiryDate}
                                </span>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Red Alert Callout Strip with 3D Calendar and Warning Triangle -->
          <tr>
            <td style="padding: 0 24px 22px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #FFF1F2; border-radius: 14px; padding: 14px 16px;">
                <tr>
                  <td width="36" valign="middle" style="padding-right: 10px;">
                    <div style="width: 32px; height: 32px; background: #DC2626; border-radius: 8px; color: #FFFFFF; font-size: 16px; text-align: center; line-height: 32px;">
                      ⚠️
                    </div>
                  </td>
                  <td valign="middle">
                    <span style="font-size: 13px; font-weight: 800; color: #991B1B; display: block; line-height: 1.3;">
                      ${calloutTitle}
                    </span>
                    <span style="font-size: 11.5px; color: #7F1D1D; display: block; margin-top: 2px;">
                      ${calloutSubtitle}
                    </span>
                  </td>
                  <td width="48" valign="middle" align="right">
                    <img src="${calSrc}" width="44" height="44" alt="Overdue Calendar" style="display: block;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Next Steps Section (3 Numbered Action Cards) -->
          <tr>
            <td style="padding: 0 24px 24px 24px;">
              <h3 style="font-size: 14px; font-weight: 800; color: #111827; margin: 0 0 14px 0;">
                അടുത്ത നടപടികൾ:
              </h3>

              <!-- Step 1: Authority -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F9FAFB; border-radius: 12px; margin-bottom: 10px; padding: 10px 14px;">
                <tr>
                  <td width="26" valign="middle" align="center" style="font-size: 11px; font-weight: 800; color: #DE2832; padding-right: 10px;">
                    <div style="width: 22px; height: 22px; background: #FEE2E2; border-radius: 50%; line-height: 22px; text-align: center;">1</div>
                  </td>
                  <td width="32" valign="middle" style="padding-right: 12px;">
                    <div style="width: 32px; height: 32px; background: #FEE2E2; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px;">🏛️</div>
                  </td>
                  <td valign="middle">
                    <span style="font-size: 12.5px; font-weight: 700; color: #111827; display: block;">
                      സമീപിക്കേണ്ട അതോറിറ്റി (${safeAuthority})
                    </span>
                    <span style="font-size: 11px; color: #6B7280; display: block; margin-top: 1px;">
                      ഓഫീസുമായി ബന്ധപ്പെട്ട് പുതുക്കൽ നടപടികൾ വിശദമായി അറിയുക.
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Step 2: Prepare Documents -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F9FAFB; border-radius: 12px; margin-bottom: 10px; padding: 10px 14px;">
                <tr>
                  <td width="26" valign="middle" align="center" style="font-size: 11px; font-weight: 800; color: #DE2832; padding-right: 10px;">
                    <div style="width: 22px; height: 22px; background: #FEE2E2; border-radius: 50%; line-height: 22px; text-align: center;">2</div>
                  </td>
                  <td width="32" valign="middle" style="padding-right: 12px;">
                    <div style="width: 32px; height: 32px; background: #FEE2E2; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px;">📑</div>
                  </td>
                  <td valign="middle">
                    <span style="font-size: 12.5px; font-weight: 700; color: #111827; display: block;">
                      ആവശ്യമായ രേഖകൾ തയ്യാറാക്കുക
                    </span>
                    <span style="font-size: 11px; color: #6B7280; display: block; margin-top: 1px;">
                      പുതുക്കലിന് ആവശ്യമായ രേഖകൾ ഒരു കോപ്പി ലഭ്യമാക്കുക.
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Step 3: Upload Renewed Document -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #F9FAFB; border-radius: 12px; margin-bottom: 18px; padding: 10px 14px;">
                <tr>
                  <td width="26" valign="middle" align="center" style="font-size: 11px; font-weight: 800; color: #DE2832; padding-right: 10px;">
                    <div style="width: 22px; height: 22px; background: #FEE2E2; border-radius: 50%; line-height: 22px; text-align: center;">3</div>
                  </td>
                  <td width="32" valign="middle" style="padding-right: 12px;">
                    <div style="width: 32px; height: 32px; background: #FEE2E2; border-radius: 8px; text-align: center; line-height: 32px; font-size: 16px;">☁️</div>
                  </td>
                  <td valign="middle">
                    <span style="font-size: 12.5px; font-weight: 700; color: #111827; display: block;">
                      പുതുക്കിയ രേഖ കുടുംബ വോൾട്ടിൽ അപ്‌ലോഡ് ചെയ്യുക
                    </span>
                    <span style="font-size: 11px; color: #6B7280; display: block; margin-top: 1px;">
                      രേഖയുടെ കാലാവധി നീട്ടിയ ശേഷം അതിന്റെ ഒരു കോപ്പി ഇവിടെ സുരക്ഷിതമായി സൂക്ഷിക്കുക.
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Primary Red Pill Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${safeVaultUrl}" target="_blank" style="display: inline-block; padding: 14px 38px; background: linear-gradient(180deg, #E52E38 0%, #C81E27 100%); background-color: #DE2832; color: #FFFFFF; font-size: 13.5px; font-weight: 800; text-decoration: none; border-radius: 999px; box-shadow: 0 4px 14px rgba(222, 40, 50, 0.4); text-align: center;">
                      ☁️ വോൾട്ടിൽ കാണുക / പുതുക്കുക →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer Bar -->
          <tr>
            <td style="padding: 16px 24px; background-color: #F9FAFB; border-top: 1px solid #E5E7EB;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <!-- Left Brand Mark -->
                  <td valign="middle" style="text-align: left;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right: 8px;">
                          <img src="${headerHouseSrc}" width="26" height="26" alt="House Logo" style="display: block; border-radius: 6px;">
                        </td>
                        <td valign="middle">
                          <span style="font-size: 12px; font-weight: 800; color: #111827; display: block; line-height: 1;">Kudumba Vault</span>
                          <span style="font-size: 9.5px; color: #9CA3AF; display: block; margin-top: 1px;">കുടുംബത്തിന്റെ ഡിജിറ്റൽ സുരക്ഷാ നിലവറ</span>
                        </td>
                      </tr>
                    </table>
                  </td>

                  <!-- Right Security Note -->
                  <td valign="middle" align="right">
                    <span style="font-size: 9.5px; color: #6B7280; line-height: 1.3; display: inline-block; text-align: right;">
                      🛡️ നിങ്ങളുടെ രേഖകൾ ഞങ്ങൾ സുരക്ഷിതമായി സൂക്ഷിക്കുന്നു.<br>കൂടുതൽ അറിയാൻ എപ്പോഴും ലോഗിൻ ചെയ്യുക.
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `[കുടുംബ വോൾട്ട്] ${isExpired ? 'കാലാവധി കഴിഞ്ഞ രേഖാ അറിയിപ്പ്' : isExpiresToday ? 'അടിയന്തര അറിയിപ്പ്' : 'കാലാവധി ഓർമ്മപ്പെടുത്തൽ'} / Kudumba Vault Document Expiry Notification
==================================================
പ്രിയ ${data.recipientName} / Dear ${data.recipientName},

${
  isExpired
    ? `നിങ്ങളുടെ ${data.documentTitle} കാലാവധി കഴിഞ്ഞിരിക്കുന്നു (${Math.abs(data.daysRemaining)} ദിവസം മുൻപ്). ദയവായി അതിന്റെ പുതുക്കൽ നടപടികൾ ഉടൻ ആരംഭിക്കുക.\nOne of your documents stored in Kudumba Vault has expired. Please review and update it.`
    : isExpiresToday
    ? `നിങ്ങളുടെ ${data.documentTitle} കാലാവധി ഇന്ന് അവസാനിക്കുന്നു. ദയവായി അതിന്റെ പുതുക്കൽ നടപടികൾ ഉടൻ ആരംഭിക്കുക.\nYour document expires today. Please review and update it.`
    : `നിങ്ങളുടെ ${data.documentTitle} ${data.daysRemaining} ദിവസങ്ങൾക്കുള്ളിൽ (${data.expiryDateStr}) അവസാനിക്കുന്നു. ദയവായി പുതുക്കൽ വിവരങ്ങൾ പരിശോധിക്കുക.\nYour document is approaching its expiry date (${data.daysRemaining} days remaining). Please review and update it if necessary.`
}

രേഖാ വിവരങ്ങൾ / Document Details:
----------------------------------
• രേഖ / Document: ${data.documentTitle} (${data.documentCategory})
• അതോറിറ്റി / Authority: ${data.authorityName}
• രേഖാ നമ്പർ / Document Number: ${data.maskedNumber}
• കാലാവധി തീയതി / Expiry Date: ${data.expiryDateStr}
• അവസ്ഥ / Status: ${statusBadgeText} (${statusBadgeTextEn})

അടുത്ത നടപടികൾ / Next Steps:
-----------------------------
1. സമീപിക്കേണ്ട അതോറിറ്റി (${data.authorityName}) - ഓഫീസുമായി ബന്ധപ്പെട്ട് പുതുക്കൽ നടപടികൾ വിശദമായി അറിയുക.
2. ആവശ്യമായ രേഖകൾ തയ്യാറാക്കുക - പുതുക്കലിന് ആവശ്യമായ രേഖകൾ ഒരു കോപ്പി ലഭ്യമാക്കുക.
3. പുതുക്കിയ രേഖ കുടുംബ വോൾട്ടിൽ അപ്‌ലോഡ് ചെയ്യുക - രേഖയുടെ കാലാവധി നീട്ടിയ ശേഷം ഇവിടെ സൂക്ഷിക്കുക.

വോൾട്ടിൽ കാണുക / Open Kudumba Vault:
${data.vaultUrl}

--------------------------------------------------
Kudumba Vault • സുരക്ഷിത രേഖകൾ, സുരക്ഷിത കുടുംബം
This is an automated document-expiry notification.
`;

  return { subject, html, text };
}
