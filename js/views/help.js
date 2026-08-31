// Page "Aide" : contact direct de l'administrateur (WhatsApp, email). Pas de formulaire vers
// Firestore ici — sans site vitrine ni panneau admin pour les lire, des messages y resteraient
// sans réponse ; le contact direct garantit une vraie réponse.
import { icon, renderIcons } from "../components/icon.js";
import { openSheetCustom } from "../components/modal.js";

const WHATSAPP_NUMBER = "22997534135";
const WHATSAPP_DISPLAY = "+229 97 53 41 35";
const CONTACT_EMAIL = "yetokdieudonne@gmail.com";

export function openHelpPage() {
  openSheetCustom({
    title: "Aide",
    leading: { label: "Fermer" },
    build(body) {
      body.innerHTML = `
        <p style="color:var(--text-secondary);margin:0 0 20px;">Une idée à proposer, un bug à signaler, une question ? Contactez-nous directement.</p>
        <div class="form-section">
          <div class="form-group">
            <a class="form-row form-row--link" href="https://wa.me/${WHATSAPP_NUMBER}" target="_blank" rel="noopener" style="cursor:pointer;">
              <span class="form-row__label">${icon("message-circle")}&nbsp;&nbsp;WhatsApp</span>
              <span style="color:var(--text-secondary);">${WHATSAPP_DISPLAY}</span>
            </a>
            <a class="form-row form-row--link" href="mailto:${CONTACT_EMAIL}" style="cursor:pointer;">
              <span class="form-row__label">${icon("mail")}&nbsp;&nbsp;Email</span>
              <span style="color:var(--text-secondary);">${CONTACT_EMAIL}</span>
            </a>
          </div>
        </div>
      `;
      renderIcons(body);
    },
  });
}
