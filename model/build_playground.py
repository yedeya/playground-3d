#!/usr/bin/env python3
"""Clean parametric model of the complete Wickey ArcticFlyer, built from the assembly manual.

Usage: build_playground.py <output_dir>
Writes speeltoestel.usda (natural colours), speeltoestel-modules.usda (one colour per manual module), parts.csv
and speeltoestel-web.json (triangles per part, for the web app).
All sizes are mm and come from the manual unless source == 'estimate'.
World axes: x runs along the house frames (slide at x<0, ladder at x>2190; the manual has them the other way round,
see SWAP_LADDER_SLIDE), y is up,
z runs from the swing (z<0) through house and bridge to the ship (z>2242).
"""
import csv, json, math, os, sys
from collections import Counter

OUT = sys.argv[1]
SWAP_LADDER_SLIDE = True   # user's choice: ladder and slide change ends compared with the manual
parts = []
M = 'manual'
E = 'estimate'

COLORS = {
    'post': (0.72, 0.56, 0.36), 'wall': (0.85, 0.70, 0.48), 'back': (0.78, 0.63, 0.42),
    'beam': (0.55, 0.40, 0.25), 'floor': (0.90, 0.78, 0.58), 'side': (0.80, 0.60, 0.40),
    'bow': (0.30, 0.55, 0.65), 'mast': (0.42, 0.32, 0.55), 'sail': (0.10, 0.25, 0.70),
    'hold': (0.20, 0.70, 0.35), 'handle': (0.85, 0.12, 0.12), 'canvas': (0.10, 0.25, 0.70),
    'hole': (0.05, 0.05, 0.08), 'belt': (0.12, 0.12, 0.12), 'slide': (0.10, 0.35, 0.75),
    'rope': (0.85, 0.82, 0.70), 'metal': (0.55, 0.55, 0.58), 'seat': (0.10, 0.10, 0.12),
}
MODULE_COLORS = {
    'A45': (0.86, 0.70, 0.45), 'A47': (0.55, 0.72, 0.42), 'B07': (0.93, 0.55, 0.15), 'C14': (0.95, 0.85, 0.20),
    'D42': (0.80, 0.20, 0.20), 'E24': (0.75, 0.30, 0.70), 'F34': (0.15, 0.40, 0.85), 'G01': (0.20, 0.75, 0.85),
    'G24': (0.10, 0.50, 0.20), 'G28': (0.15, 0.55, 0.55), 'H10': (0.98, 0.65, 0.65),
}


def sub(a, b): return [a[i] - b[i] for i in range(3)]
def add(a, b): return [a[i] + b[i] for i in range(3)]
def mul(a, s): return [v * s for v in a]
def dot(a, b): return sum(a[i] * b[i] for i in range(3))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def norm(a):
    n = math.sqrt(dot(a, a))
    return [v / n for v in a]


def prism(pid, kit, group, size, source, origin, u, v, poly, thick):
    """Extrude polygon poly (u,v coordinates, mm) by thick along u x v, centred on the uv plane."""
    n = norm(cross(u, v))
    ring = [add(add(origin, mul(u, a)), mul(v, b)) for a, b in poly]
    lo = [add(p, mul(n, -thick / 2)) for p in ring]
    hi = [add(p, mul(n, thick / 2)) for p in ring]
    faces = [list(reversed(lo)), hi]
    m = len(ring)
    for i in range(m):
        j = (i + 1) % m
        faces.append([lo[i], lo[j], hi[j], hi[i]])
    parts.append(dict(id=pid, kit=kit, group=group, size=size, source=source, faces=faces))


def box(pid, kit, group, size, source, x0, x1, y0, y1, z0, z1):
    """Axis-aligned box."""
    c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]
    a, b, t = x1 - x0, y1 - y0, z1 - z0
    poly = [(-a/2, -b/2), (a/2, -b/2), (a/2, b/2), (-a/2, b/2)]
    prism(pid, kit, group, size, source, c, [1, 0, 0], [0, 1, 0], poly, t)


def beam(pid, kit, group, size, source, p0, p1, height, thick):
    """Beam along p0->p1 with its height along world y."""
    axis = norm(sub(p1, p0))
    length = math.dist(p0, p1)
    up = norm(sub([0, 1, 0], mul(axis, axis[1])))
    poly = [(0, -height/2), (length, -height/2), (length, height/2), (0, height/2)]
    prism(pid, kit, group, size, source, p0, axis, up, poly, thick)
    return length


def merge(start, pid, kit, group, size, source):
    """Merge all parts added since index start into one logical part (ropes, slide, belts)."""
    faces = [f for p in parts[start:] for f in p['faces']]
    del parts[start:]
    parts.append(dict(id=pid, kit=kit, group=group, size=size, source=source, faces=faces))


