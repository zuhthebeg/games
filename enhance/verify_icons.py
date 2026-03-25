#!/usr/bin/env python3
"""아이콘 생성 결과 검수"""
from pathlib import Path
from PIL import Image

ICONS_DIR = Path(__file__).parent / "icons" / "lv"
WEAPONS = ["sword","axe","spear","hammer","dagger","staff","wand","katana","scythe","bow","crossbow","knuckle"]
LEVELS = list(range(1, 16))

missing, bad_size, bad_mode, opaque_bg = [], [], [], []

for w in WEAPONS:
    for lv in LEVELS:
        p = ICONS_DIR / f"{w}-lv{lv}.png"
        if not p.exists():
            missing.append(f"{w}-lv{lv}")
            continue
        try:
            img = Image.open(p)
            if img.size != (512, 512):
                bad_size.append(f"{w}-lv{lv} ({img.size})")
            if img.mode != "RGBA":
                bad_mode.append(f"{w}-lv{lv} ({img.mode})")
            else:
                # 코너 4개 픽셀 알파값 확인 (투명 배경)
                corners = [img.getpixel((0,0)), img.getpixel((511,0)),
                           img.getpixel((0,511)), img.getpixel((511,511))]
                opaque = [c for c in corners if c[3] > 10]
                if len(opaque) >= 3:
                    opaque_bg.append(f"{w}-lv{lv}")
        except Exception as e:
            bad_mode.append(f"{w}-lv{lv} (error: {e})")

total = len(WEAPONS) * len(LEVELS)
ok = total - len(missing) - len(bad_size) - len(bad_mode) - len(opaque_bg)

report = f"""=== 무기 아이콘 검수 결과 ===
총 대상: {total}개
OK:      {ok}개
누락:    {len(missing)}개
크기불량: {len(bad_size)}개
모드불량: {len(bad_mode)}개
배경불투명: {len(opaque_bg)}개
"""

if missing:
    report += f"\n[누락] {', '.join(missing[:20])}{'...' if len(missing)>20 else ''}"
if bad_size:
    report += f"\n[크기불량] {', '.join(bad_size[:10])}"
if bad_mode:
    report += f"\n[모드불량] {', '.join(bad_mode[:10])}"
if opaque_bg:
    report += f"\n[배경불투명] {', '.join(opaque_bg[:10])}"

print(report)
Path("/tmp/icon_verify_report.txt").write_text(report)
print("리포트 저장: /tmp/icon_verify_report.txt")
