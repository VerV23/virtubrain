"""Turn the Higgsfield masters into web-ready media for the VirtuBrain site.

Usage: python3 scripts/process_media.py <masters-dir>
Masters come from the Higgsfield generation history (stills as 2560px webp, films as mp4, data as JSON).
Outputs go to public/media, public/data and src/media-catalog.json. Re-running is safe.
"""
import json, pathlib, subprocess, sys, shutil
from concurrent.futures import ThreadPoolExecutor
ROOT = pathlib.Path(__file__).resolve().parent.parent
M = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else ROOT / ".masters"
OUT = ROOT / "public/media"; DATA = ROOT / "public/data"
run = lambda *a: subprocess.run(a, check=True, capture_output=True)

# id -> (name, world, alt). world: dark | light | warm | people.  Alt text describes the image, not the brand.
STILLS = {
 "e8868e1d": None,
 "06ed7040": ("titanium-dial", "dark", "A precision dial machined from dark titanium, its single teal needle catching the light."),
 "089baa5a": ("three-channels", "dark", "Three milled channels in a dark aluminium block, each holding a row of glass spheres lit teal, amber and rose."),
 "0d8d19b3": ("manila-workshop", "people", "A Manila team workshop: a facilitator maps process steps on a glass wall of sticky notes while colleagues work at laptops."),
 "100772a7": ("controller-reconciliation", "people", "A finance controller's hands ticking off a printed reconciliation report beside a laptop."),
 "10936b77": ("blueprint-plate-1", "warm", "Fine blueprint linework of concentric circles on warm paper."),
 "15f6f50b": ("cafe-owner", "people", "A cafe and bakery owner in Manila checking orders on a tablet at her counter."),
 "1e14f885": ("lanes-still", "dark", "Blank tiles settled into three straight lanes, lit teal, cobalt and rose from beneath."),
 "3481269f": ("brass-notebook", "dark", "A navy clothbound notebook with a brass ruler resting across it."),
 "37cd9d4d": ("exploded-dial", "warm", "The rings and needle of a calibration dial laid out in an exploded arrangement on off-white paper."),
 "483b0e1f": ("atlas-diptych", "dark", "A tower of engraved glass plates above a macro of the flowchart etched into one plate."),
 "4893bc87": ("atlas-plate", "dark", "A single smoked-glass plate lying on a dark green-black surface."),
 "4b3d7db0": ("atlas-book", "dark", "Engraved glass plates bound along one edge like a book."),
 "4d19aa5b": ("brass-ruling-pen", "light", "A brass ruling pen drawing a fine line along a ruler on white ledger paper."),
 "50efb9d9": ("atlas-closed", "dark", "The closed stack of thirteen smoked-glass plates on a dark studio floor."),
 "55f2b31c": ("desk-bell", "dark", "A dark green service bell on a green-black surface."),
 "64ac85fa": ("ledger-texture", "dark", "Columnar ledger ruling in pale green lines on near-black."),
 "66d8c07e": ("teal-dial-slate", "dark", "A precision dial with a teal bezel resting on dark slate."),
 "6e2bef3f": ("brass-bars", "dark", "Three brass bars of different lengths on deep navy cloth."),
 "7b46c187": ("atlas-plate-square", "dark", "One smoked-glass plate at an angle on a dark surface."),
 "7b9d59ae": ("atlas-fanned", "dark", "Engraved glass plates fanned upright on a steel stand."),
 "7cd201ac": ("atlas-flowchart-macro", "dark", "Macro of a flowchart engraved in smoked glass, one path traced in red."),
 "7e77a056": ("monolith-closed", "light", "A closed monolith of stacked frosted-glass slabs on a pale grey studio sweep."),
 "7fe697b0": ("atlas-stepped", "dark", "Glass plates arranged in stepped tiers, each engraved with a process diagram."),
 "86082e2a": ("night-office", "people", "A shared-services operations floor in Metro Manila at night, rows of analysts at dual monitors."),
 "885070c0": ("tickmarks-1", "light", "Nine hand-drawn audit tick marks in black ink."),
 "88bfb554": ("maquette-city", "light", "A white architectural scale model of an abstract city seen from above."),
 "8987089d": ("limestone-tile", "light", "One blank limestone tile standing on a pale surface, a faint rose light beneath it."),
 "8bb334cf": ("monolith-exploded", "light", "The frosted monolith opened into evenly spaced levels lit teal, with a few fault lines glowing red."),
 "8bdd458d": ("brass-line", "dark", "A single brass rule laid across deep navy cloth."),
 "8d5d85db": ("ss-floor-dusk", "people", "Analysts at dual monitors on a shared-services floor at dusk, city towers beyond the windows."),
 "91f1a17a": ("ledger-glow", "dark", "A sheet of ledger paper on graphite whose far edge dissolves into a glowing teal grid."),
 "92230b3e": ("paper-dial", "warm", "A technical drawing of a calibration dial in teal and ink on warm paper."),
 "9909455c": ("blueprint-plate-2", "warm", "Dense radial blueprint linework on warm paper."),
 "9beb6ac5": ("team-workshop", "people", "A facilitator at a wall of sticky notes arranged as process steps, a small team around the table."),
 "aa764689": ("atlas-clipped", "dark", "A stack of engraved glass plates held by a steel binder clip."),
 "ae1adf1b": ("atlas-flowchart-wide", "dark", "Stacked glass plates engraved with flowcharts, one route traced in red."),
 "b2607b99": ("three-dials", "dark", "Three titanium dials of decreasing size in a row, each needle set differently."),
 "b46bc1f8": ("teal-dial-magnifier", "dark", "A precision dial with a teal bezel and a steel handle, tilted on dark slate."),
 "b6cab3f7": ("atlas-plate-wide", "dark", "A wide engraved glass plate, its flowchart lines glowing faintly."),
 "c424f1b1": ("atlas-tower", "dark", "Thirteen glass plates risen into an evenly spaced tower, engraved lines lit from within."),
 "c823e6c3": ("atlas-columns", "dark", "Three upright columns of engraved glass on a steel base."),
 "cbc761de": ("brass-bell", "dark", "A brass service bell beside a brass rule on navy cloth."),
 "cc3d7c68": ("limestone-ruler", "light", "A limestone tile resting on a slim teal-edged ruler."),
 "cffb9489": ("atlas-flowchart-angle", "dark", "Engraved flowcharts in stacked glass seen at a low angle."),
 "d5b617f2": ("brass-ruler", "dark", "Macro of a brass ruler's graduations on navy cloth."),
 "d5e8c433": ("glass-levels", "dark", "Six thin glass sheets levitating in even layers, each engraved with a teal grid."),
 "de70b5f1": ("titanium-line", "dark", "Brushed dark titanium crossed by a single thin line of teal light."),
 "e15eff67": ("cbd-aerial", "people", "A Southeast Asian business district at blue hour, office towers lit floor by floor."),
 "e216d3b2": ("tickmarks-2", "light", "Nine hand-drawn audit tick marks in black ink."),
 "e28d71b7": ("atlas-tower-tall", "dark", "A tall tower of engraved glass plates glowing faintly green."),
 "ec013883": ("atlas-blocks", "dark", "Three short stacks of engraved glass side by side."),
 "ecabd225": ("atlas-closed-low", "dark", "The closed glass stack seen low and from the front in a dark studio."),
 "f10e80c9": ("bakery-owner", "people", "A bakery owner smiling at a customer message on her phone behind the counter."),
 "fb68d533": ("paper-dial-portrait", "warm", "A technical drawing of a dial and needle on warm paper, portrait format."),
 "cffb9489x": None,
}
EXCLUDE = {"159a4a93", "8e7f17d2"}  # off-brand: belong to other projects
ICONS = {  # background-removed line icons -> taxonomy function id
 "1b1a14d0": "strategy-enterprise-planning", "26804de6": "product-service-development", "44d03c61": "procurement",
 "53c2c1d0": "asset-facilities-management", "62124331": "supply-chain-operations-logistics", "6bed11b2": "marketing-sales-cx",
 "7057c3c7": "finance-accounting", "8f802bcd": "information-technology-management", "b2dc0e71": "technology-specific-operations",
 "d1979def": "external-relations-esg", "db3606aa": "enterprise-risk-legal-compliance", "f6842328": "human-capital-management",
 "fe1b65eb": "retail-specific-operations", "f8eb7f15": "vb-monogram"}
