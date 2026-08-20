"""
PENNIO Motion Engine — generic renderer.
Takes a spec dict, renders SVG frames via cairosvg, encodes GIF+MP4(+WebM) via ffmpeg.
No headless browser, no JS runtime dependency — pure Python + cairosvg + ffmpeg.
Designed to be handed the real /assets PNGs (the 16-asset PENNIO pack) once available;
until then it renders pure-vector primitives that stand in for the same taxonomy role.
"""
import cairosvg, math, os, subprocess, json

ORANGE = "#F26522"
BG = "#050505"
W, H = 960, 320
FPS = 24

def ease_in_out(t):
    t = max(0, min(1, t))
    return 0.5 - 0.5 * math.cos(math.pi * t)

def ease_out(t):
    t = max(0, min(1, t)); return 1 - (1 - t) ** 3

def lerp(a, b, t): return a + (b - a) * t

def render(spec, outdir):
    frames_dir = os.path.join(outdir, "frames")
    os.makedirs(frames_dir, exist_ok=True)
    dur_ms = spec["duration_ms"]
    n = int(dur_ms / 1000 * FPS)
    for f in range(n):
        ms = f * 1000 / FPS
        svg = BUILDERS[spec["motion_type"]](spec, ms)
        cairosvg.svg2png(bytestring=svg.encode(), write_to=f"{frames_dir}/f{f:04d}.png", output_width=W, output_height=H)
    name = spec["id"]
    subprocess.run(["ffmpeg","-y","-framerate",str(FPS),"-i",f"{frames_dir}/f%04d.png",
                     "-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",
                     f"{outdir}/{name}.mp4"], check=True, capture_output=True)
    subprocess.run(["ffmpeg","-y","-framerate",str(FPS),"-i",f"{frames_dir}/f%04d.png",
                     "-vf","fps=18,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
                     f"{outdir}/{name}.gif"], check=True, capture_output=True)
    return f"{outdir}/{name}.mp4", f"{outdir}/{name}.gif"

# ---- motion builders: each returns one frame's SVG string ----

def b_orbit_rotate(spec, ms):
    t = (ms % spec["duration_ms"]) / spec["duration_ms"]
    ang = t * 360
    nodes = "".join(
        f'<circle cx="{160+60*math.cos(math.radians(ang+i*60)):.1f}" '
        f'cy="{160+60*math.sin(math.radians(ang+i*60)):.1f}" r="{6 if i==0 else 3}" '
        f'fill="{ORANGE if i==0 else "#3a3a3a"}"/>' for i in range(6))
    rings = "".join(f'<circle cx="480" cy="160" r="{40+r*24}" fill="none" stroke="rgba(242,101,34,{0.5-r*0.15:.2f})" stroke-width="1.5"/>' for r in range(3))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{BG}"/>
    <g transform="translate(320,0)"><circle cx="480" cy="160" r="4" fill="{ORANGE}"/>{rings}
    <g transform="translate(320,0)">{nodes}</g></g></svg>'''

def b_pulse_glow(spec, ms):
    t = (ms % spec["duration_ms"]) / spec["duration_ms"]
    r = 50 + 14 * math.sin(t * 2 * math.pi)
    op = 0.35 + 0.25 * math.sin(t * 2 * math.pi)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{BG}"/>
    <defs><radialGradient id="g"><stop offset="0%" stop-color="{ORANGE}" stop-opacity="{op:.2f}"/><stop offset="100%" stop-color="{ORANGE}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="{W/2}" cy="{H/2}" r="{r*3:.1f}" fill="url(#g)"/>
    <circle cx="{W/2}" cy="{H/2}" r="{r:.1f}" fill="{BG}" stroke="{ORANGE}" stroke-width="2"/></svg>'''

def b_bar_growth(spec, ms):
    t = ease_out((ms % spec["duration_ms"]) / spec["duration_ms"])
    bars = []
    heights = [40,90,60,140,75,110,50]
    for i, hmax in enumerate(heights):
        h = hmax * min(1, t * 1.6 - i * 0.08)
        h = max(0, h)
        x = W/2 - (len(heights)*26)/2 + i*26
        col = ORANGE if i == 3 else "#e8e8e8"
        bars.append(f'<rect x="{x:.1f}" y="{H/2+70-h:.1f}" width="18" height="{h:.1f}" fill="{col}"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{BG}"/>{''.join(bars)}</svg>'''

def b_wipe_reveal(spec, ms):
    t = ease_in_out(min(1, ms / spec["duration_ms"]))
    text = spec.get("label", "PENNIO.")
    clip_w = W * t
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{BG}"/>
    <clipPath id="c"><rect x="0" y="0" width="{clip_w:.1f}" height="{H}"/></clipPath>
    <text x="{W/2}" y="{H/2+20}" font-family="Arial" font-weight="700" font-size="72" fill="{ORANGE}" text-anchor="middle" clip-path="url(#c)">{text}</text></svg>'''

def b_ring_donut_pulse(spec, ms):
    t = (ms % spec["duration_ms"]) / spec["duration_ms"]
    scale = 1 + 0.08 * math.sin(t * 2 * math.pi)
    rot = t * 360
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{BG}"/>
    <g transform="translate({W/2},{H/2}) rotate({rot:.1f}) scale({scale:.3f})">
    <circle r="55" fill="none" stroke="{ORANGE}" stroke-width="16" stroke-dasharray="200 145.7"/></g></svg>'''

def b_grid_pulse(spec, ms):
    t = (ms % spec["duration_ms"]) / spec["duration_ms"]
    op = 0.15 + 0.12 * math.sin(t * 2 * math.pi)
    lines = []
    for i in range(0, W, 40):
        lines.append(f'<line x1="{i}" y1="0" x2="{i}" y2="{H}" stroke="rgba(255,255,255,{op:.2f})"/>')
    for j in range(0, H, 40):
        lines.append(f'<line x1="0" y1="{j}" x2="{W}" y2="{j}" stroke="rgba(255,255,255,{op:.2f})"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="{BG}"/>{''.join(lines)}</svg>'''

BUILDERS = {
    "orbit-rotate": b_orbit_rotate,
    "pulse-glow": b_pulse_glow,
    "bar-growth": b_bar_growth,
    "wipe-reveal": b_wipe_reveal,
    "ring-donut-pulse": b_ring_donut_pulse,
    "grid-pulse": b_grid_pulse,
}

if __name__ == "__main__":
    import sys
    catalog = json.load(open(sys.argv[1]))
    outdir = sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    rendered = []
    for spec in catalog:
        if spec.get("status") == "render_now" and spec["motion_type"] in BUILDERS:
            mp4, gif = render(spec, outdir)
            rendered.append(spec["id"])
            print("rendered:", spec["id"])
    print(f"\n{len(rendered)} rendered: {rendered}")