def disc(pid, kit, group, size, source, centre, u, v, radius, thick):
    poly = [(radius * math.cos(2 * math.pi * i / 32), radius * math.sin(2 * math.pi * i / 32)) for i in range(32)]
    prism(pid, kit, group, size, source, centre, u, v, poly, thick)


# ---------------------------------------------------------------- A45 house
# Frames: posts have their 88 mm face in the frame plane; beams sit on the inside of the posts; planks on the outside.
LEN, DEP = 2190, 800
PW, PTH_Z = 88, 44
BEAM_LOW = (1092, 1180)    # step 1: 118 cm to the top of the lower beam
BEAM_UP = (1714, 1802)     # step 1: 71 cm from the top of the upper beam to the bottom of the lower beam
POSTS = [('B', 'A45-B BG-195', 0, 1950), ('A', 'A45-A BG-220', 692, 2190),
         ('A', 'A45-A BG-220', 1410, 2190), ('B', 'A45-B BG-195', LEN - PW, 1950)]


def frame_z(front, a, b):
    """z interval [a,b] measured inward from the outside post face of a frame."""
    return (DEP - b, DEP - a) if front else (a, b)


for f, front in enumerate((False, True)):
    tag = 'V' if front else 'A'   # V = bridge side frame, A = swing side frame
    for i, (_, kit, x0, h) in enumerate(POSTS):
        z0, z1 = frame_z(front, 0, PTH_Z)
        size = f'{h}x88x44'
        box(f'{tag}P{i+1}', kit, 'post', size, M, x0, x0 + PW, 0, h, z0, z1)
    z0, z1 = frame_z(front, PTH_Z, 2 * PTH_Z)
    box(f'{tag}L', 'A45-A BG-220', 'beam', '2190x88x44', M, 0, LEN, *BEAM_LOW, z0, z1)
    if front:
        for j, x in enumerate((0, LEN - 785)):
            box(f'{tag}B{j+1}', 'A45-D BK-78', 'beam', '785x68x44', M, x, x + 785, BEAM_UP[1] - 68, BEAM_UP[1], z0, z1)
    else:
        box(f'{tag}U', 'A45-A BG-220', 'beam', '2190x88x44', M, 0, LEN, *BEAM_UP, z0, z1)
    # Upright boards F: between the posts, lying against the outside of the beams.
    z0, z1 = frame_z(front, PTH_Z - 18, PTH_Z)
    bays = [(PW, 692, 3), (1498, LEN - PW, 3)]
    n = 0
    for lo, hi, cnt in bays:
        gap = (hi - lo - cnt * 140) / (cnt + 1)
        for k in range(cnt):
            x = lo + gap + k * (140 + gap)
            n += 1
            box(f'{tag}R{n}', 'A45-F B-71', 'side', '710x140x18', M, x, x + 140, BEAM_LOW[0], BEAM_LOW[0] + 710, z0, z1)
    if not front:
        for x in (780 + 50, 1410 - 50 - 140):   # step 2: 25 cm opening in the middle
            n += 1
            box(f'{tag}R{n}', 'A45-F B-71', 'side', '710x140x18', M, x, x + 140, BEAM_LOW[0], BEAM_LOW[0] + 710, z0, z1)
    # Bottom boards E: outside on the outer bays, inside on the middle bay (steps 2, 4, 5).
    z0, z1 = frame_z(front, -18, 0)
    box(f'{tag}E1', 'A45-E B-80', 'side', '800x140x18', M, 0, 800, 0, 140, z0, z1)
    box(f'{tag}E2', 'A45-E B-80', 'side', '800x140x18', M, LEN - 800, LEN, 0, 140, z0, z1)
    z0, z1 = frame_z(front, PTH_Z, PTH_Z + 18)
    box(f'{tag}E3', 'A45-E B-80', 'side', '800x140x18', M, 695, 1495, 0, 140, z0, z1)
    # Braces C, one under the deck at each post (step 7).
    for i, xc in enumerate((44, 736, 1454, LEN - 44)):
        y_low, s = 1180 - 255, 1 if not front else -1
        origin = [xc, y_low, PTH_Z if not front else DEP - PTH_Z]
        poly = [(0, 0), (s * 255, 255), (s * 131, 255), (0, 124)]
        prism(f'{tag}C{i+1}', 'A45-C BG-36', 'beam', '360x88x44', M, origin, [0, 0, 1], [0, 1, 0], poly, 44)

# End boards E at deck and ground level (step 5). Deck board stands 18 mm above the beam.
for i, (x0, x1) in enumerate(((-18, 0), (LEN, LEN + 18))):
    box(f'E{i+1}', 'A45-E B-80', 'side', '800x140x18', M, x0, x1, 0, 140, 0, DEP)
    box(f'E{i+3}', 'A45-E B-80', 'side', '800x140x18', M, x0, x1, 1058, 1198, 0, DEP)
