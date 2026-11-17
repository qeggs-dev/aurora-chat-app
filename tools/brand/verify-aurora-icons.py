#!/usr/bin/env python
"""Aurora Chat 图标资源验证 + 预览图生成。

校验：
  1. 所有交付 PNG 的尺寸 / 模式 / alpha 范围 / 透明边界 / 主体占比；
  2. 1024 / 192 / 48 / 32px 缩略与 Android 各密度文件的规格；
  3. 32px 缩略可辨识性：颜色数、亮像素占比、Sobel 边缘能量，并与旧 DS 标记
     (assets/logo/mark-512.png) 对照；
  4. 启动屏四角颜色必须严格等于 #061029（与 values/ic_launcher_background 一致）；
  5. 生成亮 / 暗主题预览图（关于页、尺寸阶梯、32px 放大对照、启动屏、
     Android 传统 + 自适应图标模拟）到 screenshots/。

用法（本机装有 Pillow 12 / numpy 的 Python）：
  "C:\\Users\\Administrator-Local\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe" ^
    tools/brand/verify-aurora-icons.py
可选：--screenshots-dir <目录> 覆盖截图输出目录（默认 D:/Projects/Deepseek_Harness_Workspace/screenshots）。
"""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BRAND = ROOT / "assets" / "brand"
ANDROID_RES = ROOT / "mobile" / "android" / "app" / "src" / "main" / "res"
DESKTOP_ICON = ROOT / "desktop" / "build" / "icon.png"
OLD_MARK = ROOT / "assets" / "logo" / "mark-512.png"
DEFAULT_SCREENSHOTS = Path(r"D:/Projects/Deepseek_Harness_Workspace/screenshots")

