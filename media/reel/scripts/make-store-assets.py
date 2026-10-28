# SPDX-License-Identifier: Apache-2.0
# Store graphics for Kenbunshoku (docs/store/), composed offline from the captures
# (captures/s3-hovers, s5-hovers: 1920x1080 screencast frames; CAPTURE.md makes them). No browser.
# Screenshot 01 is the reel's `Store` still: render it first (npm run store:still).
# Frame numbers below are the original captures'; after a recapture, pick the matching frames by
# eye from captures/<name>/verify/ (scripts/verify-frames.py) and change them.
#
#   python3 scripts/make-store-assets.py  ->  out/store/
import os, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAP = os.path.join(ROOT, "captures")
OUT = os.path.join(ROOT, "out", "store")
HN = "/System/Library/Fonts/HelveticaNeue.ttc"
BG = (5, 7, 13)
NAVY = (11, 20, 48)
EDGE = (27, 47, 107)
GLOW = (61, 111, 224)
INK = (244, 246, 251)
MUTED = (170, 180, 205)


def font(size, bold=False, medium=False):
    return ImageFont.truetype(HN, size, index=1 if bold else 10 if medium else 0)


def frame(cap, n):
    return Image.open(f"{CAP}/{cap}/frames/{n:06d}.jpg").convert("RGB")


def cursor(im, x, y, k=1.5):
    d = ImageDraw.Draw(im)
    pts = [(0, 0), (0, 21.5), (5.6, 16.4), (9.4, 24.8), (13, 23.2), (9.3, 15), (16.6, 15)]
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).polygon([(x + px * k + 2, y + py * k + 3) for px, py in pts], fill=(0, 0, 0, 140))
    sh = sh.filter(ImageFilter.GaussianBlur(3))
    im.paste(sh, (0, 0), sh)
    d.polygon([(x + px * k, y + py * k) for px, py in pts], fill=(255, 255, 255), outline=(17, 19, 24))


def screenshot(name, cap, n, crop, pointer, caption, ring=None):
    """1280x800: a 64 px caption strip over the cropped capture (scaled to 1280x736)."""
    src = frame(cap, n)
    if pointer:
        cursor(src, *pointer, k=1.0)
    x, y, w, h = crop
    body = src.crop((x, y, x + w, y + h)).resize((1280, 736), Image.LANCZOS)
    if ring:
        s = 1280 / w
        rx, ry, rr = (ring[0] - x) * s, (ring[1] - y) * s, ring[2] * s
        ImageDraw.Draw(body).ellipse([rx - rr, ry - rr, rx + rr, ry + rr], outline=GLOW, width=5)
    im = Image.new("RGB", (1280, 800), NAVY)
    d = ImageDraw.Draw(im)
    d.text((40, 32), caption, font=font(30, medium=True), fill=INK, anchor="lm")
    d.text((1240, 32), "Kenbunshoku", font=font(22, bold=True), fill=MUTED, anchor="rm")
    d.line([0, 63, 1280, 63], fill=EDGE, width=2)
    im.paste(body, (0, 64))
    im.save(os.path.join(OUT, name), optimize=True)
    return name