FILMS = {  # scroll-scrubbed image sequences
 "e8868e1d": ("atlas", 1440, 720, "Thirteen smoked-glass plates rise from a closed stack into a lit tower."),
 "26703c46": ("monolith", 1276, 720, "A frosted-glass monolith opens into levels that light teal, with fault lines glowing red."),
 "7a3e8382": ("lanes", 1276, 720, "Scattered tiles drift into three ordered lanes lit teal, cobalt and rose."),
}
LOOPS = {"6e0f2cb1": ("dial", "A dial's needle sweeps slowly across its face."), "2b980431": ("office", "A slow move down a quiet shared-services floor at night.")}
FRAMES = 120
WIDTHS = [640, 1024, 1600, 2400]

def still(i, spec):
    name, world, alt = spec
    src = M / "still" / f"{i}.webp"
    w, h = map(int, subprocess.check_output(["identify", "-format", "%w %h", str(src)]).split())
    ws = [x for x in WIDTHS if x < w] + [min(w, 2400)]
    ws = sorted(set(ws))
    for x in ws:
        run("convert", str(src), "-resize", f"{x}x", "-strip", "-quality", "80" if x < 2000 else "76", str(OUT / "img" / f"{name}-{x}.webp"))
    return name, dict(w=w, h=h, widths=ws, world=world, alt=alt, src=f"/media/img/{name}")