# Floor F: 14 boards over the full length, equal gaps; the count is manual, the gap is derived.
gap = (LEN - 14 * 140) / 13
for i in range(14):
    x = i * (140 + gap)
    box(f'F{i+1}', 'A45-F B-71', 'floor', '710x140x18', M, x, x + 140, 1180, 1198, 45, 755)
# Canvas panels K and L on the outer bays of the bridge-side frame (step 8). Vertical position is an estimate.
for pid, kit, xc in (('L', 'A45-L canvas', 390), ('K', 'A45-K canvas', LEN - 390)):
    box(pid, kit, 'canvas', '700x590 in parts list, drawn about 700 high', E, xc - 350, xc + 350, 140, 840, DEP, DEP + 3)
for i, (fx, fy) in enumerate(((0.2, 0.2), (-0.2, -0.22))):   # openings as in the overview drawing: upper right, lower left
    disc(f'LG{i+1}', 'A45-L opening', 'hole', 'dia 280', E, [390 + fx * 700, 490 + fy * 700, DEP + 4], [1, 0, 0], [0, 1, 0], 140, 2)

# ---------------------------------------------------------------- F34 roof
# Two trusses outside the inner posts; ridge along z. 890 mm planes are flush with the truss faces.
c45 = math.sqrt(0.5)
XC, YT = 1095, 2537
for t, zc in enumerate((-22, DEP + 22)):
    for s, name in ((1, 'R'), (-1, 'L')):
        d, inner = (s * c45, -c45), (-s * c45, -c45)
        A = (XC, YT)
        B = (XC + d[0] * 700, YT + d[1] * 700)
        C = (B[0] + inner[0] * 68, B[1] + inner[1] * 68)
        D = (XC, YT - 96)
        prism(f'T{t+1}{name}', 'F34-A BK-70', 'beam', '700x68x44', M, [0, 0, zc], [1, 0, 0], [0, 1, 0], [A, B, C, D], 44)
    prism(f'T{t+1}B', 'F34-B BK-16', 'beam', '160x68x44', M, [0, 0, zc], [1, 0, 0], [0, 1, 0],
          [(XC - 80, YT - 176), (XC + 80, YT - 176), (XC, YT - 96)], 44)
for i, s in enumerate((1, -1)):
    d, out = [s * c45, -c45, 0], [s * c45, c45, 0]
    v = [0, 0, 1]
    p = [XC, YT, DEP / 2]
    prism(f'H{i+1}', 'F34-H plane', 'canvas', '590x890', M, add(p, mul(out, 1.5)), d, v,
          [(60, -445), (650, -445), (650, 445), (60, 445)], 3)
    prism(f'C{i+1}', 'F34-C B-89', 'floor', '890x140x18', M, add(p, mul(out, 12)), d, v,
          [(0, -445), (140, -445), (140, 445), (0, 445)], 18)

# ---------------------------------------------------------------- C14 ladder
ladder_start = len(parts)
top, foot_y = [-70, 1165], 34
run = math.sqrt(1400**2 - (top[1] - foot_y)**2)
foot = [top[0] - run, foot_y]
LZ = (145, 655)
for i, z in enumerate((LZ[0] + 22, LZ[1] - 22)):
    beam(f'S{i+1}', 'C14-A BK-140', 'beam', '1400x68x44', M, [foot[0], foot[1], z], [top[0], top[1], z], 68, 44)
ax = norm([top[0] - foot[0], top[1] - foot[1], 0])
upn = [-ax[1], ax[0], 0]
if upn[1] < 0: upn = mul(upn, -1)
for i in range(4):
    a = 240 + 250 * i + 34
    p = [foot[0] + ax[0] * a + upn[0] * 56, foot[1] + ax[1] * a + upn[1] * 56, 400]
    prism(f'T{i+1}', 'C14-B BK-51', 'floor', '510x68x44', M, p, ax, [0, 0, 1], [(-34, -255), (34, -255), (34, 255), (-34, 255)], 44)
# Two handles beside the ladder entry. Not shown in a module step, so the position is an estimate.
for i, z in enumerate((22, DEP - 22)):
    box(f'G{i+1}', 'handle', 'handle', 'handle', E, -45, 0, 1350, 1650, z - 15, z + 15)
ladder_end = len(parts)

