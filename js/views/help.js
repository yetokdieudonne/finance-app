// Page "Aide" : permet d'écrire à l'admin (bug, suggestion, question) directement depuis
// l'app. Écrit dans la même collection Firestore "questions" que le formulaire de contact du
// site vitrine (voir Sync.submitHelpMessage dans sync.js), pour un seul point de lecture côté
// admin. Import de sync.js dynamique et tolérant à l'échec, comme le reste de l'app.
import { icon, renderIcons } from "../components/icon.js";
import { openSheetCustom } from "../components/modal.js";
import { showToast } from "../components/toast.js";

const TYPES = [
  { value: "bug", label: "Signaler un bug" },
  { value: "suggestion", label: "Proposer une idée" },
  { value: "question", label: "Autre question" },
];

export function openHelpPage() {
  let selectedType = "bug";

  openSheetCustom({
    title: "Aide",
    leading: { label: "Fermer" },
    build(body) {
      body.innerHTML = `
        <p style="color:var(--text-secondary);margin:0 0 20px;">Une idée à proposer, un bug à signaler, une question ? Écrivez-nous directement, on vous répond par email.</p>
        <div class="form-section">
          <p class="form-section__label">Type de message</p>
          <div class="chip-row" id="help-types"></div>
        </div>
        <div class="form-section">
          <p class="form-section__label">Votre message</p>
          <div class="form-group"><div class="form-row"><textarea id="help-message" rows="5" placeholder="Décrivez votre bug, votre idée, ou posez votre question..."></textarea></div></div>
        </div>
        <button class="btn btn--primary" id="help-submit" style="width:100%;">${icon("send")}Envoyer</button>
      `;

      const typesEl = body.querySelector("#help-types");
      function renderTypes() {
        typesEl.innerHTML = TYPES.map(
          (t) => `<button class="chip ${t.value === selectedType ? "is-active" : ""}" data-type="${t.value}">${t.label}</button>`
        ).join("");
        typesEl.querySelectorAll("[data-type]").forEach((btn) => {
          btn.addEventListener("click", () => { selectedType = btn.dataset.type; renderTypes(); });
        });
      }
      renderTypes();

      const submitBtn = body.querySelector("#help-submit");
      const messageInput = body.querySelector("#help-message");

      submitBtn.addEventListener("click", async () => {
        const message = messageInput.value.trim();
        body.querySelector(".error-text")?.remove();
        if (!message) {
          const err = document.createElement("p");
          err.className = "error-text";
          err.textContent = "Veuillez écrire un message.";
          body.appendChild(err);
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi…";
        try {
          const { Sync } = await import("../sync.js");
          await Sync.submitHelpMessage({ type: selectedType, message });
          showToast("Message envoyé, merci !");
          messageInput.value = "";
        } catch (e) {
          const err = document.createElement("p");
          err.className = "error-text";
          err.textContent = "Échec de l'envoi. Vérifiez votre connexion et réessayez.";
          body.appendChild(err);
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `${icon("send")}Envoyer`;
          renderIcons(body);
        }
      });

      renderIcons(body);
    },
  });
}
