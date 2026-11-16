"""Locomotion and performance curves for the three Blackwater characters."""
import math
from mathutils import Euler, Matrix, Vector


LEAD = {"shambler": .91, "shrieker": .98, "brute": .84}
CONTACT = {"shambler": .60, "shrieker": .56, "brute": .60}
CONTACT_FRAME = {"shambler": 18, "shrieker": 14, "brute": 24}


def mix(a, b, t):
    return a + (b - a) * t


def ease(t):
    t = max(0., min(1., t))
    return t*t*(3.-2.*t)


def value(t, keys):
    for (a, x), (b, y) in zip(keys, keys[1:]):
        if t <= b:
            return mix(x, y, ease((t-a)/(b-a)))
    return keys[-1][1]


def stance(t, fraction, length, lift, width, tap=0):
    if t < fraction:
        return width, -length*fraction/2 + t*length, .109 + tap*math.sin(t/fraction*math.pi)**2
    swing = (t-fraction)/(1-fraction)
    return width, mix(length*fraction/2, -length*fraction/2, ease(swing)), .109 + math.sin(math.pi*swing)**1.4*lift


def cycle(kind, t, sprint=False):
    shambler = kind == "shambler"
    slow = kind == "brute"
    a = math.tau*t
    lag = .18 if slow else .36
    step = math.cos(a)
    heavy = .018 if slow else .024
    reach = .58 if shambler else .37 if slow else .32
    if sprint:
        reach = -.08
    swing = .37 if sprint else .25 if shambler else .18
    length = 1.95 if sprint else LEAD[kind]
    left_t, right_t = t % 1., (t + (.43 if shambler else .5)) % 1.
    load = max(0., math.cos(a+.3))
    pose = {
        "root": (.068*step if shambler else .042*step, -.055 if sprint else 0,
                 (-.14 if sprint else -.052) + heavy*math.cos(2*a-.7) - (.044*load if shambler else 0)),
        "Hips": (.08 if sprint else .015, .07*math.sin(a), -.11*step),
        "Spine": (.46 if sprint else .23 if shambler else .16, .11*math.sin(a-lag), .095*math.cos(a-lag)),
        "Neck": (-.16 if sprint else -.065, -.06*math.sin(a-.62), -.058*math.cos(a-.55)),
        "Head": (-.16 if sprint else -.08, .038*math.sin(a-.72), -.04*math.cos(a-.63)),
        "Arm.L": (-reach + swing*math.sin(a-.56), .07, -.16),
        "Arm.R": (-reach - swing*math.sin(a-.37) - (.23 if shambler else 0), -.11, .18),
        "Fore.L": (-.55 if sprint else -.18+.20*math.sin(a-.25), 0, .05),
        "Fore.R": (-.68 if sprint else -.18-.24*math.sin(a-.4), 0, -.08),
        "Jaw": (-.20 if sprint else -.08-.065*math.sin(a)**2,0,0),
        "foot.L": stance(left_t, .60 if not sprint else .37, length, .115 if not sprint else .29, -.137),
        "foot.R": stance(right_t, .70 if shambler else .60 if not sprint else .37,
                         length, .037 if shambler else .12 if not sprint else .28, .137),
    }
    return pose


def idle(kind, t, cover=False):
    sway = math.sin(t*math.tau)
    lean = .31 if cover else .20 if kind == "shrieker" else .14
    return {
        "root": (.028*sway, .014*sway, (-.16 if cover else -.053) + .009*math.cos(t*math.tau)),
        "Spine": (lean, .07*math.sin(t*math.tau+.4), -.06),
        "Neck": (-.08, .11*sway, .055), "Head": (-.08, .08*sway, .055),
        "Arm.L": (-.44 if cover else -.25, .10, -.13), "Arm.R": (-.66 if cover else -.34, -.09, .14),
        "Fore.L": (-.33,0,0), "Fore.R": (-.19,0,0), "Jaw": (-.08-.09*sway**2,0,0),
        "foot.L": (-.155,-.108,.109), "foot.R": (.148,.142,.109),
    }