# ---------------------------------------------------------------- E24 swing beam and D42 A-frame
XB = 648                # beam on the x<692 face of the inner post, swing-side frame (the ladder side in the manual)
BY0, BY1 = 1898, 1986   # beam height from the E24 elevation; agrees with the D42 leg and brace geometry
ZN, ZF = 66, 66 - 2200  # bolt hole is 44 mm from the end, through the 44 mm post
box('P', 'E24-A P-220', 'beam', '2200x88x88', M, XB - 44, XB + 44, BY0, BY1, ZF, ZN)
HOOKS = [ZF + 440, ZF + 440 + 540, ZF + 440 + 540 + 630]
for i, z in enumerate(HOOKS):
    box(f'F{i+1}', 'E24-F swing hook', 'metal', 'swing hook', M, XB - 18, XB + 18, BY0 - 45, BY0, z - 25, z + 25)
# Swing seat on the two hooks furthest from the house.
start = len(parts)
zs = (HOOKS[0] + HOOKS[1]) / 2
box('seat', 'seat', 'seat', 'seat', E, XB - 80, XB + 80, 400, 425, zs - 225, zs + 225)
for i, (zh, ze) in enumerate(((HOOKS[0], zs - 215), (HOOKS[1], zs + 215))):
    beam(f'r{i}', 'rope', 'rope', 'rope', E, [XB, BY0 - 45, zh], [XB, 425, ze], 12, 12)
merge(start, 'seat', 'E24 swing seat', 'seat', 'seat', E)
# Rope ladder on the hook nearest the house.
start = len(parts)
zh = HOOKS[2]
for i, dx in enumerate((-130, 130)):
    beam(f'a{i}', 'r', 'r', 'r', E, [XB, BY0 - 45, zh], [XB + dx, 1400, zh], 12, 12)
    box(f'b{i}', 'r', 'r', 'r', E, XB + dx - 6, XB + dx + 6, 300, 1400, zh - 6, zh + 6)
for i in range(5):
    y = 340 + i * 250
    box(f'c{i}', 'r', 'r', 'r', E, XB - 130, XB + 130, y, y + 25, zh - 12, zh + 12)
merge(start, 'rope_ladder', 'E24 rope ladder', 'rope', 'rope ladder', E)

BOLT_Y = BY0 - 34                # ledger top carries the beam
LEG_BELOW = 2190 - 61            # D42 step 1: bolt is 61 mm below the leg top
theta = math.acos(BOLT_Y / LEG_BELOW)
ZL0, ZL1 = ZF + 44, ZF + 44 + 88  # legs between the ledgers; beam end is flush with the far ledger (step 2)
ZLC = (ZL0 + ZL1) / 2
for i, s in enumerate((-1, 1)):
    bx = XB + s * 107            # 17 cm clear between 44 mm legs at the bolts
    foot_x = bx + s * LEG_BELOW * math.sin(theta)
    tip = [bx - s * 61 * math.sin(theta), BOLT_Y + 61 * math.cos(theta), ZLC]
    beam(f'L{i+1}', 'D42-A BG-220', 'post', '2190x88x44', M, [foot_x, 0, ZLC], tip, 44, 88)
for i, (z0, z1) in enumerate(((ZF, ZF + 44), (ZL1, ZL1 + 44))):
    box(f'C{i+1}', 'D42-C BK-34', 'beam', '340x68x44', M, XB - 170, XB + 170, BY0 - 68, BY0, z0, z1)
box('B', 'D42-B BG-13', 'beam', '130x88x44', M, XB - 65, XB + 65, BY0 - 44, BY0, ZL0, ZL1)
# Brace D: top edge 94 cm below the ledger, 1450 mm at its long edge.
ytop = BOLT_Y - 34 - 940
taper = 140 * math.tan(theta)
prism('D', 'D42-D B-145', 'side', '1450x140x18', M, [XB, ytop - 140, ZL0 - 9], [1, 0, 0], [0, 1, 0],
      [(-725, 0), (725, 0), (725 - taper, 140), (-725 + taper, 140)], 18)

# ---------------------------------------------------------------- A47 ship tower, G28 bow, G24 holds
XS, ZS = 695, 2242      # ship origin: tower centred on the bridge; bridge rails end flush with its first post pair
ship_start = len(parts)
W, D = 800, 800         # outer tower footprint: plank B-80 sits flush on the posts
PT, PD = 44, 88         # post thickness (x) and depth (z): BG-195 is 88 x 44
PL = 1950
PLANK, PTH = 140, 18    # B-series plank
DECK = 1160             # top of floor beams, A47 step 3

# Posts A47-A: A47 step 1 shows the 44 mm face toward the planks.
for pid, x0, z0 in (('P1', 0, 0), ('P2', W - PT, 0), ('P3', 0, D - PD), ('P4', W - PT, D - PD)):
    box(pid, 'A47-A BG-195', 'post', '1950x88x44', M, x0, x0 + PT, 0, PL, z0, z0 + PD)