def framed_screenshot(name, cap, n, crop, pointer, caption):
    """1280x800: caption strip, then the crop at its own aspect in a navy frame (keeps board logos out)."""
    src = frame(cap, n)
    if pointer:
        cursor(src, *pointer, k=1.0)
    x, y, w, h = crop
    body = src.crop((x, y, x + w, y + h))
    s = min(1180 / w, 690 / h)
    body = body.resize((round(w * s), round(h * s)), Image.LANCZOS)
    im = backdrop(1280, 800)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1280, 63], fill=NAVY)
    d.text((40, 32), caption, font=font(30, medium=True), fill=INK, anchor="lm")
    d.text((1240, 32), "Kenbunshoku", font=font(22, bold=True), fill=MUTED, anchor="rm")
    d.line([0, 63, 1280, 63], fill=EDGE, width=2)
    glow_frame(im, body, (1280 - body.width) // 2, 64 + (736 - body.height) // 2, radius=14, width=3)
    im.save(os.path.join(OUT, name), optimize=True)
    return name


def tooltip_crop(cap, n, box):
    b = box
    return frame(cap, n).crop((b[0], b[1], b[0] + b[2], b[1] + b[3]))


def backdrop(w, h):
    im = Image.new("RGB", (w, h), BG)
    g = Image.new("L", (w, h), 0)
    ImageDraw.Draw(g).ellipse([-w * 0.2, -h * 0.6, w * 0.9, h * 1.4], fill=255)
    g = g.filter(ImageFilter.GaussianBlur(min(w, h) * 0.35))
    im.paste(Image.new("RGB", (w, h), NAVY), (0, 0), g)
    return im


def glow_frame(im, img, x, y, radius=14, width=3):
    w, h = img.size
    gl = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(gl).rounded_rectangle([x - 6, y - 6, x + w + 6, y + h + 6], radius=radius + 4, fill=GLOW + (110,))
    gl = gl.filter(ImageFilter.GaussianBlur(18))
    im.paste(gl, (0, 0), gl)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    im.paste(img, (x, y), mask)
    ImageDraw.Draw(im).rounded_rectangle([x - 1, y - 1, x + w, y + h], radius=radius, outline=EDGE, width=width)


os.makedirs(OUT, exist_ok=True)
files = []

# 01: the existing store screenshot (official broadcast, Portgas.D.Ace), flattened to RGB.
Image.open(os.path.join(ROOT, "out", "store-screenshot-1280x800.png")).convert("RGB").save(os.path.join(OUT, "01-screenshot-1280x800.png"), optimize=True)
files.append(("01-screenshot-1280x800.png", "existing store screenshot: official Bandai regional broadcast VOD (s5-hovers, paused 9665 s), Portgas.D.Ace PRB02-018; mat-only crop"))

# 02: digital OPTCGSim board, Kaido OP17-042 (s3-hovers frame 33), board only (no game log, player tags, hand, webcams).
files.append((framed_screenshot("02-screenshot-1280x800.png", "s3-hovers", 33, (536, 222, 444, 468), (920, 462), "Rest the pointer on a card"),
              "s3-hovers frame 33 (ChinoizeCup #122 VOD, OPTCGSim, paused 9000 s), Kaido OP17-042; crop [536,222,444,468] framed at its own aspect so the simulator mat's ONE PIECE CARD GAME logo stays out"))

# 03: official broadcast physical table, Sanji OP06-119 (s5-hovers frame 73).
files.append((screenshot("03-screenshot-1280x800.png", "s5-hovers", 73, (440, 100, 853, 490), (850, 340), "Digital boards and real tables"),
              "s5-hovers frame 73 (official Bandai regional broadcast VOD, paused 9665 s), Sanji OP06-119; crop [440,100,853,490]"))


ace = tooltip_crop("s5-hovers", 39, (1000, 480, 320, 448))

# Small promo tile 440x280
t = backdrop(440, 280)
d = ImageDraw.Draw(t)
d.text((26, 108), "Kenbunshoku", font=font(36, bold=True), fill=INK, anchor="lm")
d.rectangle([28, 136, 140, 139], fill=GLOW)
d.text((26, 172), "Hover a card", font=font(24, medium=True), fill=INK, anchor="lm")
d.text((26, 202), "to see it", font=font(24, medium=True), fill=INK, anchor="lm")
tip = ace.resize((140, 196), Image.LANCZOS)
glow_frame(t, tip, 440 - 140 - 26, 42, radius=8, width=2)
t.save(os.path.join(OUT, "promo-small-440x280.png"), optimize=True)
files.append(("promo-small-440x280.png", "drawn; tooltip art cropped from s5-hovers frame 39 (Portgas.D.Ace, official broadcast)"))

# Marquee 1400x560: name, tagline, small print; a board region with its tooltip (s5-hovers frame 39).
m = backdrop(1400, 560)
d = ImageDraw.Draw(m)
d.text((90, 210), "Kenbunshoku", font=font(96, bold=True), fill=INK, anchor="lm")
d.rectangle([94, 278, 330, 282], fill=GLOW)
d.text((90, 330), "Hover a card in a stream to see it.", font=font(36, medium=True), fill=INK, anchor="lm")
d.text((90, 378), "Twitch and YouTube · Free and open source", font=font(26), fill=MUTED, anchor="lm")
d.text((90, 500), "Unofficial fan project, not affiliated with Bandai.", font=font(20), fill=(120, 130, 155), anchor="lm")
board = frame("s5-hovers", 39)
cursor(board, 1160, 390, k=1.0)
board = board.crop((760, 180, 1560, 940)).resize((560, 532), Image.LANCZOS)
glow_frame(m, board, 1400 - 560 - 60, 14, radius=16, width=3)
m.save(os.path.join(OUT, "promo-marquee-1400x560.png"), optimize=True)
files.append(("promo-marquee-1400x560.png", "drawn; board crop [760,180,800,760] of s5-hovers frame 39 (official broadcast, Portgas.D.Ace hover)"))


with open(os.path.join(OUT, "README.txt"), "w") as f:
    f.write("Kenbunshoku: Chrome Web Store graphics (PNG, 24-bit RGB)\n\n")
    for name, src in files:
        f.write(f"{name}\n    {src}\n")
    f.write("\nAll captures: Twitch past broadcasts viewed logged out with the extension running; Twitch UI, chat and\n"
            "viewer webcams cropped out. Official broadcast overlays (player names and cams, event branding) kept,\n"
            "as approved. Every hover shown was checked by eye against the card under the pointer.\n")
for name, _ in files:
    im = Image.open(os.path.join(OUT, name))
    print(name, im.size, im.mode, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")
