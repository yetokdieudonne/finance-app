// Photo de profil affichée dans le menu latéral. Stockée localement, mais incluse dans l'état
// synchronisé par sync.js (snapshotLocalState/applyRemoteState) : elle se retrouve donc sur les
// autres appareils connectés au même compte, comme le reste des données.
const KEY_PHOTO = "finance.profile.photo";

export const Profile = {
  getPhoto() {
    return localStorage.getItem(KEY_PHOTO);
  },
  setPhoto(dataUrl) {
    localStorage.setItem(KEY_PHOTO, dataUrl);
  },
  removePhoto() {
    localStorage.removeItem(KEY_PHOTO);
  },
};