# Climbing wall A47 step 2: 6 planks, top at 116 cm, equal gaps.
gap = (DECK - 6 * PLANK) / 5
for i in range(6):
    y = i * (PLANK + gap)
    box(f'W{i+1}', 'A47-E B-80', 'wall', '800x140x18', M, 0, W, y, y + PLANK, D, D + PTH)

# Back frame A47 step 1: 1 bottom plank, 4 upper planks; top of top plank 15 cm below post top.
box('R1', 'A47-E B-80', 'back', '800x140x18', M, 0, W, 0, PLANK, -PTH, 0)
top, low = PL - 150, DECK - PLANK
gap = (top - low - 4 * PLANK) / 3
for i in range(4):
    y = low + i * (PLANK + gap)
    box(f'R{i+2}', 'A47-E B-80', 'back', '800x140x18', M, 0, W, y, y + PLANK, -PTH, 0)

# Bottom side plank A47 step 3, on the bridge side, because the bow side stays open.
box('S1', 'A47-E B-80', 'side', '800x140x18', E, W, W + PTH, 0, PLANK, 0, D)

# Cross beams A47-C BK-80: inside the posts, 71 cm apart on the bow side, one on the bridge side.
BH = 68
box('C1', 'A47-C BK-80', 'beam', '800x68x44', M, PT, 2*PT, DECK - BH, DECK, 0, D)
box('C2', 'A47-C BK-80', 'beam', '800x68x44', M, PT, 2*PT, DECK + 710 - BH, DECK + 710, 0, D)
box('C3', 'A47-C BK-80', 'beam', '800x68x44', M, W - 2*PT, W - PT, DECK - BH, DECK, 0, D)

# Floor A47 step 4: 6 planks B-71 over the full depth including the wall planks.
span = D + 2 * PTH
x0 = (W - 710) / 2
for i in range(6):
    z = -PTH + i * span / 6
    box(f'F{i+1}', 'A47-F B-71', 'floor', '710x140x18', M, x0, x0 + 710, DECK, DECK + PTH, z, z + PLANK - 1)

# Bow side boards A47 step 5: 3 vertical B-71 between the posts, equal gaps.
inner = D - 2 * PD
gap = (inner - 3 * PLANK) / 4
for i in range(3):
    z = PD + gap + i * (PLANK + gap)
    box(f'V{i+1}', 'A47-F B-71', 'side', '710x140x18', M, PT - PTH, PT, DECK, DECK + 710, z, z + PLANK)

# Mast A47 step 8: pole stands on the floor against the inside of C2. Top should land on the 269 cm product height.
DECK_TOP = DECK + PTH
MAST = 1512
mx0, mx1 = 2*PT, 3*PT
box('M1', 'A47-B BG-151', 'mast', '1512x88x44', M, mx0, mx1, DECK_TOP, DECK_TOP + MAST, D/2 - PD/2, D/2 + PD/2)
# Yard A47 step 6: B-105 crosses the mast, its lower edge 112 cm above the mast foot.
yard_y = DECK_TOP + 1120
box('M2', 'A47-D B-105', 'mast', '1050x140x18', M, mx0 - PTH, mx0, yard_y, yard_y + PLANK, D/2 - 525, D/2 + 525)
# Sail A47 step 7 and canvas plan: 105 x 55 cm with a curved lower edge, simplified to straight segments.
prism('M3', 'A47-M canvas', 'sail', '1050x550', M, [mx0 - PTH - 1.5, yard_y + PLANK, D/2], [0, 0, 1], [0, 1, 0],
      [(-525, 0), (525, 0), (525, -550), (300, -440), (0, -420), (-300, -440), (-525, -550)], 3)
# Flag canvas plan: 20 x 35 cm triangle on the mast top, drawn in the z-y plane.
fy = DECK_TOP + MAST - 15
prism('M4', 'A47-N canvas', 'sail', '350x200', M, [mx1 + 2, fy, D/2 + PD/2],
      [0, 0, 1], [0, 1, 0], [(0, -200), (350, -100), (0, 0)], 3)

# Bow G28 steps 2-3. Beams start at the front and back posts and meet on the centre line.
HT = 44
BOW_Z = [HT/2, D - HT/2]
TZ = D / 2
LOW, UP = 770, 890
RISE = 740   # G28 step 3: 74 cm from the bottom of the lower beam to the top of the upper beam
dz = abs(BOW_Z[0] - TZ)
low_tip = -math.sqrt(LOW**2 - dz**2)
up_tip = -math.sqrt(UP**2 - dz**2)
for i, z in enumerate(BOW_Z):
    beam(f'B{i+1}', 'G28-B BK-76', 'bow', '770x68x44', M, [0, BH/2, z], [low_tip, BH/2, TZ], BH, HT)
    beam(f'B{i+3}', 'G28-A BK-89', 'bow', '890x68x44', M, [0, RISE - BH/2, z], [up_tip, RISE - BH/2, TZ], BH, HT)

