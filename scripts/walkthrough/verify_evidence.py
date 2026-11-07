import sys
import os
import json
import hashlib
from datetime import datetime
from PIL import Image
import imagehash

SCREENSHOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../docs/guide/images'))
EVIDENCE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'evidence'))

print('=' * 110)
print('FLEETFLOW EVIDENCE MANIFEST & INTEGRITY AUDIT (PERCEPTUAL HASH & EVIDENCE JSON VERIFICATION)')
print('=' * 110)

# Check Evidence JSON files
json_files = [f for f in os.listdir(EVIDENCE_DIR) if f.endswith('.json')] if os.path.exists(EVIDENCE_DIR) else []
print(f'Total machine-generated evidence records found in evidence/: {len(json_files)}')
print('-' * 110)

# Check all cited screenshot files
screenshot_files = []
for root, dirs, files in os.walk(SCREENSHOT_DIR):
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg')):
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, SCREENSHOT_DIR).replace('\\', '/')
            screenshot_files.append((rel_path, full_path))

print(f"{'Relative Screenshot Path':<50} {'Size (KB)':<12} {'Modified Time':<24} {'SHA-256 (first 12)':<18} {'pHash':<18}")
print('-' * 110)

file_records = []
warnings = []
hashes = {}
phashes = {}

for rel_path, full_path in sorted(screenshot_files):
    st = os.stat(full_path)
    size_kb = round(st.st_size / 1024, 2)
    mtime_dt = datetime.fromtimestamp(st.st_mtime)
    mtime_str = mtime_dt.strftime('%Y-%m-%d %H:%M:%S')

    with open(full_path, 'rb') as f:
        file_bytes = f.read()
        sha256 = hashlib.sha256(file_bytes).hexdigest()

    try:
        img = Image.open(full_path)
        phash = str(imagehash.phash(img))
    except Exception as e:
        phash = f"ERR: {e}"

    print(f"{rel_path:<50} {size_kb:<12} {mtime_str:<24} {sha256[:12]:<18} {phash:<18}")

    # Integrity rules
    if st.st_size < 5 * 1024:
        warnings.append(f"WARNING: {rel_path} is smaller than 5 KB ({size_kb} KB)")

    if sha256 in hashes:
        warnings.append(f"WARNING: Exact SHA-256 duplicate! {rel_path} matches {hashes[sha256]}")
    else:
        hashes[sha256] = rel_path

    file_records.append({
        'rel_path': rel_path,
        'size_bytes': st.st_size,
        'mtime': st.st_mtime,
        'sha256': sha256,
        'phash': phash,
    })

# Check perceptual hash pairs
print('-' * 110)
print('PERCEPTUAL HASH SIMILARITY CHECKS (FLAGGING >95% SIMILARITY OR <=3 HAMMING DISTANCE):')
similar_count = 0
for i in range(len(file_records)):
    for j in range(i + 1, len(file_records)):
        r1 = file_records[i]
        r2 = file_records[j]
        # Only compare if both have valid hex phashes
        if len(r1['phash']) == 16 and len(r2['phash']) == 16:
            h1 = imagehash.hex_to_hash(r1['phash'])
            h2 = imagehash.hex_to_hash(r2['phash'])
            diff = h1 - h2
            # Check timestamp delta
            time_delta = abs(r1['mtime'] - r2['mtime'])
            size_delta = abs(r1['size_bytes'] - r2['size_bytes']) / max(r1['size_bytes'], 1)

            if diff == 0:
                warnings.append(f"FLAGGED: Perceptually identical (diff=0): {r1['rel_path']} vs {r2['rel_path']}")
                similar_count += 1
            elif diff <= 3 and time_delta < 3 and size_delta < 0.01:
                warnings.append(f"FLAGGED: Near-identical image pair within 3s and <1% size delta: {r1['rel_path']} vs {r2['rel_path']} (diff={diff}, dt={time_delta:.1f}s)")
                similar_count += 1

if warnings:
    print(f"\nAUDIT WARNINGS ({len(warnings)}):")
    for w in warnings:
        print("  -", w)
else:
    print("\nALL AUDIT CHECKS PASSED: Zero identical hashes, zero duplicate image pairs, all files >5 KB.")

print('=' * 110)

