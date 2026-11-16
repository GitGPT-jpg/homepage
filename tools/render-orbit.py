#!/usr/bin/env python3
"""Render the opening-orbit posters (orthographic South America view, 4096 px max).

Inputs (download first, not committed):
  --day    NASA Blue Marble composite, equirectangular (24000x12000 on Wikimedia Commons)
  --night  night-lights map, equirectangular
Outputs assets/orbit-{1280,2160,4096}.webp
"""
import argparse, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None

ap = argparse.ArgumentParser()
ap.add_argument('--day', required=True)
ap.add_argument('--night', required=True)
ap.add_argument('--out', default='assets')
ap.add_argument('--size', type=int, default=4096)
a = ap.parse_args()

N = a.size
R = 0.455 * N                      # globe radius; the rest is atmosphere + space
LAT0, LON0 = np.radians(-24), np.radians(-61)
SUN = np.array([-0.62, 0.30, 0.72]); SUN /= np.linalg.norm(SUN)   # camera space: x right, y up, z to viewer

day = Image.open(a.day).convert('RGB')
day = day.resize((12288, 6144), Image.LANCZOS)
day = np.asarray(day)
night = np.asarray(Image.open(a.night).convert('RGB').resize((8192, 4096), Image.BICUBIC))

def sample(img, lon, lat):
    h, w, _ = img.shape
    u = (lon / (2*np.pi) + 0.5) * w - 0.5
    v = (0.5 - lat / np.pi) * h - 0.5
    u0 = np.floor(u).astype(np.int64); v0 = np.floor(v).astype(np.int64)
    fu = (u - u0)[..., None]; fv = (v - v0)[..., None]
    u0m, u1m = u0 % w, (u0 + 1) % w
    v0c, v1c = np.clip(v0, 0, h-1), np.clip(v0 + 1, 0, h-1)
    top = img[v0c, u0m] * (1-fu) + img[v0c, u1m] * fu
    bot = img[v1c, u0m] * (1-fu) + img[v1c, u1m] * fu
    return top * (1-fv) + bot * fv

rng = np.random.default_rng(7)
out = np.zeros((N, N, 3), np.float32)
ys_all = np.arange(N)
xs = (np.arange(N) + 0.5 - N/2) / R

for y0 in range(0, N, 256):
    ys = (N/2 - (ys_all[y0:y0+256] + 0.5)) / R
    X, Y = np.meshgrid(xs, ys)
    r2 = X*X + Y*Y
    r = np.sqrt(r2)
    inside = r2 < 1
    Z = np.sqrt(np.clip(1 - r2, 0, None))
    yp = Y*np.cos(LAT0) + Z*np.sin(LAT0)
    zp = -Y*np.sin(LAT0) + Z*np.cos(LAT0)
    lat = np.arcsin(np.clip(yp, -1, 1)); lon = LON0 + np.arctan2(X, zp)
    lon = (lon + np.pi) % (2*np.pi) - np.pi
    col = sample(day, lon, lat) / 255.0
    lit = sample(night, lon, lat) / 255.0

    ndl = X*SUN[0] + Y*SUN[1] + Z*SUN[2]
    dayk = np.clip((ndl + 0.10) / 0.42, 0, 1); dayk = dayk*dayk*(3-2*dayk)
    # grade: contrast + saturation for a punchier planet
    col = np.clip((col - 0.5) * 1.05 + 0.5, 0, 1)
    gray = col.mean(2, keepdims=True); col = np.clip(gray + (col - gray) * 1.08, 0, 1)
    shade = 0.10 + 0.95 * np.clip(ndl, 0, 1)[..., None] ** 0.8
    day_rgb = col * shade * 1.65
    # ocean glint
    water = ((col[..., 2] > col[..., 0] * 1.25) & (col[..., 2] > col[..., 1]) & (col.mean(2) < 0.45))
    Hh = SUN + np.array([0, 0, 1.0]); Hh /= np.linalg.norm(Hh)
    nh = np.clip(X*Hh[0] + Y*Hh[1] + Z*Hh[2], 0, 1)
    glint = (nh ** 90) * water * 0.9 + (nh ** 12) * water * 0.10
    day_rgb = day_rgb + glint[..., None] * np.array([1.0, .95, .85])
    # night side: dim terrain + warm city lights
    nl = np.clip(lit.mean(2), 0, 1)[..., None] ** 1.35
    night_rgb = col * 0.035 + nl * np.array([1.55, 1.05, .52]) * 1.1
    img = day_rgb * dayk[..., None] + night_rgb * (1 - dayk[..., None])
    # limb: darken, then blue atmospheric scatter that is stronger on the sunlit side
    fres = np.clip(1 - Z, 0, 1)
    atm_col = np.array([.30, .58, 1.0])
    img = img * (1 - 0.35 * fres[..., None] ** 2.2) + atm_col * (fres ** 3.2 * (0.25 + 0.95 * np.clip(ndl + .35, 0, 1)))[..., None] * 1.05
    tw = np.exp(-((ndl) / 0.09) ** 2)[..., None]                   # twilight band
    img = img + tw * np.array([.20, .09, .02]) * fres[..., None] ** 0.5 * 0.9
    # space + outer glow
    rr = np.maximum(r, 1e-6)
    glow = np.exp(-(rr - 1) / 0.028) * 0.70 + np.exp(-(rr - 1) / 0.12) * 0.20
    sunside = np.clip((X*SUN[0] + Y*SUN[1]) / max(np.hypot(SUN[0], SUN[1]), 1e-6) / np.maximum(rr, .05) * .5 + .62, 0.18, 1)
    outer = (glow * sunside)[..., None] * atm_col
    base = np.array([4, 7, 13], np.float32) / 255.0
    stars = (rng.random((len(ys), N)) > 0.99965).astype(np.float32) * rng.random((len(ys), N)).astype(np.float32)
    space = base + stars[..., None] * np.array([.9, .95, 1.0])
    # soft edge: 1 px antialias on the sphere boundary
    edge = np.clip((1 - r) * R + .5, 0, 1)[..., None]
    comp = img * edge + (space + outer) * (1 - edge) * (r >= 1)[..., None]
    comp = np.where(inside[..., None], img * edge + (space + outer * 0.0) * (1 - edge), comp)
    out[y0:y0+256] = comp
    print('row', y0, flush=True)

# gentle filmic curve, then bloom for lights and rim
out = out / (1 + out * 0.18)
out = np.clip(out, 0, 1) ** (1 / 1.05)
img8 = Image.fromarray((out * 255 + .5).astype(np.uint8))
from PIL import ImageFilter
bright = Image.fromarray((np.clip(out - 0.62, 0, 1) * 255 * 2.2).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(N / 160))
b = np.asarray(bright).astype(np.float32) / 255
final = np.clip(np.asarray(img8).astype(np.float32) / 255 + b * 0.55, 0, 1)
final = Image.fromarray((final * 255 + .5).astype(np.uint8))
for w in (1280, 2160, N):
    im = final if w == N else final.resize((w, w), Image.LANCZOS)
    im.save(f'{a.out}/orbit-{w}.webp', quality=92 if w == N else 84, method=6)
    print('saved', w)