# Stem G28-C: 1050 x 140 board on the centre line with its broad face to the side, leaning out over the beam tips.
y_low, y_up = BH / 2, RISE - BH / 2
lean = (up_tip - low_tip) / (y_up - y_low)
ang = math.atan(-lean)
ax = [-math.sin(ang), math.cos(ang), 0]
side = [math.cos(ang), math.sin(ang), 0]
foot = [low_tip + lean * (0 - y_low), 0, TZ]
L = 1050
prism('B5', 'G28-C B-105', 'bow', '1050x140x18', M, foot, side, ax, [(0, 0), (PLANK, 0), (PLANK, L), (0, L)], PTH)
head = add(add(foot, mul(ax, L - 50)), mul(side, PLANK / 2))

# Bow head G28 steps 7-9: B-30 plates on both sides of the stem. Placement is approximate.
for i, s in enumerate((-1, 1)):
    o = add(head, [0, 0, s * (PTH / 2 + PTH / 2)])
    prism(f'B{i+6}', 'G28-D B-30', 'bow', '300x140x18', E, o, side, ax,
          [(-190, -70), (110, -70), (110, 70), (-190, 70)], PTH)
prism('B8', 'G28-E B-19', 'bow', '190x140x18', E, add(head, mul(ax, 70)), side, ax,
      [(-95, 0), (95, 0), (40, 70), (-40, 70)], PTH)

# Climbing holds G24: heights follow the wall planks; x positions and colours are read from the user's photos.
HOLD_C = {'H1': (0.80, 0.68, 0.20), 'H2': (0.90, 0.50, 0.45), 'H3': (0.15, 0.45, 0.75), 'H4': (0.92, 0.65, 0.70), 'H5': (0.15, 0.55, 0.45)}
gap = (DECK - 6 * PLANK) / 5
for i, (name, xf, plank) in enumerate((('H1', .72, 5), ('H2', .35, 4), ('H3', .68, 3), ('H4', .35, 2), ('H5', .70, 1))):
    y = plank * (PLANK + gap) + PLANK / 2
    x = W * xf
    box(name, 'G24-D', 'hold', 'climbing stone', E, x - 35, x + 35, y - 40, y + 40, D + PTH, D + PTH + 45)
    parts[-1]['color'] = HOLD_C[name]

# Handles, two on the outer face of the wall posts above the deck. Position is an estimate from the photos.
for i, x in enumerate((PT / 2, W - PT / 2)):
    box(f'G{i+1}', 'handle', 'handle', 'handle', E, x - 15, x + 15, DECK + 150, DECK + 450, D, D + 45)



for p in parts[ship_start:]:
    p['faces'] = [[[XS + v[2], v[1], ZS + 800 - v[0]] for v in f] for f in p['faces']]

# ---------------------------------------------------------------- B07 bridge
Z0, Y0, Z1, Y1 = 770, 1180, ZS + 44, 1160   # belts clamp over the A45 lower beam and the A47 single cross beam
SAG = 200                                   # estimate: 190 cm belts minus the part wrapped around the beams
def bridge_pt(t):
    return [Z0 + (Z1 - Z0) * t, Y0 + (Y1 - Y0) * t - 4 * SAG * t * (1 - t)]
SAMPLES = [bridge_pt(i / 200) for i in range(201)]
arc = [0]
for a, b in zip(SAMPLES, SAMPLES[1:]):
    arc.append(arc[-1] + math.dist(a, b))
def at_arc(s):
    for i in range(200):
        if arc[i + 1] >= s:
            f = (s - arc[i]) / (arc[i + 1] - arc[i])
            a, b = SAMPLES[i], SAMPLES[i + 1]
            return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], norm([0, b[1] - a[1], b[0] - a[0]])
    return SAMPLES[-1], norm([0, 0, 1])
PITCH = 149     # 140 mm board + 9 mm spacer, B07 step 1
first = (arc[-1] - 9 * PITCH) / 2
for i in range(10):
    (z, y), t = at_arc(first + i * PITCH)
    n = norm(cross(t, [1, 0, 0]))
    if n[1] < 0: n = mul(n, -1)
    prism(f'T{i+1}', 'B07-B B-62', 'floor', '620x140x18', M, [1095, y + n[1] * 12, z + n[2] * 12], t, [1, 0, 0],
          [(-70, -310), (70, -310), (70, 310), (-70, 310)], 18)
