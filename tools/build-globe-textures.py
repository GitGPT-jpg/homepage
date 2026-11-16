"""Downsample the Blue Marble day map, the night-lights map and the cloud map into the WebP textures used by assets/globe.js.

Usage: python3 tools/build-globe-textures.py --day bm12000.jpg --night 8k_earth_nightmap.jpg --clouds 8k_earth_clouds.jpg --out assets
"""
import argparse
import os
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

p = argparse.ArgumentParser()
p.add_argument('--day', required=True)
p.add_argument('--night', required=True)
p.add_argument('--clouds', required=True)
p.add_argument('--out', default='assets')
a = p.parse_args()

day = Image.open(a.day).convert('RGB')
night = Image.open(a.night).convert('RGB')
for w, q in ((8192, 80), (4096, 82)):
    day.resize((w, w // 2), Image.LANCZOS).save(os.path.join(a.out, f'earth-day-{w}.webp'), quality=q, method=6)
night.resize((4096, 2048), Image.LANCZOS).save(os.path.join(a.out, 'earth-night-4096.webp'), quality=82, method=6)
clouds = Image.open(a.clouds).convert('L')
for w, q in ((4096, 72), (2048, 74)):
    clouds.resize((w, w // 2), Image.LANCZOS).convert('RGB').save(os.path.join(a.out, f'earth-clouds-{w}.webp'), quality=q, method=6)