def shift_pose(kind, t, style):
    if style in ("BurstLoad", "Brake"):
        p = idle(kind, .26, True)
        pulse = math.sin(math.pi*t)**1.2
        p["root"] = (-.047*pulse, -.080*pulse if style=="BurstLoad" else -.14*pulse, -.10-.15*pulse)
        p["Spine"] = (.28+(.43 if style=="BurstLoad" else -.51)*pulse,.18*pulse,-.13*pulse)
        p["Jaw"] = (-.69*pulse-.09,0,0)
        p["Arm.L"] = (-.31-.60*pulse,0,-.17-.31*pulse)
        p["Arm.R"] = (-.63+.95*pulse,0,.17+.27*pulse)
        p["foot.L"] = (-.15,-.13-.25*ease(t),.109+.10*pulse)
        p["foot.R"] = (.18,.11,.109)
        return p
    if style in ("TurnL", "TurnR"):
        p = idle(kind, .12)
        side = -1 if style=="TurnL" else 1
        load = math.sin(math.pi*t)
        p["root"] = (side*.12*load,0,-.069-.07*load)
        p["Spine"] = (.24,-side*.39*load,side*.22*load)
        p["Neck"] = (-.15,-side*.31*load,0)
        p["foot."+("L" if side<0 else "R")] = (.15*side+.16*side*load, -.11*ease(t), .109+.09*load)
        return p
    p = cycle(kind, t*.50 + .07)
    pulse = math.sin(math.pi*t)**2
    if style == "Stumble":
        p["root"] = (-.16*pulse,-.11*pulse,-.10-.16*pulse)
        p["Spine"] = (.26+.62*pulse,.35*pulse,-.39*pulse)
        p["Arm.L"] = (-.59-1.05*pulse,0,-.14-.53*pulse)
        p["Arm.R"] = (-.65+.57*pulse,0,.19+.61*pulse)
        p["foot.L"] = (-.138-.16*pulse, -.07-.34*ease(t), .109+.09*pulse)
        p["foot.R"] = (.14,.17,.109+.025*pulse)
    return p


def strike(kind, t, ambush=False):
    contact = CONTACT[kind]
    load = value(t, [(0,0), (contact*.62,1), (contact,0), (1,0)])
    reach = value(t, [(0,0), (contact*.68,0), (contact,1), (1,0)])
    brute = kind == "brute"
    p = idle(kind, .36, ambush)
    p.update({
        "root": (.085*load-.074*reach, .08*load-.24*reach, -.075-.115*load-.09*reach),
        "Hips": (.04+.25*reach,-.25*load+.13*reach,-.13*load+.10*reach),
        "Spine": (.12-.36*load+.39*reach,.58*load-.32*reach,-.26*load+.20*reach),
        "Neck": (-.10+.28*load-.17*reach, .09*load, .13*load),
        "Head": (-.05+.16*load-.09*reach,.12*load,0),
        "Arm.L": (-.30+.22*load-reach*(.69 if brute else 1.10), .11, -.19-.21*load),
        "Arm.R": (-.37+.95*load-1.31*reach, -.29*load+.18*reach, .24+.43*load-.20*reach),
        "Fore.L": (-.32-.48*load+.29*reach,0,0), "Fore.R": (-.29-.86*load+.26*reach,0,0),
        "Jaw": (-.12-.52*reach,0,0),
        "foot.L": (-.15,-.105-.33*reach,.109+.055*math.sin(math.pi*reach)),
        "foot.R": (.18,.16,.109),
    })
    return p