for j, x in enumerate((1095 - 232, 1095 + 232)):   # B07 step 4: belt edge 60 mm from the board end, width estimated
    start = len(parts)
    for a, b in zip(SAMPLES[::8], SAMPLES[8::8]):
        beam(f'b{j}', 'r', 'r', 'r', E, [x, a[1], a[0]], [x, b[1], b[0]], 3, 36)
    merge(start, f'B{j+1}', 'B07-I belt', 'belt', '1900x36', E)
# Rails A inside the inner posts: 60 cm high, 80 mm gap (step 7). Rails sit on the bridge-facing inside of the posts.
RAIL_TOP = 1198 + 600
for i, x0 in enumerate((783, 1407 - 18)):
    for j, ytop in enumerate((RAIL_TOP, RAIL_TOP - 220)):
        box(f'R{i+1}{j+1}', 'B07-A B-153', 'side', '1530x140x18', M, x0, x0 + 18, ytop - 140, ytop, 756, 2286)

# ---------------------------------------------------------------- H10 shields
n = 0
for x in (783 - 2, 1407 - 18 - 2):
    for z in (756 + 510, 756 + 1020):
        n += 1
        disc(f'S{n}', 'H10-C shield', 'canvas', 'dia 280', M, [x, RAIL_TOP - 180, z], [0, 1, 0], [0, 0, 1], 140, 3)

# ---------------------------------------------------------------- G01 slide (shape estimated, length from product page)
start = len(parts)
PROFILE = [(-60, 1205), (120, 1180), (400, 980), (650, 800), (900, 680), (1150, 500), (1400, 340), (1600, 170), (1780, 110), (1840, 110)]
for a, b in zip(PROFILE, PROFILE[1:]):
    p0, p1 = [LEN + a[0], a[1], 400], [LEN + b[0], b[1], 400]
    beam('s', 'r', 'slide', 'r', E, p0, p1, 10, 500)
    for z in (165, 635):
        beam('s', 'r', 'slide', 'r', E, [p0[0], p0[1] + 45, z], [p1[0], p1[1] + 45, z], 90, 30)
merge(start, 'slide', 'G01-B slide', 'slide', '2200x500', E)

if SWAP_LADDER_SLIDE:
    # Both attach to identical house ends, so mirroring them about the house centre swaps them. Reversal keeps normals outward.
    for p in parts[ladder_start:ladder_end] + [parts[-1]]:
        p['faces'] = [[[LEN - v[0], v[1], v[2]] for v in reversed(f)] for f in p['faces']]


STOCK = {'P-220': 1, 'BG-220': 9, 'BG-195': 8, 'BG-151': 1, 'BG-36': 8, 'BG-13': 1, 'BK-140': 2, 'BK-89': 2, 'BK-80': 3,
         'BK-78': 2, 'BK-76': 2, 'BK-70': 4, 'BK-51': 4, 'BK-34': 2, 'BK-16': 2, 'B-153': 4, 'B-145': 1, 'B-105': 2,
         'B-89': 2, 'B-80': 22, 'B-71': 37, 'B-62': 10, 'B-30': 2, 'B-19': 1, 'handle': 4}


def check():
    """Compare the model against the manual's overall parts list (page 4) and the product page size."""
    c = Counter(p['kit'].split()[-1] for p in parts)
    bad = {k: (c[k], v) for k, v in STOCK.items() if c[k] != v}
    assert not bad, f'stock counts differ (model, manual): {bad}'
    vs = [v for p in parts for f in p['faces'] for v in f]
    ext = [(min(v[i] for v in vs), max(v[i] for v in vs)) for i in range(3)]
    wood = sum(v for k, v in STOCK.items() if k != 'handle')
    print(f'parts={len(parts)} wood={wood} stock_counts_match_manual=yes')
    print(f'x={ext[0][0]:.0f}..{ext[0][1]:.0f} ({ext[0][1]-ext[0][0]:.0f} mm, product 4870)')
    print(f'z={ext[2][0]:.0f}..{ext[2][1]:.0f} ({ext[2][1]-ext[2][0]:.0f} mm, product 5780)')
    low = [v[2] for v in vs if v[1] < 300]
    print(f'z at ground level (below 30 cm)={min(low):.0f}..{max(low):.0f} ({max(low)-min(low):.0f} mm)')
    print(f'y={ext[1][0]:.0f}..{ext[1][1]:.0f} (product 2690)')
    print(f'estimated_parts={sum(p["source"] == E for p in parts)} a_frame_angle={math.degrees(theta):.1f} deg')


def module_of(p):
    m = p['kit'].split('-')[0].split(' ')[0]
    return p.get('module') or (m if m in MODULE_COLORS else None)