DENSITIES = [("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216), ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432)]
SPLASH_TARGETS = [
    ("drawable/splash.png", 480, 320),
    ("drawable-port-mdpi/splash.png", 320, 480),
    ("drawable-port-hdpi/splash.png", 480, 800),
    ("drawable-port-xhdpi/splash.png", 720, 1280),
    ("drawable-port-xxhdpi/splash.png", 960, 1600),
    ("drawable-port-xxxhdpi/splash.png", 1280, 1920),
    ("drawable-land-mdpi/splash.png", 480, 320),
    ("drawable-land-hdpi/splash.png", 800, 480),
    ("drawable-land-xhdpi/splash.png", 1280, 720),
    ("drawable-land-xxhdpi/splash.png", 1600, 960),
    ("drawable-land-xxxhdpi/splash.png", 1920, 1280),
]

errors = []
warnings = []
report = {"files": [], "splash": [], "metrics32": {}, "svg": {}}


def fail(message):
    errors.append(message)


def warn(message):
    warnings.append(message)


def font(size, bold=False):
    # 优先微软雅黑（预览图里有中文）；再退 Segoe UI / Arial
    candidates = [
        r"C:/Windows/Fonts/msyhbd.ttc" if bold else r"C:/Windows/Fonts/msyh.ttc",
        r"C:/Windows/Fonts/msyh.ttf" if bold else r"C:/Windows/Fonts/msyh.ttf",
        r"C:/Windows/Fonts/segoeuib.ttf" if bold else r"C:/Windows/Fonts/segoeui.ttf",
        r"C:/Windows/Fonts/arialbd.ttf" if bold else r"C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def alpha_bbox(im, threshold=8):
    alpha = np.asarray(im.getchannel("A"))
    mask = alpha > threshold
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def inspect(path, expect_size=None, expect_alpha="any"):
    path = Path(path)
    entry = {"file": str(path.relative_to(ROOT)).replace("\\", "/")}
    if not path.exists():
        fail(f"缺少文件: {path}")
        entry["missing"] = True
        report["files"].append(entry)
        return entry
    raw = path.read_bytes()
    im = Image.open(path)
    entry.update({"bytes": len(raw), "size": list(im.size), "mode": im.mode})
    if expect_size and im.size != expect_size:
        fail(f"{entry['file']} 尺寸 {im.size} != 期望 {expect_size}")
    if im.mode != "RGBA":
        warn(f"{entry['file']} 模式 {im.mode}（期望 RGBA）")
        im = im.convert("RGBA")
    alpha = np.asarray(im.getchannel("A"))
    entry["alpha"] = {"min": int(alpha.min()), "max": int(alpha.max()), "transparent_px": int((alpha == 0).sum())}
    bbox = alpha_bbox(im, 8)
    if bbox:
        entry["alpha_bbox"] = list(bbox)
        entry["alpha_bbox_ratio"] = [round((bbox[2] - bbox[0]) / im.width, 4), round((bbox[3] - bbox[1]) / im.height, 4)]
    solid = alpha_bbox(im, 128)
    if solid:
        entry["solid_bbox_ratio"] = [round((solid[2] - solid[0]) / im.width, 4), round((solid[3] - solid[1]) / im.height, 4)]
    if expect_alpha == "opaque" and int(alpha.min()) != 255:
        fail(f"{entry['file']} 应为全不透明（alpha min={int(alpha.min())}）")
    if expect_alpha == "transparent" and int(alpha.min()) != 0:
        warn(f"{entry['file']} 没有全透明像素（alpha min={int(alpha.min())}）")
    if expect_alpha == "cutout" and int(alpha.min()) != 0:
        fail(f"{entry['file']} 应有透明角（alpha min={int(alpha.min())}）")
    if path.suffix == ".png" and entry["bytes"] < 300:
        warn(f"{entry['file']} 仅 {entry['bytes']} 字节，可能是空图")
    report["files"].append(entry)
    return entry


def luminance(im):
    array = np.asarray(im.convert("RGBA")).astype(np.float32)
    alpha = array[:, :, 3] / 255.0
    return (0.299 * array[:, :, 0] + 0.587 * array[:, :, 1] + 0.114 * array[:, :, 2]) * alpha


def sobel_energy(gray):
    gx = np.zeros_like(gray)
    gy = np.zeros_like(gray)
    gx[:, 1:-1] = (gray[:, 2:] - gray[:, :-2]) / 2.0
    gy[1:-1, :] = (gray[2:, :] - gray[:-2, :]) / 2.0
    return float(np.sqrt(gx * gx + gy * gy).mean())


def analyze32(im):
    im = im.convert("RGBA")
    thumb = im.resize((32, 32), Image.LANCZOS)
    rgba = np.asarray(thumb).astype(np.int16)
    opaque = rgba[:, :, 3] > 128
    rgb = rgba[:, :, :3]
    colors = len({tuple(pixel) for pixel in rgb[opaque].tolist()})
    gray = luminance(thumb)
    energy = sobel_energy(gray)
    lum = gray / 255.0
    bright = float(((lum > 0.55) & opaque).mean())
    saturation = np.where(opaque, (rgb.max(axis=2) - rgb.min(axis=2)) / 255.0, 0.0)
    blurred = luminance(thumb.filter(ImageFilter.GaussianBlur(1.6)))
    return {
        "unique_colors": colors,
        "edge_energy": round(energy, 4),
        "bright_fraction": round(bright, 4),
        "colorfulness": round(float(saturation.mean()), 4),
        "sharpness_vs_blur": round(energy / max(sobel_energy(blurred), 1e-6), 3),
    }


def save(im, path, description=""):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGBA").save(path)
    print(f"  preview: {path}  ({description})")


def gradient(size, top, bottom):
    width, height = size
    top = np.array(top, dtype=np.float32)
    bottom = np.array(bottom, dtype=np.float32)
    t = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None, None]
    rows = top[None, None, :] * (1 - t) + bottom[None, None, :] * t
    canvas = np.repeat(rows, width, axis=1)
    return Image.fromarray(np.uint8(np.clip(canvas, 0, 255)), "RGB").convert("RGBA")


def paste_center(canvas, im, cx, cy):
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def shadowed(im, radius=18, opacity=90):
    pad = radius * 3
    canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    mask = im.getchannel("A").point(lambda value: min(255, int(value * opacity / 255)))
    shadow = Image.new("RGBA", canvas.size, (4, 8, 20, 255))
    shadow.putalpha(Image.new("L", canvas.size, 0))
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_layer.paste(Image.new("RGBA", im.size, (4, 8, 20, 255)), (pad, pad), mask)
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius))
    canvas.alpha_composite(shadow_layer)
    canvas.alpha_composite(im, (pad, pad))
    return canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshots-dir", default=str(DEFAULT_SCREENSHOTS))
    parser.add_argument("--style-pack-icon", default=None,
                        help="可选：内置极光样式包自带图标的 PNG 路径，用于 32px 对照（不参与交付校验）")
    args = parser.parse_args()
    screenshots = Path(args.screenshots_dir)
    screenshots.mkdir(parents=True, exist_ok=True)

    print("== 1. 交付文件规格 ==")
    inspect(BRAND / "aurora-1024.png", (1024, 1024), "cutout")
    inspect(BRAND / "aurora-512.png", (512, 512), "cutout")
    inspect(BRAND / "aurora-192.png", (192, 192), "cutout")
    inspect(BRAND / "aurora-48.png", (48, 48), "cutout")
    inspect(BRAND / "aurora-light-512.png", (512, 512), "cutout")
    inspect(DESKTOP_ICON, (1024, 1024), "cutout")
    for dpi, legacy, foreground in DENSITIES:
        inspect(ANDROID_RES / f"mipmap-{dpi}" / "ic_launcher.png", (legacy, legacy), "cutout")
        inspect(ANDROID_RES / f"mipmap-{dpi}" / "ic_launcher_round.png", (legacy, legacy), "cutout")
        foreground_entry = inspect(ANDROID_RES / f"mipmap-{dpi}" / "ic_launcher_foreground.png", (foreground, foreground), "transparent")
        ratio = foreground_entry.get("alpha_bbox_ratio")
        if ratio and ratio[0] > 0.72:
            warn(f"mipmap-{dpi} 前景 alpha 包围盒宽 {ratio[0]:.1%}，偏大（明亮主体应约 62%）")
    for relative, width, height in SPLASH_TARGETS:
        entry = inspect(ANDROID_RES / relative, (width, height), "opaque")
        im = Image.open(ANDROID_RES / relative).convert("RGB")
        corners = [im.getpixel((0, 0)), im.getpixel((width - 1, 0)), im.getpixel((0, height - 1)), im.getpixel((width - 1, height - 1))]
        entry["corners"] = [list(color) for color in corners]
        if any(color != (6, 16, 41) for color in corners):
            fail(f"{relative} 四角不是 #061029: {corners}")
        report["splash"].append(entry)

    print("== 2. 32px 缩略可辨识性 ==")
    new_icon = Image.open(BRAND / "aurora-1024.png").convert("RGBA")
    old_icon = Image.open(OLD_MARK).convert("RGBA")
    for name, im in [("new_aurora", new_icon), ("old_ds", old_icon)]:
        report["metrics32"][name] = analyze32(im)
        print(f"  {name:10s} {json.dumps(report['metrics32'][name], ensure_ascii=False)}")
    if args.style_pack_icon and Path(args.style_pack_icon).exists():
        report["metrics32"]["style_pack"] = analyze32(Image.open(args.style_pack_icon).convert("RGBA"))
        print(f"  {'style_pack':10s} {json.dumps(report['metrics32']['style_pack'], ensure_ascii=False)}")
    if report["metrics32"]["new_aurora"]["edge_energy"] <= report["metrics32"]["old_ds"]["edge_energy"] * 0.25:
        warn("新图标 32px 边缘能量不到旧图标 25%，可能偏糊")
    if report["metrics32"]["new_aurora"]["unique_colors"] < 60:
        warn("新图标 32px 颜色数偏少，可能层次不足")

    print("== 3. 文案 / 资源引用检查 ==")
    values_bg = (ANDROID_RES / "values" / "ic_launcher_background.xml").read_text(encoding="utf-8")
    if "#061029" not in values_bg:
        fail("values/ic_launcher_background.xml 不是 #061029")
    adaptive = (ANDROID_RES / "mipmap-anydpi-v26" / "ic_launcher.xml").read_text(encoding="utf-8")
    if "@mipmap/ic_launcher_foreground" not in adaptive:
        fail("自适应图标 XML 未引用 @mipmap/ic_launcher_foreground")
    styles = (ANDROID_RES / "values" / "styles.xml").read_text(encoding="utf-8")
    if "@mipmap/ic_launcher_foreground" not in styles:
        fail("styles.xml 的 windowSplashScreenAnimatedIcon 未指向 @mipmap/ic_launcher_foreground")
    for relative in ["drawable-v24/ic_launcher_foreground.xml", "drawable/ic_launcher_background.xml"]:
        text = (ANDROID_RES / relative).read_text(encoding="utf-8")
        if "鲸" in text or "whale" in text.lower():
            fail(f"{relative} 仍含旧鲸鱼标记描述")

    print("== 4. 生成预览图 ==")
    dark_wall = gradient((1280, 820), (14, 19, 38), (8, 11, 24))
    glow = Image.new("RGBA", dark_wall.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((260, 120, 1020, 720), fill=(52, 96, 200, 46))
    dark_wall.alpha_composite(glow.filter(ImageFilter.GaussianBlur(160)))
    light_wall = gradient((1280, 820), (244, 247, 252), (218, 227, 240))

    # 4.1 尺寸阶梯（亮 / 暗各一张）
    for theme, wall in (("dark", dark_wall), ("light", light_wall)):
        canvas = wall.copy()
        draw = ImageDraw.Draw(canvas)
        x = 64
        for size, shown in ((1024, 260), (512, 200), (192, 192), (48, 48), (32, 32)):
            thumb = new_icon.resize((shown, shown), Image.LANCZOS)
            y = 380
            paste_center(canvas, thumb, x + shown / 2, y)
            draw.text((x, y + 190), f"{size}px" + ("" if size == shown else f" → {shown}px preview"),
                      font=font(19), fill=(228, 236, 255) if theme == "dark" else (26, 40, 66))
            x += max(shown, 120) + 50
        draw.text((64, 60), "Aurora Chat — app icon size ladder", font=font(34, bold=True),
                  fill=(236, 243, 255) if theme == "dark" else (18, 28, 50))
        draw.text((64, 108), "deep-blue round square, cyan→violet aurora ribbons, no lettering",
                  font=font(20), fill=(150, 180, 225) if theme == "dark" else (70, 90, 125))
        save(canvas, screenshots / f"aurora-app-icon-sizes-{theme}.png", "size ladder")

    # 4.2 32px 放大对照（旧 DS vs 新极光）
    canvas = Image.new("RGBA", (1000, 460), (20, 24, 34, 255))
    draw = ImageDraw.Draw(canvas)
    old32 = old_icon.resize((32, 32), Image.LANCZOS).resize((256, 256), Image.NEAREST)
    new32 = new_icon.resize((32, 32), Image.LANCZOS).resize((256, 256), Image.NEAREST)
    canvas.alpha_composite(old32, (64, 116))
    canvas.alpha_composite(new32, (560, 116))
    draw.text((64, 46), "32px — old DS mark", font=font(24, bold=True), fill=(255, 190, 190))
    draw.text((560, 46), "32px — new aurora mark", font=font(24, bold=True), fill=(190, 240, 255))
    metrics = report["metrics32"]["new_aurora"]
    draw.text((64, 400), f"new: colors {metrics['unique_colors']}  edge {metrics['edge_energy']}  "
                         f"bright {metrics['bright_fraction']:.1%}  sharpness/blur {metrics['sharpness_vs_blur']}",
              font=font(16), fill=(180, 200, 230))
    save(canvas, screenshots / "aurora-app-icon-32px-compare.png", "32px old/new zoom x8")

    # 4.3 关于页展示（亮 / 暗）
    about_dark = gradient((1200, 700), (12, 16, 34), (6, 8, 18))
    about_dark.alpha_composite(glow.filter(ImageFilter.GaussianBlur(180)))
    about_light = gradient((1200, 700), (250, 252, 255), (226, 234, 246))
    for theme, base in (("dark", about_dark), ("light", about_light)):
        canvas = base.copy()
        draw = ImageDraw.Draw(canvas)
        mark = Image.open(BRAND / ("aurora-light-512.png" if theme == "light" else "aurora-512.png")).convert("RGBA")
        mark = mark.resize((220, 220), Image.LANCZOS)
        paste_center(canvas, shadowed(mark, 26, 110), 280, 330)
        fill_name = (235, 243, 255) if theme == "dark" else (20, 30, 52)
        fill_sub = (152, 180, 225) if theme == "dark" else (80, 100, 132)
        draw.text((470, 250), "Aurora Chat", font=font(64, bold=True), fill=fill_name)
        draw.text((472, 340), "关于 / About — 图标展示预览", font=font(24), fill=fill_sub)
        draw.text((472, 390), "图标：深蓝底 + 青蓝→紫极光弧带，无字母、无官方元素", font=font(20), fill=fill_sub)
        draw.text((472, 430), "about-page icon preview (light / dark theme)", font=font(18), fill=fill_sub)
        save(canvas, screenshots / f"aurora-app-icon-about-{theme}.png", "about page preview")

    # 4.4 启动屏预览（竖屏 + 横屏缩小）
    portrait = Image.open(ANDROID_RES / "drawable-port-xhdpi" / "splash.png").convert("RGBA").resize((288, 512), Image.LANCZOS)
    landscape = Image.open(ANDROID_RES / "drawable-land-xhdpi" / "splash.png").convert("RGBA").resize((512, 288), Image.LANCZOS)
    canvas = Image.new("RGBA", (900, 620), (18, 22, 32, 255))
    draw = ImageDraw.Draw(canvas)
    canvas.alpha_composite(portrait, (70, 60))
    canvas.alpha_composite(landscape, (360, 170))
    draw.text((70, 20), "Android splash — portrait 720×1280", font=font(20, bold=True), fill=(220, 235, 255))
    draw.text((360, 130), "landscape 1280×720", font=font(20, bold=True), fill=(220, 235, 255))
    draw.text((70, 585), "deep blue #061029 + centered aurora mark (26% of min edge)", font=font(15), fill=(160, 185, 220))
    save(canvas, screenshots / "aurora-app-icon-splash.png", "splash preview")

    # 4.5 Android 传统 / 自适应图标模拟
    canvas = Image.new("RGBA", (1120, 460), (18, 22, 32, 255))
    draw = ImageDraw.Draw(canvas)
    legacy = Image.open(ANDROID_RES / "mipmap-xxxhdpi" / "ic_launcher.png").convert("RGBA").resize((192, 192), Image.LANCZOS)
    legacy_round = Image.open(ANDROID_RES / "mipmap-xxxhdpi" / "ic_launcher_round.png").convert("RGBA").resize((192, 192), Image.LANCZOS)
    foreground = Image.open(ANDROID_RES / "mipmap-xxxhdpi" / "ic_launcher_foreground.png").convert("RGBA").resize((432, 432), Image.LANCZOS)
    adaptive_plain = Image.new("RGBA", foreground.size, (6, 16, 41, 255))
    adaptive_plain.alpha_composite(foreground)
    mask = Image.new("L", foreground.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, foreground.size[0] - 1, foreground.size[1] - 1), fill=255)
    adaptive_circle = Image.new("RGBA", foreground.size, (0, 0, 0, 0))
    adaptive_circle.paste(adaptive_plain, (0, 0), mask)
    adaptive_plain = adaptive_plain.resize((192, 192), Image.LANCZOS)
    adaptive_circle = adaptive_circle.resize((192, 192), Image.LANCZOS)
    canvas.alpha_composite(legacy, (60, 170))
    canvas.alpha_composite(legacy_round, (300, 170))
    canvas.alpha_composite(adaptive_plain, (560, 170))
    canvas.alpha_composite(adaptive_circle, (820, 170))
    for x, label in ((60, "legacy ic_launcher"), (300, "legacy round"), (560, "adaptive (masked square)"), (820, "adaptive (circle mask)")):
        draw.text((x, 120), label, font=font(18, bold=True), fill=(220, 235, 255))
        draw.text((x, 386), "76% body" if "legacy" in label else "62% content", font=font(16), fill=(150, 175, 215))
    save(canvas, screenshots / "aurora-app-icon-android.png", "Android icon simulation")

    # 4.6 1024 原图（暗色桌面墙纸上的大图）
    hero = dark_wall.copy()
    big = new_icon.resize((420, 420), Image.LANCZOS)
    paste_center(hero, shadowed(big, 34, 130), 640, 410)
    draw = ImageDraw.Draw(hero)
    draw.text((64, 700), "aurora-1024.png / desktop/build/icon.png", font=font(18), fill=(160, 185, 220))
    save(hero, screenshots / "aurora-app-icon-hero.png", "hero on dark wallpaper")

    print("== 5. 汇总 ==")
    print(json.dumps({"errors": errors, "warnings": warnings,
                      "metrics32": report["metrics32"]}, ensure_ascii=False, indent=2))
    if errors:
        print(f"FAILED: {len(errors)} error(s)")
        return 1
    print("OK: all icon checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
