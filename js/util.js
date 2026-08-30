export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function formatPlainAmount(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Redimensionne et recompresse une image (fichier issu d'un <input type="file"> ou de
 * l'appareil photo) en JPEG, pour qu'un reçu tienne en quelques dizaines de Ko une fois
 * stocké en base64 dans localStorage (dont le quota est limité, ~5 Mo sur la plupart des
 * navigateurs). Résout en data URL, ou rejette si le fichier n'est pas une image lisible.
 */
export function compressImageFile(file, maxDimension = 900, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Impossible de lire le fichier image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Fichier image invalide."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