def write_usda(path, by_module):
    f = open(path, 'w')
    f.write('#usda 1.0\n(\n    defaultPrim = "Playground"\n    metersPerUnit = 1\n    upAxis = "Y"\n)\n\ndef Xform "Playground"\n{\n')
    f.write('    def Scope "Materials"\n    {\n')
    mats = {}
    def mat(p):
        if by_module:
            return 'mat_' + p['module'], MODULE_COLORS[p['module']]
        if 'color' in p:
            return 'mat_' + p['module'] + '_' + p['id'], p['color']
        return 'mat_' + p['group'], COLORS[p['group']]
    for p in parts:
        name, col = mat(p)
        if name in mats: continue
        mats[name] = col
        r, g, b = col
        f.write(f"""        def Material "{name}"
        {{
            token outputs:surface.connect = </Playground/Materials/{name}/S.outputs:surface>
            def Shader "S"
            {{
                uniform token info:id = "UsdPreviewSurface"
                color3f inputs:diffuseColor = ({r}, {g}, {b})
                float inputs:roughness = 0.8
                float inputs:metallic = 0
                token outputs:surface
            }}
        }}
""")
    f.write('    }\n')
    for mod in MODULE_COLORS:
        f.write(f'    def Xform "{mod}"\n    {{\n')
        for p in parts:
            if p['module'] != mod: continue
            pts, counts, idx = [], [], []
            for face in p['faces']:
                counts.append(len(face))
                for v in face:
                    idx.append(len(pts))
                    pts.append(tuple(round(c / 1000, 5) for c in v))
            name, _ = mat(p)
            f.write(f"""        def Mesh "{mod}_{p['id']}" (
            prepend apiSchemas = ["MaterialBindingAPI"]
        )
        {{
            uniform token subdivisionScheme = "none"
            uniform bool doubleSided = 1
            int[] faceVertexCounts = {counts}
            int[] faceVertexIndices = {idx}
            point3f[] points = {str(pts).replace("'", "")}
            rel material:binding = </Playground/Materials/{name}>
        }}
""")
        f.write('    }\n')
    f.write('}\n')
    f.close()


def triangulate(face):
    """Ear-clip a planar polygon (it may be concave) into index triples."""
    n = [0, 0, 0]
    for i, a in enumerate(face):
        b = face[(i + 1) % len(face)]
        n = add(n, cross(a, b))
    n = norm(n)
    def inside(p, a, b, c):
        return all(dot(cross(sub(q, o), sub(p, o)), n) >= -1e-6 for o, q in ((a, b), (b, c), (c, a)))
    idx, tris = list(range(len(face))), []
    while len(idx) > 3:
        for k in range(len(idx)):
            i, j, l = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = face[i], face[j], face[l]
            if dot(cross(sub(b, a), sub(c, a)), n) <= 1e-6:
                continue
            if any(inside(face[m], a, b, c) for m in idx if m not in (i, j, l)):
                continue
            tris.append((i, j, l))
            idx.pop(k)
            break
        else:
            raise ValueError('polygon could not be triangulated')
    tris.append(tuple(idx))
    return tris


def write_web(path):
    """Triangle soup per part, in whole mm, for the phone viewer."""
    out = []
    for p in parts:
        tri = []
        for face in p['faces']:
            for t in triangulate(face):
                for i in t:
                    tri.extend(round(c) for c in face[i])
        col = p.get('color') or COLORS[p['group']]
        out.append(dict(id=f"{p['module']}_{p['id']}", module=p['module'], kit=p['kit'], group=p['group'], size=p['size'],
                        source=p['source'], natural=[round(c, 3) for c in col], tri=tri))
    with open(path, 'w') as f:
        json.dump(dict(parts=out, moduleColors={k: list(v) for k, v in MODULE_COLORS.items()}), f, separators=(',', ':'))


def write_csv(path):
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['id', 'module', 'manual_part', 'group', 'size_mm', 'source'])
        for p in parts:
            w.writerow([f"{p['module']}_{p['id']}", p['module'], p['kit'], p['group'], p['size'], p['source']])


# Assign modules; handles beside the ladder belong with C14 for transport, ship handles with A47.
for i, p in enumerate(parts):
    m = module_of(p)
    if m is None:
        m = 'A47' if i >= ship_start else 'C14'
    p['module'] = m
ids = Counter(f"{p['module']}_{p['id']}" for p in parts)
assert max(ids.values()) == 1, [k for k, v in ids.items() if v > 1]
check()
os.makedirs(OUT, exist_ok=True)
write_usda(os.path.join(OUT, 'speeltoestel.usda'), False)
write_usda(os.path.join(OUT, 'speeltoestel-modules.usda'), True)
write_csv(os.path.join(OUT, 'parts.csv'))
write_web(os.path.join(OUT, 'speeltoestel-web.json'))
