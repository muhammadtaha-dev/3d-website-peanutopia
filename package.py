import os, shutil, zipfile

src = r"C:\Users\DELL\.zcode\workspace\default\peanutopia-site"
dst = r"C:\Users\DELL\.zcode\workspace\default\peanutopia-deploy"
zip_path = r"C:\Users\DELL\.zcode\workspace\default\peanutopia-site-deploy-ready.zip"

# clean rebuild of the deploy folder
if os.path.exists(dst):
    shutil.rmtree(dst)
os.makedirs(os.path.join(dst, "assets"))
os.makedirs(os.path.join(dst, "css"))
os.makedirs(os.path.join(dst, "js"))
os.makedirs(os.path.join(dst, "vendor"))

# root files
for f in ["index.html", "LICENSES.txt"]:
    shutil.copy2(os.path.join(src, f), os.path.join(dst, f))
for f in ["style.css"]:
    shutil.copy2(os.path.join(src, "css", f), os.path.join(dst, "css", f))
for f in ["main.js"]:
    shutil.copy2(os.path.join(src, "js", f), os.path.join(dst, "js", f))
shutil.copy2(os.path.join(src, "vendor", "three.module.js"), os.path.join(dst, "vendor", "three.module.js"))

# assets: compressed webp + favicon + refined jar wrap (skip the heavy source PNGs)
for f in sorted(os.listdir(os.path.join(src, "assets"))):
    if f.endswith(".webp") or f == "favicon.png" or f == "jar-wrap.jpg":
        shutil.copy2(os.path.join(src, "assets", f), os.path.join(dst, "assets", f))

# sanity: every asset referenced in the deployed files must exist
referenced = set()
for root, _, files in os.walk(dst):
    for fn in files:
        if fn.endswith((".html", ".js", ".css")):
            t = open(os.path.join(root, fn), encoding="utf-8").read()
            for token in t.split('"'):
                if token.startswith("assets/") or token.startswith("vendor/") or token.startswith("css/") or token.startswith("js/"):
                    referenced.add(token.split("?")[0])
missing = [r for r in sorted(referenced) if not os.path.exists(os.path.join(dst, r))]
print("referenced files:", len(referenced), "| missing:", missing or "none")

# zip it
if os.path.exists(zip_path):
    os.remove(zip_path)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(dst):
        for fn in files:
            full = os.path.join(root, fn)
            rel = os.path.relpath(full, os.path.dirname(dst))
            z.write(full, rel)

size = os.path.getsize(zip_path) / 1024
print(f"zip: {zip_path} ({size:.0f} KB)")
for root, _, files in os.walk(dst):
    for fn in sorted(files):
        p = os.path.join(root, fn)
        print(f"  {os.path.relpath(p, dst)}  {os.path.getsize(p)//1024} KB")