def reaction(kind, t, direction, fall=False):
    side, push = {"Front": (0,1), "Back":(0,-1), "Left":(1,0),"Right":(-1,0)}[direction]
    shock = value(t, [(0,0),(.22,1),(.6,.29),(1,0)])
    p = idle(kind, 0)
    if not fall:
        p.update({
            "root": (side*.07*shock,.08*push*shock,-.055-.085*shock),
            "Spine": (-.35*push*shock+.14,side*.23*shock,side*.36*shock),
            "Neck": (-.38*push*shock,-side*.23*shock,-side*.17*shock),
            "Arm.L": (-.29+.78*shock,0,-.14-.49*shock),
            "Arm.R": (-.38+.42*shock,0,.16+.68*shock),
        })
        return p
    buckle = value(t, [(0,0),(.30,.63),(.62,1),(1,1)])
    tip = value(t, [(0,0),(.23,.02),(.51,.31),(.79,.93),(1,1)])
    # A side hit twists the hips before the torso and limbs come down.
    p.update({
        "root": (side*.48*tip, push*.49*tip, -.05-.72*buckle),
        "Hips": (-push*1.37*tip,side*.20*shock,side*1.38*tip),
        "Spine": (.16-.30*push*tip+.27*shock,side*.40*shock,side*.26*tip),
        "Neck": (-.30*push*shock,.15*side*shock,-.12*side*tip),
        "Head": (-.14*push*tip, .19*side, -.14*side*tip),
        "Thigh.L": (-.88*buckle+.58*tip,0,-.19*buckle), "Thigh.R": (-.63*buckle+.43*tip,0,.22*buckle),
        "Shin.L": (-1.36*buckle+.72*tip,0,0), "Shin.R": (-1.27*buckle+.40*tip,0,0),
        "Arm.L": (-.37-1.09*shock+.22*tip,0,-.23-.49*tip),
        "Arm.R": (-.51-.75*shock+.50*tip,0,.22+.61*tip),
        "Fore.L": (-.68*(1-tip),0,0), "Fore.R": (-.44*(1-tip),0,0),
    })
    p.pop("foot.L")
    p.pop("foot.R")
    return p


def clips(kind):
    count = CONTACT_FRAME[kind]
    attack_frames = round(count / CONTACT[kind])
    return [
        ("Idle",48,lambda t: idle(kind,t)),
        ("Cover",39,lambda t: idle(kind,t,True)),
        ("Walk",32 if kind=="shambler" else 28 if kind=="shrieker" else 36,lambda t: cycle(kind,t)),
        ("Start",13,lambda t: shift_pose(kind,t,"Start")),
        ("Stumble",24,lambda t: shift_pose(kind,t,"Stumble")),
        ("TurnL",15,lambda t: shift_pose(kind,t,"TurnL")),
        ("TurnR",15,lambda t: shift_pose(kind,t,"TurnR")),
        ("Brake",15,lambda t: shift_pose(kind,t,"Brake")),
        ("Attack",attack_frames,lambda t: strike(kind,t)),
        ("Ambush",attack_frames,lambda t: strike(kind,t,True)),
    ] + ([
        ("BurstLoad",11,lambda t: shift_pose(kind,t,"BurstLoad")),
        ("Sprint",22,lambda t: cycle(kind,t,True)),
    ] if kind=="shrieker" else []) + [
        (name+direction, n, lambda t, d=direction, fall=name=="Fall": reaction(kind,t,d,fall))
        for name,n in (("Hit",14),("Fall",36 if kind=="brute" else 29))
        for direction in ("Front","Back","Left","Right")
    ]


def apply_pose(rig, data, height_scale, width_scale, update):
    bones = rig.pose.bones
    for b in bones:
        b.rotation_mode = "QUATERNION"
        b.rotation_quaternion = Euler(data.get(b.name, (0,0,0)), "XYZ").to_quaternion()
        b.location = (0,0,0)
    root = Vector((data["root"][0]*width_scale,data["root"][1]*height_scale,data["root"][2]*height_scale))
    bones["Hips"].location = bones["Hips"].bone.matrix_local.to_quaternion().inverted() @ root
    update()
    for suffix in (".L", ".R"):
        if "foot"+suffix not in data:
            continue
        upper, lower, foot = (bones[name+suffix] for name in ("Thigh","Shin","Foot"))
        pos = data["foot"+suffix]
        hip = upper.head.copy()
        target = Vector((pos[0]*width_scale,pos[1]*height_scale,pos[2]*height_scale))
        offset = target - hip
        line = offset.normalized()
        a, b = upper.length, lower.length
        d = max(abs(a-b)+.002, min(a+b-.002, offset.length))
        reach = (d*d+a*a-b*b)/(2*d)
        pole = Vector((0,-1,0))
        pole = (pole-line*line.dot(pole)).normalized()
        knee = hip + line*reach + pole*math.sqrt(max(0,a*a-reach*reach))
        ankle = hip + line*d
        for bone, start, end in ((upper,hip,knee),(lower,knee,ankle),(foot,ankle,ankle+Vector((0,-.19,-.025)))):
            q = bone.bone.matrix_local.to_quaternion()
            aligned = (q @ Vector((0,1,0))).rotation_difference((end-start).normalized()) @ q
            bone.matrix = Matrix.Translation(start) @ aligned.to_matrix().to_4x4()
            update()