def film(i, spec):
    name, dw, mw, alt = spec
    src = M / "video" / f"{i}.mp4"
    n = int(subprocess.check_output(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(src)]).strip())
    step = (n - 1) / (FRAMES - 1)
    tmp = ROOT / ".cache" / name; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir(parents=True)
    run("ffmpeg", "-v", "error", "-i", str(src), "-vsync", "0", str(tmp / "%04d.png"))
    picks = [round(k * step) + 1 for k in range(FRAMES)]
    for tag, width, q in (("d", dw, "70"), ("m", mw, "66")):
        d = OUT / "film" / name / tag; d.mkdir(parents=True, exist_ok=True)
        def one(args):
            k, p = args
            run("convert", str(tmp / f"{p:04d}.png"), "-resize", f"{width}x", "-strip", "-quality", q, str(d / f"{k:03d}.webp"))
        with ThreadPoolExecutor(8) as ex: list(ex.map(one, enumerate(picks)))
    run("convert", str(tmp / f"{picks[0]:04d}.png"), "-resize", f"{dw}x", "-quality", "74", str(OUT / "film" / name / "first.webp"))
    run("convert", str(tmp / f"{picks[-1]:04d}.png"), "-resize", f"{dw}x", "-quality", "74", str(OUT / "film" / name / "last.webp"))
    shutil.rmtree(tmp)
    h = round(dw * 9 / 16)
    return name, dict(frames=FRAMES, base=f"/media/film/{name}", desktop=dw, mobile=mw, alt=alt, aspect="16/9")

def loop(i, spec):
    name, alt = spec
    src = M / "video" / f"{i}.mp4"; d = OUT / "loop"
    run("ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", "-vf", "scale=1280:-2", "-c:v", "libx264", "-crf", "25", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(d / f"{name}.mp4"))
    run("ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", "-vf", "scale=1280:-2", "-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1", str(d / f"{name}.webm"))
    run("ffmpeg", "-v", "error", "-y", "-i", str(src), "-frames:v", "1", "-vf", "scale=1280:-2", str(d / f"{name}-poster.webp"))
    return name, dict(mp4=f"/media/loop/{name}.mp4", webm=f"/media/loop/{name}.webm", poster=f"/media/loop/{name}-poster.webp", alt=alt)

def icon(i, fid):
    src = M / "icon-cutout" / f"{i}.webp"
    run("convert", str(src), "-trim", "+repage", "-resize", "88x88", "-background", "none", "-gravity", "center", "-extent", "96x96", "-quality", "92", str(OUT / "icons" / f"{fid}.webp"))
    return fid, f"/media/icons/{fid}.webp"

if __name__ == "__main__":
    if "--icons-only" in sys.argv:
        (OUT / "icons").mkdir(parents=True, exist_ok=True)
        for i, f in ICONS.items(): icon(i, f)
        sys.exit(0)
    for p in ("img", "film", "loop", "icons"): (OUT / p).mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    cat = {"stills": {}, "films": {}, "loops": {}, "icons": {}}
    with ThreadPoolExecutor(6) as ex:
        for k, v in ex.map(lambda kv: still(*kv), [(i, s) for i, s in STILLS.items() if s and i not in EXCLUDE and (M / "still" / f"{i}.webp").exists()]): cat["stills"][k] = v
    for i, s in FILMS.items(): k, v = film(i, s); cat["films"][k] = v
    for i, s in LOOPS.items(): k, v = loop(i, s); cat["loops"][k] = v
    for i, f in ICONS.items(): k, v = icon(i, f); cat["icons"][k] = v
    for f in ("master-taxonomy.json", "pain-points.json"): shutil.copy(M / "data" / f, DATA / f)
    (ROOT / "src").mkdir(exist_ok=True)
    (ROOT / "src/media-catalog.json").write_text(json.dumps(cat, indent=1))
    print("stills", len(cat["stills"]), "films", list(cat["films"]), "loops", list(cat["loops"]), "icons", len(cat["icons"]))
