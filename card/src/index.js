// Entry point. Registers the card under both type names and the editor. Every define is
// guarded so loading the file twice (two resources) never throws.

import { VERSION, CARD_TYPE, ALIAS_TYPE } from "./constants.js";
import { MvhrAirflowCard } from "./card.js";
import { MvhrAirflowCardEditor } from "./editor.js";

const define = (name, cls) => {
  if (!customElements.get(name)) customElements.define(name, cls);
};

define(ALIAS_TYPE, MvhrAirflowCard);
// The 0.2.x type name keeps working; a subclass because one class can't be defined twice.
define(CARD_TYPE, class extends MvhrAirflowCard {});
define(`${ALIAS_TYPE}-editor`, MvhrAirflowCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === ALIAS_TYPE)) {
  window.customCards.push({
    type: ALIAS_TYPE,
    name: "MVHR airflow",
    description: "Live airflow, heat recovery, bypass and controls for a Nuaire MVHR unit.",
    preview: true,
    documentationURL: "https://github.com/karwantes/Nuaire-MVHR/blob/main/card/docs/install.md",
  });
}

if (!window.__mvhrAirflowCardLogged) {
  window.__mvhrAirflowCardLogged = true;
  console.info(`%c MVHR-AIRFLOW-CARD %c ${VERSION} `, "background:#0f766e;color:#fff;border-radius:3px 0 0 3px", "background:#e2e8f0;color:#0f172a;border-radius:0 3px 3px 0");
}
