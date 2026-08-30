"""Génère les icônes de l'app (PWA + iOS Add to Home Screen) à partir de formes vectorielles
simples dessinées avec Pillow, sans dépendance externe autre que Pillow (déjà installé)."""
from PIL import Image, ImageDraw
import math
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

SIZE = 1024
BG_TOP = (10, 132, 255)      # #0A84FF
BG_BOTTOM = (0, 64, 190)     # dark blue
WHITE = (255, 255, 255, 255)


def rounded_rect_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_master():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    # Fond dégradé vertical
    grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(SIZE):
        t = y / SIZE
        r = int(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t)
        gd.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))

    mask = rounded_rect_mask(SIZE, radius=int(SIZE * 0.22))
    img.paste(grad, (0, 0), mask)

    draw = ImageDraw.Draw(img)

    # Symbole : portefeuille stylisé (wallet) en blanc, centré
    cx, cy = SIZE / 2, SIZE / 2
    w, h = SIZE * 0.52, SIZE * 0.40
    left, top = cx - w / 2, cy - h / 2 + SIZE * 0.02
    right, bottom = cx + w / 2, cy + h / 2 + SIZE * 0.02
    radius = SIZE * 0.06

    # Corps du portefeuille
    draw.rounded_rectangle([left, top, right, bottom], radius=radius, fill=WHITE)

    # Rabat (bande plus foncée en haut du portefeuille) — utilise la couleur de fond pour le contraste
    flap_h = h * 0.30
    draw.rounded_rectangle(
        [left, top, right, top + flap_h],
        radius=radius,
        fill=(BG_TOP[0], BG_TOP[1], BG_TOP[2], 255),
    )
    # Masque le bas arrondi de la bande pour qu'elle ait des coins carrés en bas
    draw.rectangle([left, top + flap_h - radius, right, top + flap_h], fill=(BG_TOP[0], BG_TOP[1], BG_TOP[2], 255))

    # Petit fermoir / pièce (cercle) sur le côté droit du portefeuille
    coin_r = h * 0.16
    coin_cx = right - coin_r * 1.4
    coin_cy = top + h * 0.62
    draw.ellipse(
        [coin_cx - coin_r, coin_cy - coin_r, coin_cx + coin_r, coin_cy + coin_r],
        fill=(BG_TOP[0], BG_TOP[1], BG_TOP[2], 255),
    )

    return img


def save_sizes(master, sizes, prefix="icon", squircle=True):
    for size in sizes:
        resized = master.resize((size, size), Image.LANCZOS)
        resized.save(os.path.join(OUT_DIR, f"{prefix}-{size}.png"))


def save_apple_touch(master, size=180):
    # Apple applique déjà ses propres coins arrondis : on fournit une image carrée pleine (sans coins
    # transparents) pour éviter un rendu avec un fond transparent visible derrière l'icône système.
    flat = Image.new("RGBA", master.size, (BG_TOP[0], BG_TOP[1], BG_TOP[2], 255))
    flat.paste(master, (0, 0), master)
    resized = flat.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(OUT_DIR, f"apple-touch-icon-{size}.png"))


if __name__ == "__main__":
    master = make_master()
    save_sizes(master, [512, 384, 256, 192, 152, 144, 128, 96, 72, 48])
    for s in (180, 167, 152, 120):
        save_apple_touch(master, s)
    # Favicon
    master.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT_DIR, "favicon-32.png"))
    master.resize((16, 16), Image.LANCZOS).save(os.path.join(OUT_DIR, "favicon-16.png"))
    print("Icônes générées dans", os.path.abspath(OUT_DIR))
